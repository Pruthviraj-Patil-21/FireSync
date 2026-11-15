const { spawn } = require('child_process');
const http = require('http');

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

async function testCss() {
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-csstest',
    '--window-size=1440,900',
    'http://localhost:5173/map'
  ]);

  for (let i = 0; i < 20; i++) {
    await wait(300);
    try {
      const v = await fetchJson('http://127.0.0.1:9222/json/version');
      if (v) break;
    } catch (e) {}
  }

  const targets = await fetchJson('http://127.0.0.1:9222/json/list');
  const page = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CDPClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await wait(3500);

  // Test current state
  const r0 = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement; // absolute inset-0
      const p2 = p1.parentElement; // flex-1 w-full h-full relative min-h-0 bg-[#091124] overflow-hidden
      const p3 = p2.parentElement; // flex-1 min-h-0 relative flex overflow-hidden
      return {
        cHeight: c.clientHeight,
        p1Height: p1.clientHeight,
        p2Height: p2.clientHeight,
        p3Height: p3.clientHeight,
      };
    })()`,
    returnByValue: true
  });
  console.log('BEFORE CSS FIX:', r0.result.value);

  // Apply CSS fix:
  // p2 needs to stretch to fill p3. In flex row, p2 is a flex item.
  // If p2 has: `align-self: stretch; height: 100%;` or `display: flex; flex-direction: column;`
  // Let's test removing p1 or setting p2 styles:
  const r1 = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement;
      const p2 = p1.parentElement;
      const p3 = p2.parentElement;

      // Let's test style modifications:
      p2.style.height = '100%';
      p2.style.minHeight = '100%';
      p2.style.alignSelf = 'stretch';
      p3.style.alignItems = 'stretch';
      p3.style.height = '100%';

      // Also p1:
      p1.style.height = '100%';
      p1.style.width = '100%';
      c.style.height = '100%';
      c.style.width = '100%';

      return {
        cHeight: c.clientHeight,
        p1Height: p1.clientHeight,
        p2Height: p2.clientHeight,
        p3Height: p3.clientHeight,
      };
    })()`,
    returnByValue: true
  });
  console.log('AFTER ATTEMPT 1:', r1.result.value);

  // Test attempt 2:
  const r2 = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement;
      const p2 = p1.parentElement;
      const p3 = p2.parentElement;

      // What if p2 is directly position: relative, flex: 1, and c is absolute inset-0?
      p2.className = 'flex-1 min-w-0 relative h-full';
      p2.style.height = '';
      p1.className = 'absolute inset-0';
      p1.style.height = '';

      // Let's check window.getComputedStyle
      return {
        cHeight: c.clientHeight,
        p1Height: p1.clientHeight,
        p2Height: p2.clientHeight,
        p3Height: p3.clientHeight,
        p3ComputedHeight: window.getComputedStyle(p3).height,
        p2ComputedHeight: window.getComputedStyle(p2).height,
      };
    })()`,
    returnByValue: true
  });
  console.log('AFTER ATTEMPT 2:', r2.result.value);

  cdp.close();
  chromeProcess.kill();
}

testCss().catch(console.error);

