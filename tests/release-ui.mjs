import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname } from 'node:path';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';

// This mock serves the distributed files. It never connects to a real controller.
const commands = [], errors = [];
const sockets = new Set();
let machineState = 'Idle', spindleMode = 'M5', macroCount = 0;
const status = () => `<${machineState}|MPos:0.000,0.000,5.000|WCO:0.000,0.000,0.000|FS:0,0|Ov:100,100,100>\n`;
const modes = () => `[GC:G0 G54 G17 G21 G90 G94 ${spindleMode} M9 T0 F0 S0]\n`;
const gcode = 'G21 G90\nG0 X0 Y0 Z5\nG1 X40 F200\nG1 Y30\nG1 X0\nG1 Y0\nM30\n';
const broadcast = text => { for (const socket of sockets) if (socket.readyState === 1) socket.send(Buffer.from(text)); };
function command(text) {
  commands.push(text);
  if (text === '?') return broadcast(status());
  if (text === '$G') broadcast(modes());
  if (text === '$I') broadcast('[VER:4.0.3:mock]\n');
  if (text !== '$/report_inches') broadcast('ok\n');
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith('/command')) {
      const cmd = url.searchParams.get('cmd') || url.searchParams.get('commandText') || '';
      if (cmd.includes('ESP800')) return json({cmd:'800',status:'ok',data:{FWVersion:'v4.0.3',FWTarget:'FluidNC',FWTargetId:'60',WebUpdate:'Enabled',Setup:'Disabled',SDConnection:'direct',SerialProtocol:'Socket',Authentication:'Disabled',WebCommunication:'Synchronous',WebSocketIP:'127.0.0.1',WebSocketPort:String(server.address().port),HostName:'MetallKraft mock',WiFiMode:'STA',FlashFileSystem:'LittleFS',HostPath:'/',Time:'none',Axisletters:'XYZ'}});
      if (cmd.includes('ESP420')) return json({cmd:'420',status:'ok',data:[]});
      if (cmd.includes('ESP400')) return json({cmd:'400',status:'ok',data:[]});
      command(cmd);
      return res.end(cmd === '$/report_inches' ? '$/report_inches=false\n' : '');
    }
    if (url.pathname === '/files' || url.pathname === '/upload') return json({status:'Ok',path:'/',files:[{name:'example.nc',size:String(Buffer.byteLength(gcode))},{name:'.fseventsd',size:'-1'},{name:'.Spotlight-V100',size:'-1'}],total:'1 GB',used:'1 KB',occupation:'1'});
    if (url.pathname === '/login') return json({status:'Ok',authentication_lvl:'admin'});
    if (url.pathname === '/sd/example.nc') return res.end(gcode);
    const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/flash\//, '/').slice(1);
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return res.writeHead(404).end();
    let bytes;
    try { bytes = await readFile('install/ui/' + name); }
    catch { bytes = await readFile('install/ui/' + name + '.gz'); res.setHeader('Content-Encoding', 'gzip'); }
    if (name === 'preferences.json' && macroCount) {
      const preferences = JSON.parse(bytes);
      preferences.settings.macros = Array.from({length:macroCount}, (_,i) => ({id:'layout-test-'+i,name:'確認 '+(i+1),type:'CMD',action:'?'}));
      bytes = Buffer.from(JSON.stringify(preferences));
    }
    res.setHeader('Content-Type', extname(name) === '.json' ? 'application/json' : name.startsWith('theme-') ? 'text/css' : 'text/html');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
const socketServer = createServer();
const wss = new WebSocketServer({server:socketServer});
wss.on('connection', socket => {
  sockets.add(socket); socket.send('currentID:1'); broadcast(status()); broadcast(modes());
  const timer = setInterval(() => { if (socket.readyState === 1) socket.send(Buffer.from(status())); }, 200);
  socket.on('close', () => { clearInterval(timer); sockets.delete(socket); });
  socket.on('message', data => {
    const text = data.toString().trim();
    if (text.startsWith('PING:')) return socket.send('PING:60000:60000');
    command(text);
  });
});

