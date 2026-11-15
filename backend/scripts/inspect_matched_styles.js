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

async function inspectStyles() {
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-styles',
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
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  await wait(3500);

  const doc = await cdp.send('DOM.getDocument');
  const leafletNode = await cdp.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '.leaflet-container'
  });

  const parent1 = await cdp.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '.leaflet-container'
  });

  // Let's use Runtime.evaluate to get details of all elements in the chain:
  const inspection = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const chain = [];
      let cur = c;
      while (cur && cur !== document.body) {
        chain.push({
          tag: cur.tagName,
          classes: cur.className,
          styleAttr: cur.getAttribute('style'),
          offsetHeight: cur.offsetHeight,
          clientHeight: cur.clientHeight,
          scrollHeight: cur.scrollHeight,
          computedHeight: window.getComputedStyle(cur).height,
          computedMinHeight: window.getComputedStyle(cur).minHeight,
          computedMaxHeight: window.getComputedStyle(cur).maxHeight,
          computedPosition: window.getComputedStyle(cur).position,
          computedDisplay: window.getComputedStyle(cur).display,
          computedFlex: window.getComputedStyle(cur).flex,
          computedAlignSelf: window.getComputedStyle(cur).alignSelf,
          computedAlignItems: window.getComputedStyle(cur).alignItems,
        });
        cur = cur.parentElement;
      }
      return chain;
    })()`,
    returnByValue: true
  });

  console.log('DOM ANCESTOR CHAIN:');
  console.log(JSON.stringify(inspection.result.value, null, 2));

  // Let's test what happens if we set inline height on each element from body downwards
  const fixExperiment = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.leaflet-container');
      const p1 = c.parentElement;
      const p2 = p1.parentElement;
      const p3 = p2.parentElement;

      // What if p2 has style="height: 500px !important;"?
      p2.style.setProperty('height', '500px', 'important');
      p2.style.setProperty('min-height', '500px', 'important');

      return {
        afterP2Important500: {
          p2ClientHeight: p2.clientHeight,
          p2ComputedHeight: window.getComputedStyle(p2).height,
          cClientHeight: c.clientHeight,
          cComputedHeight: window.getComputedStyle(c).height
        }
      };
    })()`,
    returnByValue: true
  });

  console.log('EXPERIMENT:');
  console.log(JSON.stringify(fixExperiment.result.value, null, 2));

  cdp.close();
  chromeProcess.kill();
}

inspectStyles().catch(console.error);

