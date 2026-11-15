const { spawn } = require('child_process');
const http = require('http');

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

async function testExact() {
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-testexact',
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

  const evalTest = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement; // <div class="absolute inset-0 w-full h-full">
      const p2 = p1.parentElement; // <div class="flex-1 w-full h-full relative min-h-0 bg-[#091124] overflow-hidden">
      const p3 = p2.parentElement; // <div class="flex-1 min-h-0 relative flex overflow-hidden">

      const results = {};

      results.initial = {
        c: c.getBoundingClientRect(),
        p1: p1.getBoundingClientRect(),
        p2: p2.getBoundingClientRect(),
        p3: p3.getBoundingClientRect(),
      };

      // Test 1: Remove p1 (no absolute wrapper, put MapContainer directly inside p2 with style flex: 1)
      // Or test what happens if p2 has style: 'position: relative; flex: 1 1 0%; height: 100%'
      // Wait, why did p2 have height 0?
      // Let's inspect p2's inline styles and computed styles:
      results.p2Computed = {
        display: window.getComputedStyle(p2).display,
        height: window.getComputedStyle(p2).height,
        alignSelf: window.getComputedStyle(p2).alignSelf,
      };

      // Let's test Option A:
      // In CSS, if p2 is a flex child, what if p2 has style 'height: 100%'? It failed earlier because p3 height was not 100%.
      // What if p3 has style 'height: 100%'?
      p3.style.height = '100%';
      p2.style.height = '100%';
      results.testOptionA = {
        p3Height: p3.clientHeight,
        p2Height: p2.clientHeight,
        p1Height: p1.clientHeight,
        cHeight: c.clientHeight,
      };

      // Test Option B:
      // What if we remove p1 entirely, and p2 is 'flex-1 relative flex flex-col', and MapContainer has style 'flex: 1'?
      p1.style.position = 'static';
      p1.style.display = 'flex';
      p1.style.flexDirection = 'column';
      p1.style.flex = '1';
      p2.style.display = 'flex';
      p2.style.flexDirection = 'column';
      c.style.flex = '1';

      results.testOptionB = {
        p3Height: p3.clientHeight,
        p2Height: p2.clientHeight,
        p1Height: p1.clientHeight,
        cHeight: c.clientHeight,
      };

      // Test Option C:
      // What if p3 has height calc(100vh - 6.5rem) or flex-1 flex flex-row h-full?
      // Let's see what happens if p2 has position: relative; flex: 1 1 0%; and p1 is position: absolute; top: 0; bottom: 0; left: 0; right: 0;:
      p1.style.position = 'absolute';
      p1.style.top = '0';
      p1.style.bottom = '0';
      p1.style.left = '0';
      p1.style.right = '0';
      p2.style.position = 'relative';
      p2.style.flex = '1';

      results.testOptionC = {
        p3Height: p3.clientHeight,
        p2Height: p2.clientHeight,
        p1Height: p1.clientHeight,
        cHeight: c.clientHeight,
      };

      return results;
    })()`,
    returnByValue: true
  });

  console.log('RESULTS:', JSON.stringify(evalTest.result.value, null, 2));

  cdp.close();
  chromeProcess.kill();
}

testExact().catch(console.error);
