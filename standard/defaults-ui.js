import { DefaultsController, BASELINE_FILE, BACKUP_FILE, differences } from './defaults-core.js';

const nativeState=()=>{
  const status=document.querySelector('#statusPanel .status-ctrls[data-machine-state]');
  const spindle=document.querySelector('#SpindlePanel .extra-control[data-tooltip="モード"] .extra-control-value');
  const speed=document.querySelector('#SpindlePanel .extra-control[data-tooltip^="主軸回転数指令"] .extra-control-value');
  if(!status||!spindle||!speed)throw Error('機械の状態を確認できません。操作画面へ戻って接続を確認してください。');
  return {machine:status.dataset.machineState,spindle:spindle.textContent.trim(),speed:speed.textContent.trim()};
};
const controller=new DefaultsController(location.origin,nativeState);
let baseline,current,busy=false,pending=false,returnHash='';
const labels={config:'機械設定（FluidNC）',preferences:'画面・インターフェース',features:'動作・表示の機能設定'};
const dialog=document.createElement('dialog');dialog.id='mk-defaults-dialog';
dialog.innerHTML=`<div class="mk-defaults-head"><h2>標準に戻す</h2><button type="button" id="mk-defaults-close" aria-label="閉じる">×</button></div>
<p>この基板に保存した標準設定へ戻します。Wi-Fi・接続情報とSDカードは変更しません。</p>
<p id="mk-defaults-date"></p><p id="mk-defaults-status" role="status"></p>
<div id="mk-defaults-rows"></div><div class="mk-defaults-actions">
<button type="button" id="mk-defaults-refresh">比較を更新</button><button type="button" id="mk-defaults-all">すべて標準に戻す</button>
<button type="button" id="mk-defaults-apply" hidden>再起動して適用</button></div>
<details><summary>標準設定・バックアップ</summary><p>標準設定の保存は、機械と主軸を停止し、設定を確認してから行ってください。</p>
<button type="button" id="mk-defaults-save">現在の設定を標準として保存</button>
<button type="button" id="mk-defaults-backup">復元直前のバックアップに戻す</button></details>`;
document.body.append(dialog);
const el=id=>dialog.querySelector('#mk-defaults-'+id);
const message=text=>{el('status').textContent=text;};
const valueText=value=>value===undefined?'未設定':typeof value==='object'?JSON.stringify(value):String(value);
function controls(){
  dialog.querySelectorAll('button').forEach(button=>{button.disabled=busy;});
  el('all').disabled=busy||!baseline||pending;
  el('save').disabled=busy||pending;
  el('refresh').disabled=busy||pending;
  dialog.querySelectorAll('.mk-defaults-row button').forEach(button=>{button.disabled=busy||pending;});
  el('apply').hidden=!pending;
  el('apply').textContent=el('apply').dataset.reload==='yes'?'画面を再読み込み':'再起動して適用';
}
async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(error){message(error.message);}finally{busy=false;controls();}}
function render(){
  el('date').textContent=baseline?`標準の保存日時: ${new Date(baseline.createdAt).toLocaleString()}`:'この基板には標準設定がまだ保存されていません。';
  el('rows').replaceChildren();
  if(!baseline||!current)return;
  for(const group of Object.keys(labels)){
    const changes=differences(current[group],baseline[group]);
    const section=document.createElement('section'),heading=document.createElement('h3');
    heading.textContent=`${labels[group]}: ${changes.length?`${changes.length}項目が標準と異なります`:'標準と同じ'}`;
    section.append(heading);
    for(const change of changes){
      const row=document.createElement('div');row.className='mk-defaults-row';
      const title=document.createElement('strong');title.textContent=change.path.join(' / ');
      const values=document.createElement('div');values.className='mk-defaults-values';
      for(const [label,value] of [['現在',change.current],['標準',change.standard]]){const span=document.createElement('span');span.textContent=`${label}: ${valueText(value)}`;values.append(span);}
      const button=document.createElement('button');button.type='button';button.textContent='標準に戻す';
      button.onclick=()=>restore(baseline,{group,path:change.path});row.append(title,values,button);section.append(row);
    }
    el('rows').append(section);
  }
  controls();
}
async function refresh(){
  message('停止状態と現在の設定を確認しています…');
  baseline=await controller.readSnapshot();
  await controller.compatible(baseline);current=await controller.capture();render();
  message('黄色の項目が標準との差分です。通信・通知の接続設定、座標のゼロ点、SDファイルは対象外です。');
}
async function restore(snapshot,selection=null){
  const what=selection?`${labels[selection.group]}の ${selection.path.join(' / ')}`:'画面・機械・機能設定';
  if(!confirm(`${what}を保存した値に戻しますか？\nWi-Fi・接続設定とSDカードは保持します。機械・主軸が停止していることを確認してください。`))return;
  await task(async()=>{
    message('バックアップを保存して復元しています。画面を閉じないでください。');
    const result=await controller.restore(snapshot,selection);
    pending=true;el('apply').dataset.reload=result.restart?'no':'yes';
    sessionStorage.setItem('mk-restore-pending',JSON.stringify({restart:result.restart}));
    message(result.restart?'復元ファイルを保存しました。機械設定は再起動後に適用されます。':'画面設定を復元しました。再読み込みで適用します。');
  });
}
el('close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{if(returnHash){const target=returnHash;returnHash='';location.hash=target;}});
dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
el('refresh').onclick=()=>task(refresh);
el('all').onclick=()=>restore(baseline);
el('backup').onclick=()=>task(async()=>{
  const backup=await controller.readSnapshot(BACKUP_FILE);
  if(!confirm('復元直前に保存した画面・機械設定へ戻しますか？'))return;
  const result=await controller.restore(backup);
  pending=true;el('apply').dataset.reload='no';sessionStorage.setItem('mk-restore-pending',JSON.stringify({restart:result.restart}));
  message('バックアップを書き戻しました。再起動して適用してください。');
});
el('save').onclick=()=>{
  if(!confirm('今の設定を、この基板の標準として保存しますか？既存の標準設定があれば置き換わります。'))return;
  task(async()=>{current=await controller.capture();await controller.upload(BASELINE_FILE,JSON.stringify(current));baseline=current;render();message('この基板の標準設定を保存しました。');});
};
el('apply').onclick=()=>task(async()=>{
  if(el('apply').dataset.reload==='yes'){sessionStorage.removeItem('mk-restore-pending');location.reload();return;}
  if(!confirm('機械・主軸を停止した状態で基板を再起動します。再起動後は位置・原点を確認してください。'))return;
  message('再起動を要求しています…');
  await controller.restart();sessionStorage.removeItem('mk-restore-pending');
  message('再起動を要求しました。10秒後に画面を読み直します。');setTimeout(()=>location.reload(),10000);
});
const settingsRoutes=new Set(['#/settings/features','#/settings/interface','#/settings/machine']);
const waitForMachineState=async()=>{
  for(let i=0;i<60;i++){
    try{return nativeState();}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error('機械の状態を確認できません。操作画面へ戻って接続を確認してください。');
};
async function openDialog(){
  returnHash=location.hash;
  if(!document.querySelector('#statusPanel'))location.hash='#/dashboard';
  dialog.showModal();
  try{
    await waitForMachineState();
    const saved=sessionStorage.getItem('mk-restore-pending');
    if(saved){pending=true;el('apply').dataset.reload=JSON.parse(saved).restart?'no':'yes';message('前回の復元後の適用が必要です。再読み込みだけでは機械設定は適用されません。');controls();return;}
    task(refresh);
  }catch(error){message(error.message);}
}
function mount(){
  const existing=document.querySelector('#mk-defaults-open');
  if(!settingsRoutes.has(location.hash)){existing?.remove();return;}
  const refresh=[...document.querySelectorAll('button[data-tooltip="情報を更新"]')].find(button=>!button.closest('#mk-defaults-dialog'));
  if(!refresh){existing?.remove();return;}
  const row=refresh.parentElement;
  if(existing){if(existing.parentElement!==row)row.append(existing);return;}
  const button=document.createElement('button');button.type='button';button.id='mk-defaults-open';
  button.className=refresh.className;button.dataset.tooltip='画面・機械・機能設定を保存した標準へ戻す';
  button.innerHTML='<div class="insensitive text-straight"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg><label class="hide-low">標準に戻す</label></div>';
  button.onclick=openDialog;row.append(button);
}
new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
