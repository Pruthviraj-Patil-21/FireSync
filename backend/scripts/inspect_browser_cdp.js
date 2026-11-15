const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_USER_DATA = 'C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-investigate';

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
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
          if (msg.error) {
            cb.reject(new Error(msg.error.message));
          } else {
            cb.resolve(msg.result);
          }
        } else if (msg.method) {
          const listeners = this.eventListeners.get(msg.method) || [];
          for (const l of listeners) l(msg.params);
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

  on(method, listener) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(listener);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runInvestigation() {
  console.log('>>> [1] Launching Headless Chrome on port 9222...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${TEMP_USER_DATA}`,
    '--window-size=1440,900',
    '--hide-scrollbars',
    'about:blank'
  ]);

  chromeProcess.on('error', (err) => {
    console.error('Failed to spawn Chrome:', err);
  });

  // Wait for CDP to respond
  let versionInfo = null;
  for (let i = 0; i < 20; i++) {
    await wait(400);
    try {
      versionInfo = await fetchJson('http://127.0.0.1:9222/json/version');
      if (versionInfo) break;
    } catch (e) {}
  }

  if (!versionInfo) {
    chromeProcess.kill();
    throw new Error('Chrome CDP port 9222 did not respond in time.');
  }

  console.log('>>> [2] Connected to Chrome:', versionInfo.Browser);

  // Get active targets/pages
  const targets = await fetchJson('http://127.0.0.1:9222/json/list');
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log('>>> [3] Target page WebSocket:', pageTarget.webSocketDebuggerUrl);

  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleLogs = [];
  const networkErrors = [];
  const networkRequests = [];

  // Enable domains
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  cdp.on('Runtime.consoleAPICalled', (params) => {
    const text = params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
    consoleLogs.push({ type: params.type, text });
    console.log(`[BROWSER CONSOLE] [${params.type.toUpperCase()}]`, text);
  });

  cdp.on('Runtime.exceptionThrown', (params) => {
    const text = params.exceptionDetails.text + ' ' + (params.exceptionDetails.exception?.description || '');
    consoleLogs.push({ type: 'EXCEPTION', text });
    console.error(`[BROWSER EXCEPTION]`, text);
  });

  cdp.on('Network.loadingFailed', (params) => {
    networkErrors.push(params);
    console.warn(`[NETWORK FAILED] URL: ${params.requestId} reason: ${params.errorText}`);
  });

  cdp.on('Network.responseReceived', (params) => {
    const url = params.response.url;
    if (url.includes('basemaps') || url.includes('arcgisonline') || url.includes('openstreetmap') || url.includes('fires')) {
      networkRequests.push({
        url,
        status: params.response.status,
        statusText: params.response.statusText,
        mime: params.response.mimeType,
      });
      console.log(`[NETWORK RESOURCE] ${params.response.status} ${url.slice(0, 75)}...`);
    }
  });

  console.log('>>> [4] Navigating to http://localhost:5173/map ...');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/map' });

  // Wait 4 seconds for full React mount and API data fetch
  console.log('>>> [5] Waiting 4 seconds for map lifecycle and tiles to settle...');
  await wait(4500);

  // Inspect DOM and computed styles
  console.log('>>> [6] Evaluating DOM structure, computed sizes, and layer elements...');
  const domEval = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const results = {};

      // 1. Check Leaflet container
      const container = document.querySelector('.leaflet-container');
      if (!container) {
        results.leafletContainerFound = false;
        results.bodyHtmlSnippet = document.body.innerHTML.slice(0, 1000);
        return results;
      }

      results.leafletContainerFound = true;
      const rect = container.getBoundingClientRect();
      const style = window.getComputedStyle(container);

      results.container = {
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        computed: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          position: style.position,
          zIndex: style.zIndex,
          background: style.background,
          width: style.width,
          height: style.height,
        }
      };

      // 2. Check parents up to body
      results.parents = [];
      let el = container.parentElement;
      while (el && el !== document.documentElement) {
        const pStyle = window.getComputedStyle(el);
        const pRect = el.getBoundingClientRect();
        results.parents.push({
          tagName: el.tagName,
          className: el.className ? (el.className.baseVal !== undefined ? el.className.baseVal : el.className) : '',
          id: el.id,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
          rect: { top: pRect.top, left: pRect.left, width: pRect.width, height: pRect.height },
          computed: {
            display: pStyle.display,
            height: pStyle.height,
            maxHeight: pStyle.maxHeight,
            minHeight: pStyle.minHeight,
            overflow: pStyle.overflow,
            position: pStyle.position,
            flex: pStyle.flex,
          }
        });
        el = el.parentElement;
      }

      // 3. Check tile pane & tiles
      const tilePane = document.querySelector('.leaflet-tile-pane');
      results.tilePaneFound = !!tilePane;
      if (tilePane) {
        const tiles = Array.from(tilePane.querySelectorAll('img.leaflet-tile'));
        results.tileCount = tiles.length;
        results.tilesSample = tiles.slice(0, 5).map(t => ({
          src: t.src,
          complete: t.complete,
          naturalWidth: t.naturalWidth,
          naturalHeight: t.naturalHeight,
          width: t.width,
          height: t.height,
          style: {
            display: t.style.display,
            visibility: t.style.visibility,
            opacity: t.style.opacity,
            transform: t.style.transform,
          }
        }));
      }

      // 4. Check markers & overlay pane
      const overlayPane = document.querySelector('.leaflet-overlay-pane');
      results.overlayPaneFound = !!overlayPane;
      if (overlayPane) {
        const paths = overlayPane.querySelectorAll('path');
        results.markerPathCount = paths.length;
      }

      // 5. Check if any overlay covers the map center
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtCenter = document.elementFromPoint(centerX, centerY);
      results.elementAtCenter = elementAtCenter ? {
        tagName: elementAtCenter.tagName,
        className: elementAtCenter.className ? (elementAtCenter.className.baseVal !== undefined ? elementAtCenter.className.baseVal : elementAtCenter.className) : '',
        id: elementAtCenter.id
      } : null;

      return results;
    })()`,
    returnByValue: true
  });

  console.log('>>> [7] DOM Evaluation Result:');
  console.log(JSON.stringify(domEval.result.value, null, 2));

  // 6. Capture screenshot
  console.log('>>> [8] Capturing screenshot of the live page...');
  const screenshotData = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    quality: 90
  });

  const screenshotPath = path.join(__dirname, '..', '..', 'screenshot_firemap_browser_live.png');
  fs.writeFileSync(screenshotPath, Buffer.from(screenshotData.data, 'base64'));
  console.log(`>>> [9] Screenshot saved to ${screenshotPath}`);

  // Save diagnostic report JSON
  const diagPath = path.join(__dirname, '..', '..', 'browser_diagnostics.json');
  fs.writeFileSync(diagPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    version: versionInfo,
    consoleLogs,
    networkErrors,
    networkRequests,
    domEval: domEval.result.value
  }, null, 2));
  console.log(`>>> [10] Diagnostics JSON saved to ${diagPath}`);

  cdp.close();
  chromeProcess.kill();
  console.log('>>> [11] Investigation finished successfully.');
}

runInvestigation().catch(err => {
  console.error('Fatal error during browser investigation:', err);
  process.exit(1);
});