let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve, reject) => { socketServer.once('error', reject); socketServer.listen(server.address().port + 2, '127.0.0.1', resolve); });
  await mkdir('test-results', {recursive:true});
  browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(15000);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'metallmeister.net') return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({id:4102,modified:'2026-09-11T00:00:00',content:{rendered:'<h2>MetallKraft 操作画面</h2><p>セットアップと更新手順はGitHubでご確認ください。</p>'}})});
    return route.abort();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/#/dashboard');
  await page.waitForSelector('#jogPanel');
  await page.waitForFunction(() => document.querySelector('#move_xy_10')?.checked && document.querySelector('#move_z_10')?.checked && document.querySelector('.mk-jog-speed-buttons [aria-checked="true"]')?.textContent === '500');
  const preview = page.frameLocator('#extra_content_metallkraft-preview iframe');
  await preview.locator('#path-canvas').waitFor();
  assert.equal(await page.locator('[id^="mk-demo-"]').count(), 0);
  for (const name of ['.fseventsd','.Spotlight-V100']) assert.equal(await page.getByText(name,{exact:true}).isVisible(), false);
  assert.equal(await page.locator('#mk-start-job').isDisabled(), true);
  await page.locator('#filesPanel .file-line-name[role="button"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#mk-start-job').disabled);
  await preview.getByText('/example.nc', {exact:true}).waitFor();
  await page.waitForTimeout(500);
  const geometry = async (width, height) => {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(250);
    const boxes = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        xm:rect('[id="btn-X"]'), xp:rect('[id="btn+X"]'), yp:rect('[id="btn+Y"]'), ym:rect('[id="btn-Y"]'), zs:rect('#btnStopZ'), xy:rect('#btnStop'),
        spindle:rect('#SpindlePanel [data-tooltip="主軸を正転"]'), home:rect('#btnHAll'), speed:rect('#spindlespeedInput'),
        macros:rect('#macrosPanel'), start:rect('#mk-start-job'), readout:rect('#SpindlePanel .status-ctrls'), terminal:rect('#terminalPanel')
      };
    });
    const near = (a,b,label) => assert.ok(Math.abs(a-b)<1, label+' '+JSON.stringify(boxes));
    near(boxes.xp.x-boxes.xy.x, boxes.xy.x-boxes.xm.x, 'Symmetric X');
    near(boxes.xy.y-boxes.yp.y, boxes.ym.y-boxes.xy.y, 'Symmetric Y');
    near(boxes.xp.x-boxes.xy.x, boxes.xy.y-boxes.yp.y, 'Square cross');
    near(boxes.xy.width, boxes.xy.height, 'Square buttons');
    near(boxes.zs.y, boxes.xy.y, 'Aligned Z stop');
    near(boxes.zs.x-boxes.xp.right, boxes.xy.width*.5+4, 'Half-button group gap');
    if (width >= 900 && height >= 768) {
      assert.ok(boxes.spindle.y >= boxes.home.bottom+3, 'Home/spindle overlap '+JSON.stringify(boxes));
      assert.ok(boxes.macros.y >= boxes.speed.bottom+3, 'Spindle/macro overlap '+JSON.stringify(boxes));
      assert.ok(boxes.start.y >= boxes.macros.bottom+3, 'Macro/start overlap '+JSON.stringify(boxes));
      assert.ok(boxes.terminal.y >= boxes.readout.bottom+3, 'Readout/terminal overlap '+JSON.stringify(boxes));
    }
  };
  for (const [width,height] of [[1440,900],[1366,768],[900,768],[1920,1080],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(250);
    const layout = await page.evaluate(() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    assert.ok(layout.scrollWidth <= width + 1, JSON.stringify(layout));
    if (width >= 1366) assert.ok(layout.scrollHeight <= height + 1, JSON.stringify(layout));
    await geometry(width, height);
    await page.screenshot({path:'test-results/screen-' + width + '.png',fullPage:true});
  }
  const pixels = await preview.locator('#path-canvas').evaluate(canvas => {
    const context = canvas.getContext('2d');
    const values = new Set();
    const data = context.getImageData(0,0,canvas.width,canvas.height).data;
    for (let i=0; i<data.length; i+=4) values.add(data[i]+','+data[i+1]+','+data[i+2]);
    return values.size;
  });
  assert.ok(pixels > 3, 'Preview contains rendered path pixels');
  assert.ok(commands.every(cmd => ['?', '$G', '$I', '$/report_inches'].includes(cmd)), 'Startup and file selection must not issue motion or start commands: ' + JSON.stringify(commands));

  await page.setViewportSize({width:1440,height:900});
  const startSpindle = page.locator('#SpindlePanel [data-tooltip="主軸を正転"]');
  const stopSpindle = page.locator('#SpindlePanel [data-tooltip="主軸を停止"]');
  assert.equal(await startSpindle.isVisible(), true);
  assert.equal(await stopSpindle.isVisible(), false);
  assert.equal((await startSpindle.innerText()).trim(), '主軸開始');
  assert.equal(await startSpindle.evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(23, 100, 216)');
  const restingBox = await startSpindle.boundingBox();
  const sent = commands.length;
  await startSpindle.click();
  await page.waitForTimeout(250);
  assert.deepEqual(commands.slice(sent).filter(cmd => !['?', '$G', '$I', '$/report_inches'].includes(cmd)), ['M3 S1000']);
  assert.equal(await startSpindle.isVisible(), true, 'No optimistic running indication before controller confirms');
  spindleMode = 'M3'; broadcast(modes());
  await stopSpindle.waitFor({state:'visible'});
  assert.equal(await startSpindle.isVisible(), false);
  assert.deepEqual(await stopSpindle.boundingBox(), restingBox, 'Start and stop occupy the same footprint');
  assert.equal(await stopSpindle.evaluate(e => getComputedStyle(e).animationName), 'mk-spindle-running');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await stopSpindle.evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.screenshot({path:'test-results/spindle-running.png'});
  const stopSent = commands.length;
  await stopSpindle.click();
  await page.waitForTimeout(250);
  assert.deepEqual(commands.slice(stopSent).filter(cmd => !['?', '$G', '$I', '$/report_inches'].includes(cmd)), ['M5']);
  assert.equal(await stopSpindle.isVisible(), true, 'Keep stop visible until confirmed');
  spindleMode = 'M5'; broadcast(modes());
  await startSpindle.waitFor({state:'visible'});
  spindleMode = 'M4'; broadcast(modes());
  await stopSpindle.waitFor({state:'visible'});
  assert.equal(await startSpindle.isVisible(), false, 'Reverse operation cannot present a start button');
  machineState = 'Run'; broadcast(status());
  await page.waitForFunction(() => document.querySelector('#SpindlePanel fieldset').disabled);
  assert.equal(await stopSpindle.isEnabled(), false);
  assert.equal(await stopSpindle.evaluate(e => getComputedStyle(e).animationName), 'none');
  machineState = 'Idle'; spindleMode = 'M5'; broadcast(status()); broadcast(modes());

  for (const count of [5,6,10]) {
    macroCount = count;
    await page.reload();
    await page.locator('#layout-test-0').waitFor();
    for (const [width,height] of [[1440,900],[1366,768],[900,768],[390,844]]) {
      await geometry(width,height);
      const body = page.locator('#macrosPanel > .panel-body');
      const overflow = await body.evaluate(e => e.scrollHeight > e.clientHeight+1);
      assert.equal(overflow, count > 6, 'Macro scroll threshold at '+count+' / '+width);
    }
    if (count === 10) {
      await page.setViewportSize({width:1440,height:900});
      await page.locator('#layout-test-9').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#macrosPanel > .panel-body').evaluate(e => e.scrollTop > 0));
      await page.screenshot({path:'test-results/macros-10.png'});
    }
  }
  assert.deepEqual(errors, []);
  console.log('Release UI passed: responsive spacing, six-macro threshold, native confirmed spindle toggle, unchanged M3/M5 commands, preview and public defaults.');
} finally {
  await browser?.close();
  for (const socket of sockets) socket.terminate();
  wss.close();
  server.closeAllConnections(); socketServer.closeAllConnections();
  await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => socketServer.close(resolve))]);
}
