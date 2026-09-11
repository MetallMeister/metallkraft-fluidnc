import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname } from 'node:path';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';

// This mock serves the distributed files. It never connects to a real controller.
const commands = [], errors = [];
const sockets = new Set();
let machineState = 'Idle', spindleMode = 'M5', macroCount = 0, fileStatus = 'Ok';
let machinePosition = '0.000,0.000,5.000';
let reportedFeed=0, sdReport='';
const status = () => `<${machineState}|MPos:${machinePosition}|WCO:0.000,0.000,0.000|FS:${reportedFeed},0|Ov:100,100,100${sdReport}>\n`;
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
    if (url.pathname === '/files' || url.pathname === '/upload') return json({status:fileStatus,path:'/',files:[{name:'example.nc',size:String(Buffer.byteLength(gcode))},{name:'.fseventsd',size:'-1'},{name:'.Spotlight-V100',size:'-1'}],total:'1 GB',used:'1 KB',occupation:'1'});
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
  assert.equal(await page.locator('#filesPanel .file-status').isVisible(), false, await page.locator('#filesPanel .file-status').evaluate(e=>e.outerHTML));
  assert.equal(await page.locator('#filesPanel .files-list-footer').isVisible(), false);
  await page.locator('#filesPanel .file-line-name[role="button"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#mk-start-job').disabled);
  await preview.getByText('/example.nc', {exact:true}).waitFor();
  await page.waitForTimeout(500);
  const marker = preview.locator('#tool-marker');
  const waitMarker = async expected => {
    await marker.waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const doc = document.querySelector('#extra_content_metallkraft-preview iframe')?.contentDocument;
      return doc?.querySelector('#tool-marker')?.dataset.position === window.__expectedMarker;
    }).catch(() => { throw new Error('Marker did not recover: '+expected); });
    assert.equal(await marker.getAttribute('data-position'), expected);
  };
  const expectPosition = async expected => {
    await page.evaluate(value => { window.__expectedMarker = value; }, expected);
    await waitMarker(expected);
  };
  const reselectFile = async () => {
    await page.waitForTimeout(300);
    await page.locator('#filesPanel .file-line-name[role="button"]').first().click();
    await preview.getByText('/example.nc', {exact:true}).waitFor();
    await page.waitForFunction(() => !document.querySelector('#mk-start-job').disabled);
  };
  await expectPosition('0,0,5');
  const markerShape = await marker.evaluate(e => {
    const r=e.getBoundingClientRect(), parent=e.parentElement.getBoundingClientRect();
    return {width:r.width,height:r.height,tip:(r.top+r.bottom)/2-parent.top,anchor:parseFloat(e.style.top)};
  });
  assert.equal(markerShape.height,markerShape.width, 'Tool is a blue point');
  assert.ok(Math.abs(markerShape.tip-markerShape.anchor)<1, 'Point center anchors the reported position');
  for (const id of ['zoom-in','zoom-out','cancel-preview']) assert.equal(await preview.locator('#'+id).isVisible(),false);
  await preview.locator('#view-3d').click();
  await page.waitForTimeout(200);
  const canvasBefore=await preview.locator('#path-canvas').evaluate(e=>e.toDataURL());
  const canvasBox=await preview.locator('#path-canvas').boundingBox();
  await page.mouse.move(canvasBox.x+canvasBox.width/2,canvasBox.y+canvasBox.height/2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x+canvasBox.width/2+60,canvasBox.y+canvasBox.height/2+20,{steps:8});
  await page.mouse.up(); await page.waitForTimeout(200);
  assert.notEqual(await preview.locator('#path-canvas').evaluate(e=>e.toDataURL()),canvasBefore,'Existing 3D drag rotates the drawing');
  const panCheck = async (mode, button='left', shift=false) => {
    await preview.locator('#view-'+mode).click();
    await preview.locator('#fit-preview').click();
    await page.waitForTimeout(200);
    const position=()=>marker.evaluate(e=>[parseFloat(e.style.left),parseFloat(e.style.top)]);
    const before=await position(), reported=await marker.getAttribute('data-position');
    const scale=await preview.locator('#path-canvas').getAttribute('data-pixels-per-mm');
    const b=await preview.locator('#path-canvas').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
    if(shift) await page.keyboard.down('Shift');
    await page.mouse.down({button});
    await page.mouse.move(b.x+b.width/2+35,b.y+b.height/2-20,{steps:5});
    await page.mouse.up({button});
    if(shift) await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
    const after=await position();
    assert.ok(Math.abs(after[0]-before[0]-35)<1 && Math.abs(after[1]-before[1]+20)<1,'Pan moves tool and path in screen pixels');
    assert.equal(await marker.getAttribute('data-position'),reported,'Panning never changes work coordinates');
    assert.equal(await preview.locator('#path-canvas').getAttribute('data-pixels-per-mm'),scale);
    await preview.locator('#fit-preview').click(); await page.waitForTimeout(200);
    assert.deepEqual(await position(),before,'Fit restores the unpanned view');
  };
  await panCheck('3d','right');
  await panCheck('3d','left',true);
  await panCheck('2d');
  await preview.locator('#view-2d').click();
  // Reports only: no actual start, reset or jog is sent to a controller.
  for (const x of [10,20]) {
    machineState='Run'; machinePosition=`${x},0,5`; broadcast(status());
    await expectPosition(`${x},0,5`);
    machineState='Idle'; broadcast(status());
    await reselectFile();
    await expectPosition(`${x},0,5`);
  }
  const unitReads = () => commands.filter(c=>c==='$/report_inches').length;
  const readsBeforeReset=unitReads();
  machineState='Alarm'; broadcast('Grbl 4.0.3 [FluidNC]\nALARM:1\n'); broadcast(status());
  await marker.waitFor({state:'hidden'});
  await page.waitForTimeout(350);
  assert.equal(unitReads(),readsBeforeReset,'No settings read while alarmed');
  machineState='Idle'; broadcast(status());
  await expectPosition('20,0,5');
  assert.equal(unitReads(),readsBeforeReset+1,'One metadata refresh after reset without disconnect');
  machineState='Run'; machinePosition='30,0,5'; broadcast(status());
  await expectPosition('30,0,5');
  machineState='Idle'; machinePosition='0.000,0.000,5.000'; broadcast(status());
  await reselectFile();
  await expectPosition('0,0,5');
  await preview.getByText('/example.nc', {exact:true}).waitFor();
  while (await page.locator('.toasts-container .btn-clear').count()) await page.locator('.toasts-container .btn-clear').first().click();
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
      assert.ok(boxes.xy.width >= 40, 'Jog arrows and labels need a usable footprint');
      assert.ok(boxes.speed.y >= boxes.home.bottom+20, 'Spindle heading separates manual axes '+JSON.stringify(boxes));
      assert.ok(boxes.spindle.y >= boxes.speed.bottom+3, 'Set speed before starting spindle '+JSON.stringify(boxes));
      assert.ok(boxes.spindle.y <= boxes.speed.bottom+12, 'Unused input/start gap '+JSON.stringify(boxes));
      assert.ok(boxes.macros.y >= boxes.spindle.bottom+3, 'Spindle/macro overlap '+JSON.stringify(boxes));
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
  for (const id of ['btnStop','btnStopZ']) {
    const button = page.locator('#'+id);
    assert.equal(await button.isDisabled(), true);
    assert.equal(await button.evaluate(e=>getComputedStyle(e).backgroundColor), 'rgb(226, 229, 233)');
  }
  const busyStart = commands.length;
  await page.locator('#btnStop').evaluate(e=>e.click());
  await page.locator('#btnStopZ').evaluate(e=>e.click());
  await page.waitForTimeout(250);
  assert.ok(commands.slice(busyStart).every(cmd=>['?','$G'].includes(cmd)), 'Disabled jog stop must not send commands');
  await page.screenshot({path:'test-results/processing.png'});
  machineState = 'Idle'; spindleMode = 'M5'; broadcast(status()); broadcast(modes());

  const guide = page.locator('#mk-recovery-guide');
  const native = label => page.locator('#statusPanel [data-tooltip="'+label+'"]');
  const nonPolling = start => commands.slice(start).filter(cmd=>!['?','$G','$I','$/report_inches'].includes(cmd));
  assert.equal(await native('スリープ').isVisible(), false);
  const statusButtons=page.locator('#statusPanel .status-buttons-container button:visible');
  assert.equal(await statusButtons.count(),3);
  const statusWidths=await statusButtons.evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().width));
  assert.ok(Math.max(...statusWidths)-Math.min(...statusWidths)<1, 'Remaining buttons share the full row evenly');
  assert.match(await page.locator('#btnEStop').evaluate(e=>getComputedStyle(e,'::after').content), /物理非常停止の代わりにはなりません/);
  await page.mouse.move(0,0);
  assert.equal(await native('リセット').evaluate(e=>getComputedStyle(e).animationName), 'none');
  let start = commands.length;
  // Sleep remains a firmware state even though its dashboard button is hidden.
  machineState = 'Sleep'; broadcast(status());
  await guide.getByText('スリープから戻すには').waitFor();
  assert.equal(await native('リセット').evaluate(e=>getComputedStyle(e).outlineStyle), 'solid');
  assert.equal(await native('リセット').evaluate(e=>getComputedStyle(e).animationName), 'mk-recovery-action');
  assert.equal(await guide.evaluate(e=>getComputedStyle(e).animationName), 'mk-recovery-guide-edge');
  const pulse = await native('リセット').evaluate(e => {
    const animation = e.getAnimations().find(a=>a.animationName==='mk-recovery-action');
    animation.pause(); animation.currentTime=0;
    const first={color:getComputedStyle(e).filter,rect:e.getBoundingClientRect().toJSON()};
    animation.currentTime=900;
    const second={color:getComputedStyle(e).filter,rect:e.getBoundingClientRect().toJSON()};
    animation.play(); return {first,second};
  });
  assert.notEqual(pulse.first.color, pulse.second.color, 'Recovery button surface visibly pulses');
  assert.deepEqual(await native('リセット').evaluate(e=>({duration:getComputedStyle(e).animationDuration,easing:getComputedStyle(e).animationTimingFunction})), {duration:'1.6s',easing:'ease-in-out'});
  assert.deepEqual(pulse.first.rect, pulse.second.rect, 'Pulsing cannot move the target');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await native('リセット').evaluate(e=>getComputedStyle(e).animationName), 'none');
  assert.equal(await guide.evaluate(e=>getComputedStyle(e).animationName), 'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.screenshot({path:'test-results/recovery-sleep.png'});
  start = commands.length;
  await native('リセット').click();
  await page.waitForTimeout(250);
  assert.deepEqual(nonPolling(start), ['\x18']);
  machineState = 'Alarm'; broadcast('ALARM:3\n'); broadcast(status());
  await guide.getByText('アラーム解除の前に').waitFor();
  assert.equal(await native('リセット').evaluate(e=>getComputedStyle(e).animationName), 'none');
  assert.equal(await native('アラーム解除').evaluate(e=>getComputedStyle(e).animationName), 'mk-recovery-action');
  start = commands.length;
  await native('アラーム解除').click();
  await page.waitForTimeout(250);
  assert.deepEqual(nonPolling(start), ['$X']);
  machineState = 'Idle'; broadcast(status());
  await guide.getByText('運転を始める前に').waitFor();
  start = commands.length;
  await guide.getByRole('button', {name:'案内を閉じる'}).click();
  await page.waitForTimeout(250);
  assert.equal(await guide.count(),0);
  assert.equal(await native('アラーム解除').evaluate(e=>getComputedStyle(e).animationName), 'none');
  assert.ok(nonPolling(start).length===0, 'Dismissing guidance cannot operate the machine');

  machineState = 'Run'; broadcast(status());
  start = commands.length;
  await page.locator('#btnEStop').click();
  await page.waitForTimeout(250);
  assert.deepEqual(nonPolling(start), ['\x84'], 'Keep the stock safety-door quick stop');
  await guide.getByText('停止指令の反映待ち').waitFor();
  machineState = 'Door:0'; broadcast(status());
  await guide.getByText('クイック停止・安全扉停止中').waitFor();
  assert.match(await guide.innerText(),/途中再開ではありません/);
  for (const [width,height] of [[1440,900],[900,768],[390,844]]) {
    await page.setViewportSize({width,height}); await page.waitForTimeout(250);
    const box=await guide.boundingBox();
    assert.ok(box.y>=0 && box.y+box.height<=height-2, 'Guide stays on screen');
    assert.ok(await guide.evaluate(e=>e.scrollHeight<=e.clientHeight+1), 'Guide copy fits '+width);
    assert.ok(await page.locator('#btnEStop').isVisible());
    if (width >= 900) {
      const toast = await page.locator('.toasts-container').boundingBox();
      const files = await page.locator('#filesPanel').boundingBox();
      assert.ok(toast.x+toast.width <= files.x-4, 'Notifications must not cover file selection');
    }
    await page.screenshot({path:'test-results/recovery-'+width+'.png',fullPage:true});
  }
  machineState = 'Hold:1'; broadcast(status());
  await guide.getByText('停止完了を待っています').waitFor();
  machineState = 'Hold:0'; broadcast(status());
  await guide.getByText('一時停止中です').waitFor();
  machineState = 'Jog'; broadcast(status());
  await page.waitForFunction(()=>!document.querySelector('#btnStopZ').disabled);
  start=commands.length;
  await page.locator('#btnStopZ').evaluate(e=>e.click());
  await page.waitForTimeout(250);
  assert.deepEqual(nonPolling(start), ['\x85'], 'Native jog-cancel stays available during jogging');
  machineState='Idle'; spindleMode='M5'; broadcast(status()); broadcast(modes());

  fileStatus='No SD card';
  await page.reload();
  await page.locator('#filesPanel .file-status').waitFor({state:'visible'});
  assert.match(await page.locator('#filesPanel .file-status').innerText(), /SD/);
  fileStatus='Ok';

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
  const input=page.locator('#terminalPanel input.form-input');
  const send=page.locator('#terminalPanel .input-group button');
  for (const state of ['Run','Hold:0','Door:0','Home','Jog','Sleep']) {
    machineState=state; broadcast(status());
    await page.waitForFunction(()=>document.querySelector('#layout-test-0')?.disabled && document.querySelector('#terminalPanel input')?.disabled);
    assert.equal(await send.isDisabled(),true);
    const before=commands.length;
    await page.locator('#layout-test-0').evaluate(e=>e.click());
    await send.evaluate(e=>e.click());
    await page.waitForTimeout(80);
    assert.deepEqual(nonPolling(before),[],'Locked macro and send must not issue commands');
    assert.equal(await send.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(226, 229, 233)');
  }
  machineState='Idle'; broadcast(status());
  await page.waitForFunction(()=>!document.querySelector('#layout-test-0').disabled);
  assert.equal(await input.isDisabled(),false);
  await input.fill('G4 P0');
  let before=commands.length; await input.press('Enter');
  await page.waitForTimeout(150);
  assert.deepEqual(nonPolling(before),['G4 P0'],'Idle Enter uses the original sender');

  await reselectFile();
  await page.locator('#mk-start-job').click();
  await page.waitForTimeout(200);
  machineState='Run'; reportedFeed=1000; sdReport='|SD:50,/sd/example.nc';
  for (const x of [2,4,6]) {
    machinePosition=`${x},0,5`; broadcast(status()); await page.waitForTimeout(250);
  }
  const trace=preview.locator('#traversed-path');
  assert.ok(Number(await trace.getAttribute('data-ranges'))>0,'Native SD reports produce traversed ranges');
  const grayPixels=await trace.evaluate(e=>{
    const data=e.getContext('2d').getImageData(0,0,e.width,e.height).data;
    let count=0;for(let i=0;i<data.length;i+=4) if(data[i]===128&&data[i+1]===128&&data[i+2]===128&&data[i+3]>0)count++;
    return count;
  });
  assert.ok(grayPixels>10,'Traversed path is visibly gray, not just computed');
  await expectPosition('6,0,5');
  await page.screenshot({path:'test-results/traversed.png'});
  machineState='Idle'; reportedFeed=0; sdReport=''; broadcast(status());
  assert.deepEqual(errors, []);
  console.log('Release UI passed: responsive layout, disabled jog stops, recovery guidance, native stop/reset/unlock commands, SD error visibility, spindle toggle, six-macro threshold and preview.');
} catch (error) {
  console.error({browserErrors:errors});
  throw error;
} finally {
  await browser?.close();
  for (const socket of sockets) socket.terminate();
  wss.close();
  server.closeAllConnections(); socketServer.closeAllConnections();
  await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => socketServer.close(resolve))]);
}
