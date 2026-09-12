import { parseDocument, stringify } from 'yaml';

export const BASELINE_FILE = 'mk-defaults.json';
export const BACKUP_FILE = 'mk-before-restore.json';
export const FEATURE_KEYS = ['GCode/Echo', 'Start/Message', 'SD/FallbackCS', 'Report/Status', 'Message/Level'];
const copy = value => JSON.parse(JSON.stringify(value));
export function yamlObject(text) {
  const doc = parseDocument(text);
  if (doc.errors.length) throw Error('YAMLを読み取れません。');
  const value = doc.toJS({ maxAliasCount: 100 });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('機械設定の形式が不正です。');
  return value;
}
export const equal = (a,b) => {
  if (a===b) return true;
  if (!a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b)) return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length && keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
};
export function differences(current, baseline, path=[]) {
  if(equal(current,baseline))return [];
  if(current && baseline && typeof current==='object' && typeof baseline==='object' && !Array.isArray(current) && !Array.isArray(baseline)) {
    return [...new Set([...Object.keys(current),...Object.keys(baseline)])].sort().flatMap(key=>differences(current[key],baseline[key],[...path,key]));
  }
  return [{path,current,standard:baseline,missing:baseline===undefined}];
}
export function restorePath(current,baseline,path) {
  if(!path.length)return copy(baseline);
  const result=copy(current);let dst=result,src=baseline;
  for(const key of path.slice(0,-1)){dst=dst[key];src=src?.[key];}
  const key=path.at(-1);
  if(src && Object.hasOwn(src,key))Object.defineProperty(dst,key,{value:copy(src[key]),enumerable:true,writable:true,configurable:true});
  else delete dst[key];
  return result;
}
export function validateSnapshot(s) {
  if(s?.version!==1 || !s.identity || !s.firmware || !/^[a-zA-Z0-9_.-]+\.ya?ml$/.test(s.filename) || !s.config || !s.preferences?.settings || !s.features)throw Error('標準設定ファイルを確認できません。');
  if(Object.keys(s.features).some(k=>!FEATURE_KEYS.includes(k)))throw Error('復元対象外の接続設定が含まれています。');
  return s;
}
export class DefaultsController {
  constructor(base,stateReader=null){this.base=new URL(base).origin;this.stateReader=stateReader;}
  async request(path,options={}) {
    const response=await fetch(this.base+path,{...options,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`通信エラー (${response.status})`);return response;
  }
  async command(command,expected) {
    const result=await(await this.request('/command?'+new URLSearchParams({cmd:command}))).json();
    if(String(result.cmd)!==String(expected)||result.status!=='ok')throw Error(`設定処理失敗: ${result.data || result.status}`);
    return result.data;
  }
  async idle() {
    const info=await this.command('[ESP800]json=yes',800);
    if(this.stateReader){
      const state=this.stateReader();
      if(state.machine!=='Idle')throw Error('機械を停止してから操作してください。');
      if(state.spindle!=='M5' || Number(state.speed)!==0)throw Error('機械と主軸を停止してください。');
      return info;
    }
    return new Promise((resolve,reject)=>{
      const url=new URL(this.base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.port=String(info.WebSocketPort||url.port);
      const socket=new WebSocket(url.href,'webui-v3');let report='',modes='',done=false,delay;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(delay);socket.close();error?reject(error):resolve(info);};
      const timer=setTimeout(()=>finish(Error('停止状態を受信できません。操作せず接続を確認してください。')),8000);
      socket.onerror=()=>finish(Error('状態確認の接続に失敗しました。'));
      socket.onopen=()=>{socket.send('?');delay=setTimeout(()=>socket.send('$G\n'),350);};
      socket.onmessage=async event=>{
        const text=typeof event.data==='string'?event.data:await event.data.text();
        report=text.match(/<[^>]+>/)?.[0]||report;modes=text.match(/\[GC:[^\]]+\]/)?.[0]||modes;
        if(report && !/^<Idle\|/.test(report)){finish(Error('機械を停止してから操作してください。'));return;}
        if(report&&modes)finish(/\|FS:0(?:\.0+)?,/.test(report)&&/\bM5\b/.test(modes)?null:Error('機械と主軸を停止してください。'));
      };
    });
  }
  async readText(name){return(await this.request('/flash/'+encodeURIComponent(name))).text();}
  async readSnapshot(name=BASELINE_FILE){return validateSnapshot(JSON.parse(await this.readText(name)));}
  async upload(name,text) {
    await this.idle();
    const body=new FormData(),blob=new Blob([text]);body.append('file',blob,'/'+name);
    await this.request('/files?'+new URLSearchParams({path:'/',['/'+name+'S']:String(blob.size)}),{method:'POST',body});
    if(await this.readText(name)!==text)throw Error(`${name}の保存結果が一致しません。`);
  }
  async identity(){
    const data=await this.command('[ESP420]json=yes',420);
    const chip=data.find(x=>x.id==='Chip ID')?.value;
    if(chip===undefined)throw Error('基板識別情報がありません。');return String(chip);
  }
  async capture() {
    const info=await this.idle(),identity=await this.identity();
    const settings=await this.command('[ESP400]json=yes',400);
    const filename=settings.find(x=>x.P==='Config/Filename')?.V;
    if(!/^[a-zA-Z0-9_.-]+\.ya?ml$/.test(filename))throw Error('対応できない機械設定ファイル名です。');
    // The firmware generator records current runtime values, including unsaved edits.
    await this.idle();
    await this.command('[ESP401]P=Config/Dump T=S V=mk-runtime.yaml json=yes',401);
    const config=yamlObject(await this.readText('mk-runtime.yaml'));
    const preferences=JSON.parse(await this.readText('preferences.json'));
    const features=Object.fromEntries(settings.filter(x=>FEATURE_KEYS.includes(x.P)).map(x=>[x.P,{type:x.T,value:x.V}]));
    const persistedConfig=await this.readText(filename);
    await this.idle();
    return validateSnapshot({version:1,createdAt:new Date().toISOString(),identity,firmware:info.FWVersion,filename,config,preferences,features,persistedConfig});
  }
  async compatible(snapshot){
    validateSnapshot(snapshot);const info=await this.idle();
    if(await this.identity()!==snapshot.identity || info.FWVersion!==snapshot.firmware)throw Error('保存時と基板またはFluidNCの版が異なります。復元を中止しました。');
  }
  async restore(baseline,selection=null) {
    await this.compatible(baseline);
    const before=await this.capture();
    const next=copy(before);
    const groups=['config','preferences','features'];
    for(const group of groups)next[group]=!selection?copy(baseline[group]):selection.group===group?restorePath(before[group],baseline[group],selection.path):before[group];
    if(!selection)next.filename=baseline.filename;
    // Back up before any effective setting change; recovery is explicit, never automatic.
    await this.upload(BACKUP_FILE,JSON.stringify(before));
    let writes=0;
    try {
      if(!equal(before.preferences,next.preferences)){await this.upload('preferences.json',JSON.stringify(next.preferences));writes++;}
      if(!selection || selection.group==='config'){
        await this.upload(next.filename,stringify(next.config));writes++;
      }
      for(const key of FEATURE_KEYS){
        const setting=next.features[key];if(!setting || equal(setting,before.features[key]))continue;
        const value=String(setting.value);
        if(/[\r\n\x00]/.test(value))throw Error('復元できない設定値です。');
        await this.idle();
        await this.command(`[ESP401]P=${key} T=${setting.type} V=${value.replaceAll(' ','\\ ')} json=yes`,401);writes++;
      }
      if(next.filename!==before.filename){await this.idle();await this.command(`[ESP401]P=Config/Filename T=S V=${next.filename} json=yes`,401);writes++;}
      const settings=await this.command('[ESP400]json=yes',400);
      for(const key of FEATURE_KEYS)if(next.features[key] && String(settings.find(x=>x.P===key)?.V)!==String(next.features[key].value))throw Error(`${key}の復元結果が一致しません。`);
      return {writes,restart:!selection || selection.group!=='preferences'};
    }catch(error){throw Error(`復元が途中で止まりました (${writes}件保存済み)。自動再試行はしません。${error.message}`);}
  }
  async restart(){await this.idle();await this.request('/command?'+new URLSearchParams({cmd:'[ESP444]RESTART'}));}
}
