import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {installDefaults} from '../standard/defaults-bundle.mjs';
import {BASELINE_FILE,BACKUP_FILE,yamlObject} from '../standard/defaults-core.js';
const baseline={version:1,createdAt:'2026-09-12T00:00:00Z',identity:'42',firmware:'v4.0.3',filename:'config.yaml',config:{board:'test',axes:{x:{steps_per_mm:800}}},preferences:{settings:{xyfeedrate:'500',macros:[]}},features:{'Report/Status':{type:'I',value:'1'}}};
const files=new Map([[BASELINE_FILE,JSON.stringify(baseline)],['preferences.json',JSON.stringify(baseline.preferences)],['config.yaml','board: test\naxes:\n  x:\n    steps_per_mm: 400\n']]);
let runtime=files.get('config.yaml'),restarts=0;const writes=[],commands=[],errors=[];
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');const json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(installDefaults('<html><body><header class="navbar"><a id="settingsLink" href="#/settings">設定</a></header><main><div id="statusPanel"><div class="status-ctrls" data-machine-state="Idle"></div></div><div id="SpindlePanel"><div class="extra-control" data-tooltip="主軸回転数指令 (rpm)"><div class="extra-control-value">0</div></div><div class="extra-control" data-tooltip="モード"><div class="extra-control-value">M5</div></div></div><div id="settings-actions"><button class="btn m-2 tooltip feather-icon-container icon-button text-straight" data-tooltip="情報を更新">更新</button><button class="btn m-2 tooltip feather-icon-container icon-button text-straight">インポート</button><button class="btn m-2 tooltip feather-icon-container icon-button text-straight">エクスポート</button><button class="btn m-2 tooltip feather-icon-container icon-button text-straight">ボードを再起動</button></div></main></body></html>'));}
    if(url.pathname.startsWith('/flash/')){const value=files.get(decodeURIComponent(url.pathname.slice(7)));return value===undefined?res.writeHead(404).end():res.end(value);}
    if(url.pathname==='/files'&&req.method==='POST'){
      const request=new Request(url,{method:'POST',headers:req.headers,body:Readable.toWeb(req),duplex:'half'});
      const form=await request.formData();const file=form.get('file');const name=file.name.replace(/^\//,'');files.set(name,await file.text());writes.push(name);return json({status:'ok'});
    }
    const cmd=url.searchParams.get('cmd');commands.push(cmd);
    if(cmd?.startsWith('[ESP800]'))return json({cmd:'800',status:'ok',data:{FWVersion:'v4.0.3',WebSocketPort:server.address().port}});
    if(cmd?.startsWith('[ESP420]'))return json({cmd:'420',status:'ok',data:[{id:'Chip ID',value:'42'}]});
    if(cmd?.startsWith('[ESP400]'))return json({cmd:'400',status:'ok',data:[{P:'Config/Filename',V:'config.yaml',T:'S'},{P:'Report/Status',V:'1',T:'I'},{P:'Sta/SSID',V:'keep-network',T:'S'}]});
    if(cmd?.startsWith('[ESP401]P=Config/Dump')){files.set('mk-runtime.yaml',runtime);return json({cmd:'401',status:'ok',data:'Ok'});}
    if(cmd==='[ESP444]RESTART'){restarts++;runtime=files.get('config.yaml');return res.end('ok');}
    return res.writeHead(400).end();
  }catch(error){errors.push(error.message);res.writeHead(500).end();}
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',d=>d.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}/#/settings/features`);
  await page.locator('#mk-defaults-open').waitFor();
  assert.equal(await page.locator('header #mk-defaults-open').count(),0);
  assert.equal(await page.locator('#settings-actions #mk-defaults-open').count(),1);
  assert.equal(await page.locator('#settings-actions button').last().innerText(),'標準に戻す');
  await page.getByRole('button',{name:'標準に戻す',exact:true}).click();
  await page.getByText('機械設定（FluidNC）: 1項目が標準と異なります',{exact:true}).waitFor();
  assert.equal(await page.locator('.mk-defaults-row').count(),1);
  assert.match(await page.locator('.mk-defaults-row').innerText(),/400/);
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/defaults-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#mk-defaults-dialog').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:'test-results/defaults-mobile.png'});
  await page.getByRole('button',{name:'すべて標準に戻す',exact:true}).click();
  await page.getByText('復元ファイルを保存しました。機械設定は再起動後に適用されます。',{exact:true}).waitFor();
  assert.ok(files.has(BACKUP_FILE));assert.equal(yamlObject(files.get('config.yaml')).axes.x.steps_per_mm,800);
  assert.equal(yamlObject(runtime).axes.x.steps_per_mm,400);assert.equal(restarts,0);
  assert.ok(!commands.some(c=>/P=(?:Sta|AP|WiFi|HTTP|Telnet)/.test(c)));
  assert.equal(await page.getByRole('button',{name:'すべて標準に戻す',exact:true}).isDisabled(),true);
  await page.reload();await page.getByRole('button',{name:'標準に戻す',exact:true}).click();
  await page.getByRole('button',{name:'再起動して適用',exact:true}).waitFor();
  await page.locator('#statusPanel .status-ctrls').evaluate(element=>element.dataset.machineState='Run');const previous=writes.length;
  await page.getByRole('button',{name:'再起動して適用',exact:true}).click();
  await page.getByText('機械を停止してから操作してください。',{exact:true}).waitFor();
  assert.equal(restarts,0);assert.equal(writes.length,previous);
  assert.deepEqual(errors,[]);console.log('Defaults UI passed: diff, yellow row, mobile, backup, guarded full restore, no automatic restart, pending recovery.');
}finally{await browser?.close();server.close();}
