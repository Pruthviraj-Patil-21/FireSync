const { spawn } = require('child_process');
const http = require('http');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function check() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-marker-test2',
    '--window-size=1440,900',
    'http://localhost:5173/map'
  ]);
  for (let i = 0; i < 20; i++) {
    await wait(300);
    try { if (await fetchJson('http://127.0.0.1:9222/json/version')) break; } catch (e) {}
  }
  const targets = await fetchJson('http://127.0.0.1:9222/json/list');
  const page = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = Math.floor(Math.random() * 100000);
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === id) { ws.removeEventListener('message', handler); resolve(msg.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Poll marker count every 500ms for 10 seconds
  for (let step = 1; step <= 15; step++) {
    await wait(600);
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const paths = document.querySelectorAll('.leaflet-overlay-pane path').length;
        const liveText = document.body.innerText.match(/\\d+ OF \\d+ DETECTIONS/);
        const mapSize = {
          w: document.querySelector('.leaflet-container')?.clientWidth,
          h: document.querySelector('.leaflet-container')?.clientHeight
        };
        return { step: ${step}, paths, liveText: liveText ? liveText[0] : null, mapSize };
      })()`,
      returnByValue: true
    });
    console.log(r.result.value);
    if (r.result.value && r.result.value.paths > 0) {
      console.log('MARKERS RENDERED SUCCESSFULLY!');
      break;
    }
  }

  ws.close();
  chrome.kill();
}
check().catch(console.error);

