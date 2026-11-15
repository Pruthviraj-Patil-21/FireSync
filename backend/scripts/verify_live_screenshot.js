const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function verifyLiveScreenshot() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-screenshot-test',
    '--window-size=1440,900',
    'http://localhost:5173/map'
  ]);

  for (let i = 0; i < 20; i++) {
    await wait(300);
    try { if (await fetchJson('http://127.0.0.1:9222/json/version')) break; } catch (e) {}
  }

  const targets = await fetchJson('http://127.0.0.1:9222/json/list');
  const page = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CDPClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await wait(3500);

  // Apply explicit calculated height to p2 and trigger map.invalidateSize()
  const modResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement;
      const p2 = p1.parentElement;
      const p3 = p2.parentElement;

      // Apply height to p2
      p2.style.height = 'calc(100vh - 7rem)';
      p1.style.height = '100%';
      c.style.height = '100%';

      // Invalidate Leaflet size
      // We can find the leaflet map instance on window or dispatch resize
      window.dispatchEvent(new Event('resize'));

      return {
        p2Height: p2.clientHeight,
        cHeight: c.clientHeight,
        tileCount: document.querySelectorAll('.leaflet-tile').length,
        markerCount: document.querySelectorAll('.leaflet-overlay-pane path').length
      };
    })()`,
    returnByValue: true
  });

  console.log('MODIFICATION RESULT:', modResult.result.value);

  // Wait 2 seconds for Leaflet to render tiles and markers after resize
  await wait(2500);

  const afterWait = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tiles = Array.from(document.querySelectorAll('.leaflet-tile')).map(t => ({
        src: t.src,
        complete: t.complete,
        naturalWidth: t.naturalWidth,
        width: t.width,
        height: t.height
      }));
      const markers = document.querySelectorAll('.leaflet-overlay-pane path').length;
      return {
        tilesCount: tiles.length,
        tilesLoaded: tiles.filter(t => t.complete && t.naturalWidth > 0).length,
        markersCount: markers,
        sampleTile: tiles[0]
      };
    })()`,
    returnByValue: true
  });

  console.log('AFTER RESIZE & TILE FETCH:', JSON.stringify(afterWait.result.value, null, 2));

  // Take screenshot
  const screenshotData = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    quality: 95
  });

  const ssPath = path.join(__dirname, '..', '..', 'screenshot_repaired_live.png');
  fs.writeFileSync(ssPath, Buffer.from(screenshotData.data, 'base64'));
  console.log('SAVED SCREENSHOT TO:', ssPath);

  cdp.close();
  chrome.kill();
}

verifyLiveScreenshot().catch(console.error);

