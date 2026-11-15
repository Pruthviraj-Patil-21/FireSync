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

async function run() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-fixeval2',
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

  await wait(3000);

  const testResults = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement;
      const p2 = p1.parentElement;
      const p3 = p2.parentElement;

      const outcomes = {};

      // Baseline
      outcomes.baseline = { c: c.clientHeight, p1: p1.clientHeight, p2: p2.clientHeight, p3: p3.clientHeight };

      // Change 1: In CSS, if p3 is display: flex, what if p2 has style "height: 100%" AND p3 has style "height: 100%"?
      // Wait, what is p3's parent?
      const p4 = p3.parentElement; // h-[calc(100vh-4rem)]
      outcomes.p4Height = p4.clientHeight;

      // In CSS, percentage height works when ALL ancestors up to fixed height have height: 100%!
      // p4 has height: 740px.
      // p3 has flex: 1, but NO height!
      // If we give p3: height: 100%!
      p3.style.height = '100%';
      p2.style.height = '100%';
      outcomes.afterP3P2Height100 = { c: c.clientHeight, p1: p1.clientHeight, p2: p2.clientHeight, p3: p3.clientHeight };

      // Change 2: What if p2 is directly style="flex: 1; display: flex; flex-direction: column;"?
      p2.style.height = '';
      p2.style.display = 'flex';
      p2.style.flexDirection = 'column';
      p1.style.position = 'relative';
      p1.style.flex = '1';
      p1.style.display = 'flex';
      p1.style.flexDirection = 'column';
      c.style.flex = '1';
      outcomes.afterFlexColumn = { c: c.clientHeight, p1: p1.clientHeight, p2: p2.clientHeight, p3: p3.clientHeight };

      // Change 3: What if p2 is style="position: absolute; inset: 0; left: 288px;"?
      // Notice: p3 has position: relative!
      // If p2 is position: relative, flex: 1, min-height: 100%:
      p2.style.minHeight = '100%';
      p2.style.height = '100%';
      outcomes.afterMinHeight100 = { c: c.clientHeight, p1: p1.clientHeight, p2: p2.clientHeight, p3: p3.clientHeight };

      return outcomes;
    })()`,
    returnByValue: true
  });

  console.log('TEST OUTCOMES:');
  console.log(JSON.stringify(testResults.result.value, null, 2));

  cdp.close();
  chrome.kill();
}

run().catch(console.error);

