const { spawn } = require('child_process');
const http = require('http');

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function verifyOverviewGlobe() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-globe-test2',
    '--window-size=1440,900',
    'http://localhost:5173/'
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

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await wait(3500);

  const globeEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      return {
        canvasFound: !!canvas,
        canvasWidth: canvas ? canvas.clientWidth : 0,
        canvasHeight: canvas ? canvas.clientHeight : 0,
        url: window.location.pathname
      };
    })()`,
    returnByValue: true
  });
  console.log('OVERVIEW 3D GLOBE CHECK:', globeEval.result.value);

  ws.close();
  chrome.kill();
}
verifyOverviewGlobe().catch(console.error);
