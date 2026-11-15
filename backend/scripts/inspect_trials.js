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
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-find-property',
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

      const trials = [];

      function check(label) {
        trials.push({
          label,
          p2Height: p2.clientHeight,
          cHeight: c.clientHeight,
          p2Computed: window.getComputedStyle(p2).height,
          cComputed: window.getComputedStyle(c).height,
        });
      }

      check('0. Baseline');

      // Trial 1: remove 'h-full' class
      p2.classList.remove('h-full');
      check('1. remove h-full class');

      // Trial 2: remove 'w-full' class
      p2.classList.remove('w-full');
      check('2. remove w-full class');

      // Trial 3: remove 'min-h-0' class
      p2.classList.remove('min-h-0');
      check('3. remove min-h-0 class');

      // Trial 4: reset classes, test style.height = '689px'
      p2.className = 'flex-1 relative bg-[#091124] overflow-hidden';
      check('4. className = flex-1 relative bg-[#091124] overflow-hidden');

      // Trial 5: What if p3 has align-items: stretch?
      p3.style.alignItems = 'stretch';
      check('5. p3 alignItems = stretch');

      // Trial 6: What if p2 has align-self: stretch?
      p2.style.alignSelf = 'stretch';
      check('6. p2 alignSelf = stretch');

      // Trial 7: What if p2 has flex: 1 1 auto?
      p2.style.flex = '1 1 auto';
      check('7. p2 flex = 1 1 auto');

      // Trial 8: What if p2 is style="height: 100% !important"?
      p2.style.setProperty('height', '100%', 'important');
      check('8. p2 height = 100% !important');

      // Trial 9: What if p3 has height: 100%?
      p3.style.height = '100%';
      check('9. p3 height = 100% + p2 height = 100% !important');

      // Trial 10: What if p2 has style="height: 100vh"?
      p2.style.height = '100vh';
      check('10. p2 height = 100vh');

      // Trial 11: What if p2 has style="height: 100% and p3 has style="height: 689px"?
      p3.style.height = '689px';
      p2.style.height = '100%';
      check('11. p3 height = 689px + p2 height = 100%');

      // Trial 12: What if p2 has style="height: calc(100vh - 6.5rem)"?
      p2.style.height = 'calc(100vh - 6.5rem)';
      check('12. p2 height = calc(100vh - 6.5rem)');

      return trials;
    })()`,
    returnByValue: true
  });

  console.log('TRIALS:');
  console.log(JSON.stringify(testResults.result.value, null, 2));

  cdp.close();
  chrome.kill();
}

run().catch(console.error);

