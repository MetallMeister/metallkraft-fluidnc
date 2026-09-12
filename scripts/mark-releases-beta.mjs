import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const apply=process.argv.includes('--apply');
const requested=process.argv.slice(2).filter(value=>value!=='--apply');
const repo='MetallMeister/metallkraft-fluidnc';
const credential=apply?execFileSync('git',['credential','fill'],{
  input:'protocol=https\nhost=github.com\n\n',
  encoding:'utf8',
  env:{...process.env,GIT_TERMINAL_PROMPT:'0'}
}):'';
const token=credential.split('\n').find(line=>line.startsWith('password='))?.slice(9);
if(apply)assert.ok(token,'GitHub credential unavailable');

const api=async(path,method='GET',data)=>{
  const response=await fetch(`https://api.github.com/repos/${repo}${path}`,{
    method,
    headers:{
      ...(token?{Authorization:`Bearer ${token}`} : {}),
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      ...(data?{'Content-Type':'application/json'}:{})
    },
    body:data?JSON.stringify(data):undefined,
    signal:AbortSignal.timeout(60000)
  });
  assert.ok(response.ok,`GitHub ${method} ${response.status}: ${path}`);
  return response.json();
};

const releases=await api('/releases?per_page=100');
const targets=releases.filter(release=>!release.draft&&(!requested.length||requested.includes(release.tag_name)));
assert.ok(targets.length,'No published releases found');
if(requested.length)assert.deepEqual([...new Set(targets.map(release=>release.tag_name))].sort(),[...new Set(requested)].sort(),'A requested release was not found');

const warning='**この公開版はベータ版です。実機設定をバックアップし、停止状態で確認してから使用してください。**';
for(const release of targets){
  const name=/\(Beta\)$/.test(release.name||'')?release.name:`${release.name||`MetallKraft UI ${release.tag_name}`} (Beta)`;
  const body=(release.body||'').includes('ベータ版')?release.body:`${warning}\n\n${release.body||''}`;
  if(!apply){
    console.log({tag:release.tag_name,name,prerelease:true});
    continue;
  }
  const updated=await api(`/releases/${release.id}`,'PATCH',{name,body,prerelease:true,make_latest:'false'});
  assert.equal(updated.prerelease,true,`${release.tag_name}: prerelease flag`);
  assert.equal(updated.draft,false,`${release.tag_name}: draft flag`);
  assert.match(updated.name,/\(Beta\)$/,`${release.tag_name}: release name`);
  console.log({tag:updated.tag_name,name:updated.name,prerelease:updated.prerelease});
}
