import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Explicit tags only. Historical UI bytes are read from Git, never rebuilt.
const tags=process.argv.slice(2).filter(x=>x!=='--apply');
const apply=process.argv.includes('--apply');
assert.ok(tags.length && tags.every(t=>/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(t)),'Pass version tags');
const repo='MetallMeister/metallkraft-fluidnc';
const root=`https://github.com/${repo}`;
const output='backups/release-assets';await mkdir(output,{recursive:true});
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const sha=data=>createHash('sha256').update(data).digest('hex');
const changelog=await readFile('CHANGELOG.md','utf8');
let token;
if(apply){
  const credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  token=credential.split('\n').find(line=>line.startsWith('password='))?.slice(9);
  assert.ok(token,'GitHub credential unavailable');
}
const api=async(path,method='GET',data)=>{
  const url=path.startsWith('https:')?path:`https://api.github.com/repos/${repo}${path}`;
  assert.ok(['api.github.com','uploads.github.com'].includes(new URL(url).hostname));
  const binary=Buffer.isBuffer(data);
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(data?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},body:data?(binary?data:JSON.stringify(data)):undefined,signal:AbortSignal.timeout(60000)});
  assert.ok(response.ok,`GitHub ${method} ${response.status}: ${new URL(url).pathname}`);
  return response.json();
};
const releases=apply?await api('/releases?per_page=100'):[];
for(const tag of tags){
  const prerelease=tag.includes('-');
  const manifest=JSON.parse(git('show',`${tag}:install/manifest.json`));
  assert.equal('v'+manifest.version,tag);
  for(const [file,expected] of Object.entries(manifest.files))assert.equal(sha(git('show',`${tag}:install/${file}`)),expected.sha256,`${tag}: ${file}`);
  const name=`metallkraft-ui-${tag}.zip`;
  git('archive','--format=zip',`--prefix=metallkraft-ui-${tag}/`,`--output=${output}/${name}`,tag,'install/ui','LICENSE','THIRD_PARTY.md','licenses','docs');
  const bytes=await readFile(`${output}/${name}`);
  const checksum=Buffer.from(`${sha(bytes)}  ${name}\n`);
  await writeFile(`${output}/${name}.sha256`,checksum);
  const section=changelog.split(`## ${tag} / `)[1];assert.ok(section,`Missing changelog ${tag}`);
  const changes=section.split('\n').slice(1).join('\n').split('\n## ')[0].trim();
  const betaNote=prerelease?'**これはベータ版です。実機設定をバックアップし、停止状態で表示と復元対象を確認してから使用してください。**\n\n':'';
  const body=`${betaNote}## ダウンロード・導入\n\n下の **Assets → ${name}** をダウンロードしてください。ビルド済みの画面ファイルと説明書をまとめています。\n\n1. 機械・主軸を停止し、本体Flashをバックアップ。\n2. ZIPを展開し、\`install/ui/\` を開きます。\n3. 初回導入は7ファイルを本体Flash直下へアップロード。更新・旧版への復元では **preferences.jsonを除く6ファイル** を同じ版で揃えて上書き。\n4. ブラウザを再読み込みします。\n\n**機械用config.yamlは変更しません。** 既存のpreferences.json・登録マクロも更新時は保持します。標準復元機能を初めて使う場合は、正常な自機設定を確認してから「現在の設定を標準として保存」を実行してください。機械固有の標準値は配布ZIPに含みません。FluidNC本体・基板設定例もこのUI用ZIPには含みません。\n\n基準: FluidNC v4.0.3 / WebUI-3 v3.0.10。旧版には後続版で修正した不具合が残ります。\n\n[導入手順](${root}/blob/main/docs/INSTALL.md) · [更新・復元](${root}/blob/main/docs/VERSIONS.md) · [標準設定への復元](${root}/blob/main/docs/RESTORE.md) · [免責事項](${root}/blob/main/docs/DISCLAIMER.md)\n\n## この版の変更\n\n${changes}\n\n## ソースコード\n\nAssetsのSource code (zip / tar.gz)はこのタグの全ソースです。UI用ZIPは公開済みタグから抽出し、配布ファイルのSHA-256を検証しています。\n`;
  if(!apply){console.log({tag,name,bytes:bytes.length,sha256:sha(bytes)});continue;}
  let release=releases.find(r=>r.tag_name===tag);
  if(release&&!release.draft){console.log({tag,skipped:'already published'});continue;}
  if(!release)release=await api('/releases','POST',{tag_name:tag,name:`MetallKraft UI ${tag}${prerelease?' (Beta)':''}`,body,draft:true,prerelease});
  for(const [assetName,data] of [[name,bytes],[`${name}.sha256`,checksum]]){
    const existing=release.assets.find(a=>a.name===assetName);
    if(existing){assert.equal(existing.digest,`sha256:${sha(data)}`,'Existing draft asset differs');continue;}
    const upload=release.upload_url.split('{')[0]+'?'+new URLSearchParams({name:assetName});
    const uploaded=await api(upload,'POST',data);
    assert.equal(uploaded.size,data.length);
    assert.equal(uploaded.digest,`sha256:${sha(data)}`,'Uploaded asset digest mismatch');
  }
  release=await api(`/releases/${release.id}`,'PATCH',{body,draft:false,prerelease,make_latest:tag===tags.at(-1)?'true':'false'});
  console.log({tag,url:release.html_url,published:!release.draft});
}
