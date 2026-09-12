import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {DefaultsController} from '../standard/defaults-core.js';
import {defaultsBlock} from '../standard/defaults-bundle.mjs';

const controller=new DefaultsController(process.argv[2]);
assert.ok(process.argv.includes('--apply'),'Explicit --apply required');
const hash=value=>createHash('sha256').update(value).digest('hex');
await controller.idle();
const listing=await(await controller.request('/files?path=/')).json();
const backup=`backups/defaults-ui-${Date.now()}`;
await mkdir(backup,{recursive:true});
const get=async name=>Buffer.from(await(await controller.request('/flash/'+encodeURIComponent(name))).arrayBuffer());
const files=new Map();
for(const file of listing.files.filter(file=>Number(file.size)>=0)){
  assert.ok(!/[\\/]/.test(file.name));
  const data=await get(file.name);files.set(file.name,data);await writeFile(`${backup}/${file.name}`,data);
}
const html=gunzipSync(files.get('index.html.gz')).toString();
const pattern=/<style data-mk-defaults>[\s\S]*?<\/style><script data-mk-defaults>[\s\S]*?<\/script>/g;
const matches=html.match(pattern)||[];
assert.equal(matches.length,1,'Expected one existing defaults UI block');
const next=html.replace(pattern,()=>defaultsBlock);
assert.equal((next.match(/<style data-mk-defaults>/g)||[]).length,1);
assert.equal((next.match(/<script data-mk-defaults>/g)||[]).length,1);
const bytes=gzipSync(next,{level:9});
await controller.idle();
const body=new FormData();body.append('file',new Blob([bytes]),'/index.html.gz');
await controller.request('/files?'+new URLSearchParams({path:'/','/index.html.gzS':String(bytes.length)}),{method:'POST',body});
assert.ok((await get('index.html.gz')).equals(bytes),'UI readback differs');
for(const [name,data] of files)if(name!=='index.html.gz')assert.equal(hash(await get(name)),hash(data),`Protected file changed: ${name}`);
await controller.idle();
console.log({backup,uiBytes:bytes.length,sha256:hash(bytes),configurationChanged:false});
