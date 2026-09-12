import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { undoFileDeletion as undoPrevious } from '../standard/file-deletion-before-download-patches.mjs';
import { patchFileDeletion,undoFileDeletion } from '../standard/file-deletion-patches.mjs';

const base=new URL(process.argv[2]).origin;
const apply=process.argv.includes('--apply');
const hash=b=>createHash('sha256').update(b).digest('hex');
const request=async(path,options={})=>{
  const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,`HTTP ${response.status}: ${path}`);return response;
};
const get=async name=>Buffer.from(await(await request('/flash/'+encodeURIComponent(name))).arrayBuffer());
async function idle(){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(base.replace(/^http/,'ws')+'/', 'webui-v3');let status='',modes='',done=false,modeTimer;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(modeTimer);ws.terminate();error?reject(error):resolve({status,modes});};
    const timer=setTimeout(()=>finish(Error('No fresh status')),8000);
    ws.on('error',finish);ws.on('open',()=>{ws.send('?');modeTimer=setTimeout(()=>ws.send('$G\n'),500);});
    ws.on('message',data=>{
      status=data.toString().match(/<[^>]+>/)?.[0]||status;modes=data.toString().match(/\[GC:[^\]]+\]/)?.[0]||modes;
      if(status&&modes)finish(/^<Idle\|/.test(status)&&/\|FS:0,/.test(status)&&/\bM5\b/.test(modes)?null:Error('Controller must be Idle/M5'));
    });
  });
}
const beforeState=await idle();
const listing=await(await request('/files?path=/')).json();
const backup=`backups/download-controls-${Date.now()}`;await mkdir(backup,{recursive:true});
const before=new Map();
for(const file of listing.files.filter(f=>Number(f.size)>=0)){
  assert.ok(!/[\\/]/.test(file.name));const data=await get(file.name);before.set(file.name,data);await writeFile(`${backup}/${file.name}`,data);
}
const html=gunzipSync(before.get('index.html.gz')).toString();
const clean=undoPrevious(html);
const next=patchFileDeletion(clean);
assert.equal(undoFileDeletion(next),clean,'Only reviewed file controls may change');
const bytes=gzipSync(next,{level:9});
if(apply){
  await idle();const form=new FormData();form.append('file',new Blob([bytes]),'/index.html.gz');
  await request('/files?'+new URLSearchParams({path:'/','/index.html.gzS':String(bytes.length)}),{method:'POST',body:form});
  assert.equal(hash(await get('index.html.gz')),hash(bytes));
  for(const [name,data] of before)if(name!=='index.html.gz')assert.equal(hash(await get(name)),hash(data),`Protected file changed: ${name}`);
}
const report={base,apply,backup,beforeState,afterState:await idle(),sha256:hash(bytes),bytes:bytes.length};
await writeFile(`${backup}/report.json`,JSON.stringify(report,null,2));console.log(report);
