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
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
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
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, []);
    this.eventListeners.get(method).push(listener);
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function runE2E() {
  console.log('=== STARTING 9-POINT E2E BROWSER VERIFICATION ===');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\\Users\\PRUTHVIRAJ\\AppData\\Local\\Temp\\chrome-cdp-e2e',
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

  const consoleLogs = [];
  const networkErrors = [];

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  cdp.on('Runtime.consoleAPICalled', p => {
    const text = p.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
    consoleLogs.push({ type: p.type, text });
  });

  cdp.on('Runtime.exceptionThrown', p => {
    const text = p.exceptionDetails.text + ' ' + (p.exceptionDetails.exception?.description || '');
    consoleLogs.push({ type: 'EXCEPTION', text });
  });

  cdp.on('Network.loadingFailed', p => {
    networkErrors.push(p);
  });

  console.log('\n--- CHECK 1: Fresh Load of /map in Browser ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/map' });
  
  // Wait for React + API data + Leaflet tiles to load
  let check1Result = null;
  for (let i = 0; i < 12; i++) {
    await wait(600);
    const evalRes = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const container = document.querySelector('.leaflet-container');
        const tiles = Array.from(document.querySelectorAll('.leaflet-tile'));
        const loadedTiles = tiles.filter(t => t.complete && t.naturalWidth > 0);
        const markers = document.querySelectorAll('.leaflet-overlay-pane path');
        const liveText = document.body.innerText.match(/\\d+ OF \\d+ DETECTIONS/);
        return {
          containerFound: !!container,
          containerWidth: container ? container.clientWidth : 0,
          containerHeight: container ? container.clientHeight : 0,
          totalTiles: tiles.length,
          loadedTiles: loadedTiles.length,
          sampleTileSrc: loadedTiles[0] ? loadedTiles[0].src : null,
          markersRendered: markers.length,
          detectionCounterText: liveText ? liveText[0] : null
        };
      })()`,
      returnByValue: true
    });
    check1Result = evalRes.result.value;
    if (check1Result && check1Result.loadedTiles > 0 && check1Result.markersRendered > 0) {
      break;
    }
  }
  const check1 = { result: { value: check1Result } };
  console.log('Check 1 (Initial Load & Dimensions):', JSON.stringify(check1.result.value, null, 2));

  // Save screenshot of initial working map
  const ss1 = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 95 });
  const ss1Path = path.join(__dirname, '..', '..', 'screenshot_map_working_initial.png');
  fs.writeFileSync(ss1Path, Buffer.from(ss1.data, 'base64'));
  console.log('Saved Screenshot 1:', ss1Path);

  console.log('\n--- CHECK 2 & 3: Visible Geographic Features & Tiles ---');
  console.log(`Tiles Loaded: ${check1.result.value.loadedTiles} of ${check1.result.value.totalTiles}`);
  console.log(`Leaflet Viewport Height: ${check1.result.value.containerHeight}px (MUST BE > 0)`);

  console.log('\n--- CHECK 4: Hotspot Markers Rendered ---');
  console.log(`Hotspot SVG Markers in Leaflet Pane: ${check1.result.value.markersRendered}`);

  console.log('\n--- CHECK 5: Zooming and Dragging Map Interactions ---');
  const zoomTest = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // Click Leaflet Zoom In button (.leaflet-control-zoom-in)
      const zoomInBtn = document.querySelector('.leaflet-control-zoom-in');
      if (zoomInBtn) zoomInBtn.click();
      return { clickedZoomIn: !!zoomInBtn };
    })()`,
    returnByValue: true
  });
  await wait(1500);

  const checkZoom = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tiles = document.querySelectorAll('.leaflet-tile').length;
      return { tilesAfterZoom: tiles };
    })()`,
    returnByValue: true
  });
  console.log('Check 5 (Zoom Interaction):', checkZoom.result.value);

  console.log('\n--- CHECK 6: Basemap Selector (Switch all 4 styles) ---');
  // Open basemap selector dropdown
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const basemapBtn = buttons.find(b => b.textContent && (b.textContent.includes('Dark Matter') || b.textContent.includes('Esri') || b.textContent.includes('Map Style')));
      if (basemapBtn) basemapBtn.click();
    })()`
  });
  await wait(500);

  // Capture screenshot of basemap selector dropdown open
  const ssDropdown = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 95 });
  const ssDropdownPath = path.join(__dirname, '..', '..', 'screenshot_basemap_selector_open.png');
  fs.writeFileSync(ssDropdownPath, Buffer.from(ssDropdown.data, 'base64'));
  console.log('Saved Screenshot of Basemap Selector Dropdown:', ssDropdownPath);

  // Test switching to Esri Dark Canvas
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const options = Array.from(document.querySelectorAll('button'));
      const esriBtn = options.find(b => b.textContent && b.textContent.includes('Esri Dark Canvas'));
      if (esriBtn) esriBtn.click();
    })()`
  });
  await wait(2000);

  const esriCheck = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tiles = Array.from(document.querySelectorAll('.leaflet-tile'));
      const esriTiles = tiles.filter(t => t.src.includes('arcgisonline'));
      return { esriTilesCount: esriTiles.length, sample: esriTiles[0]?.src };
    })()`,
    returnByValue: true
  });
  console.log('Check 6A (Esri Dark Canvas Switch):', esriCheck.result.value);

  // Test switching to Satellite Hybrid
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const basemapBtn = buttons.find(b => b.textContent && (b.textContent.includes('Esri') || b.textContent.includes('Dark Matter')));
      if (basemapBtn) basemapBtn.click();
    })()`
  });
  await wait(500);
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const options = Array.from(document.querySelectorAll('button'));
      const satBtn = options.find(b => b.textContent && b.textContent.includes('Satellite Hybrid'));
      if (satBtn) satBtn.click();
    })()`
  });
  await wait(2000);

  const satCheck = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tiles = Array.from(document.querySelectorAll('.leaflet-tile'));
      const satTiles = tiles.filter(t => t.src.includes('World_Imagery'));
      return { satTilesCount: satTiles.length, sample: satTiles[0]?.src };
    })()`,
    returnByValue: true
  });
  console.log('Check 6B (Satellite Hybrid Switch):', satCheck.result.value);

  // Capture screenshot of Satellite Hybrid
  const ssSat = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 95 });
  const ssSatPath = path.join(__dirname, '..', '..', 'screenshot_satellite_hybrid.png');
  fs.writeFileSync(ssSatPath, Buffer.from(ssSat.data, 'base64'));
  console.log('Saved Screenshot of Satellite Hybrid:', ssSatPath);

  // Switch back to Dark Matter
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const basemapBtn = buttons.find(b => b.textContent && b.textContent.includes('Satellite'));
      if (basemapBtn) basemapBtn.click();
    })()`
  });
  await wait(500);
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const options = Array.from(document.querySelectorAll('button'));
      const dmBtn = options.find(b => b.textContent && b.textContent.includes('Dark Matter'));
      if (dmBtn) dmBtn.click();
    })()`
  });
  await wait(1500);

  console.log('\n--- CHECK 7: Sidebar Toggle & Map Resize ---');
  // Click Filters toggle button
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const filterBtn = buttons.find(b => b.textContent && b.textContent.includes('Filters'));
      if (filterBtn) filterBtn.click();
    })()`
  });
  await wait(1000);

  const checkSidebarClosed = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const container = document.querySelector('.leaflet-container');
      return {
        sidebarVisible: !!document.querySelector('input[placeholder*=\"India\"]'),
        mapWidthAfterSidebarCollapse: container.clientWidth,
        mapHeightAfterSidebarCollapse: container.clientHeight
      };
    })()`,
    returnByValue: true
  });
  console.log('Check 7A (Sidebar Closed - Map Expanded Horizontally):', checkSidebarClosed.result.value);

  // Re-open sidebar
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const filterBtn = buttons.find(b => b.textContent && b.textContent.includes('Filters'));
      if (filterBtn) filterBtn.click();
    })()`
  });
  await wait(1000);

  console.log('\n--- CHECK 8: Navigate Away to / and Return to /map ---');
  // Click OVERVIEW link in nav
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const overviewLink = links.find(a => a.textContent && a.textContent.includes('OVERVIEW'));
      if (overviewLink) overviewLink.click();
    })()`
  });
  await wait(2000);

  const checkOverview = await cdp.send('Runtime.evaluate', {
    expression: `window.location.pathname`,
    returnByValue: true
  });
  console.log('Navigated to:', checkOverview.result.value);

  // Click FIRE MAP link in nav to return
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const mapLink = links.find(a => a.textContent && a.textContent.includes('FIRE MAP'));
      if (mapLink) mapLink.click();
    })()`
  });

  let checkMapReturnedValue = null;
  for (let i = 0; i < 12; i++) {
    await wait(600);
    const evalRes = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const container = document.querySelector('.leaflet-container');
        const tiles = document.querySelectorAll('.leaflet-tile').length;
        const markers = document.querySelectorAll('.leaflet-overlay-pane path').length;
        const liveText = document.body.innerText.match(/\\d+ OF \\d+ DETECTIONS/);
        return {
          currentPath: window.location.pathname,
          mapWidth: container ? container.clientWidth : 0,
          mapHeight: container ? container.clientHeight : 0,
          tilesCount: tiles,
          markersCount: markers,
          detectionCounterText: liveText ? liveText[0] : null
        };
      })()`,
      returnByValue: true
    });
    checkMapReturnedValue = evalRes.result.value;
    if (checkMapReturnedValue && checkMapReturnedValue.tilesCount > 0 && checkMapReturnedValue.markersCount > 0) {
      break;
    }
  }
  const checkMapReturned = { result: { value: checkMapReturnedValue } };
  console.log('Check 8 (Returned to Fire Map):', JSON.stringify(checkMapReturned.result.value, null, 2));

  console.log('\n--- CHECK 9: Browser Console & Network Verification ---');
  const errorsOnly = consoleLogs.filter(l => l.type === 'error' || l.type === 'EXCEPTION');
  console.log('Browser Console Errors Count:', errorsOnly.length);
  if (errorsOnly.length > 0) {
    console.log('Console Errors:', errorsOnly);
  }
  console.log('Network Request Failures Count:', networkErrors.length);

  // Capture final verification screenshot
  const ssFinal = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 95 });
  const ssFinalPath = path.join(__dirname, '..', '..', 'screenshot_firemap_final_verified.png');
  fs.writeFileSync(ssFinalPath, Buffer.from(ssFinal.data, 'base64'));
  console.log('Saved Final Verification Screenshot:', ssFinalPath);

  // Save full results to JSON
  const report = {
    timestamp: new Date().toISOString(),
    check1_initialLoad: check1.result.value,
    check5_zoomInteraction: checkZoom.result.value,
    check6A_esriSwitch: esriCheck.result.value,
    check6B_satelliteSwitch: satCheck.result.value,
    check7_sidebarCollapse: checkSidebarClosed.result.value,
    check8_routeNavigation: checkMapReturned.result.value,
    consoleErrors: errorsOnly,
    networkErrors: networkErrors
  };
  fs.writeFileSync(path.join(__dirname, '..', '..', 'e2e_verification_results.json'), JSON.stringify(report, null, 2));
  console.log('Saved verification results to e2e_verification_results.json');

  cdp.close();
  chrome.kill();
  console.log('=== 9-POINT E2E BROWSER VERIFICATION COMPLETED ===');
}

runE2E().catch(err => {
  console.error('E2E Verification failed:', err);
  process.exit(1);
});
