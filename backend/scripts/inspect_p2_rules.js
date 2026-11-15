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
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-rules',
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
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  await wait(3000);

  const doc = await cdp.send('DOM.getDocument');
  const cNode = await cdp.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '.leaflet-container'
  });

  // Get parent (p1)
  const p1Node = await cdp.send('DOM.resolveNode', { nodeId: cNode.nodeId });
  // Evaluate p2 nodeId
  const p2Eval = await cdp.send('Runtime.evaluate', {
    expression: 'document.querySelector(".leaflet-container").parentElement.parentElement'
  });
  const p2Node = await cdp.send('DOM.requestNode', { objectId: p2Eval.result.objectId });

  const matchedStyles = await cdp.send('CSS.getMatchedStylesForNode', { nodeId: p2Node.nodeId });

  console.log('P2 MATCHED CSS RULES:');
  for (const match of matchedStyles.matchedCSSRules || []) {
    const sel = match.rule.selectorList.text;
    const props = match.rule.style.cssProperties
      .filter(p => p.name.includes('height') || p.name.includes('flex') || p.name.includes('display') || p.name.includes('position'))
      .map(p => `${p.name}: ${p.value};`);
    if (props.length > 0) {
      console.log(`  Rule: [${sel}] => ${props.join(' ')}`);
    }
  }

  // Also check inline style of p2
  console.log('P2 INLINE STYLE:', matchedStyles.inlineStyle?.cssText);

  cdp.close();
  chrome.kill();
}

run().catch(console.error);

