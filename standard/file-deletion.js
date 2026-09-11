// Selection/confirmation only; each removal uses the existing files-manager action.
export function useFileDeletion(hooks, jsx, state, actions, files, machine, confirm, modals, Trash, clearPreview) {
  const {eJ:useState,sO:useRef,d4:useEffect}=hooks;
  const [,paint]=useState(0), ref=useRef(null);
  if (!ref.current) ref.current={selected:new Set(),context:null,job:null,message:'',timer:null,last:0,report:''};
  const m=ref.current, refresh=()=>paint(n=>n+1);
  m.context={state,actions,machine};
  const key=()=>JSON.stringify([m.context.state.fileSystem,m.context.state.filePath]);
  const idle=()=>m.context.machine.status?.state==='Idle' && m.report==='Idle' && performance.now()-m.last<3000 && !document.hidden;
  const healthy=()=>['Ok','ok','OK','S126'].includes(m.context.state.filesList?.status);
  const eligible=e=>m.context.state.fileSystem==='DIRECTSD' && Number(e.size)>=0 && !e.name.startsWith('.') && !/[\\/\r\n\x00]/.test(e.name) && files.capability('DIRECTSD','DeleteFile',m.context.state.filePath,e.name);
  const entries=()=>m.context.state.filesList?.files?.filter(eligible)||[];
  const ready=()=>idle() && healthy() && !m.context.state.isLoading && !m.job;
  const finish=message=>{clearTimeout(m.timer);m.timer=null;m.job=null;m.selected.clear();m.message=message;refresh();};
  const current=e=>entries().find(f=>f.name===e.name && String(f.size)===String(e.size));
  const advance=()=>{
    const job=m.job;
    if(!job)return;
    if(!idle() || job.context!==key() || !healthy()) {finish('削除を中断しました。状態と一覧を確認してください。');return;}
    if(m.context.state.isLoading)return;
    if(job.pending){
      if(m.context.state.filesList===job.list)return;
      if(m.context.state.filesList.files.some(f=>f.name===job.pending.name)){finish('削除できませんでした。残りの削除は中止しました。');return;}
      clearTimeout(m.timer);m.timer=null;job.pending=null;job.done++;
    }
    if(!job.remaining.length){finish(`${job.done}件を削除しました。`);return;}
    const entry=job.remaining.shift();
    if(!current(entry)){finish('ファイル一覧が変わったため削除を中断しました。');return;}
    job.pending=entry;job.list=m.context.state.filesList;
    m.message=`削除中 ${job.done+1}/${job.total}件`;
    m.timer=setTimeout(()=>{if(m.job===job)finish('応答を確認できないため中断しました。一覧を更新してください。');},20000);
    refresh();
    try {m.context.actions.deleteCommand(entry);} catch {finish('削除できませんでした。残りの削除は中止しました。');}
  };
  const ask=list=>{
    if(!ready() || !list.length || !list.every(current))return;
    const snapshot=list.map(e=>({name:e.name,size:e.size})), context=key();
    confirm({modals,title:'削除しますか？',content:jsx('div',{class:'mk-delete-confirm',children:[jsx('p',{children:`${snapshot.length}件のファイルを削除します。この操作は元に戻せません。`}),jsx('ul',{children:snapshot.map(e=>jsx('li',{children:e.name}))})]}),
      button1:{text:'削除する',cb:()=>{
        if(!ready() || context!==key() || !snapshot.every(current)){m.message='状態が変わったため削除しませんでした。';refresh();return;}
        clearPreview('ファイルを再選択してください');
        m.job={context,remaining:[...snapshot],total:snapshot.length,done:0,pending:null};advance();
      }},button2:{text:'キャンセル'}});
  };
  useEffect(()=>{
    const listener=event=>{
      const frame=document.querySelector('#extra_content_metallkraft-preview iframe')?.contentWindow;
      if(event.source!==frame || event.origin!==location.origin || event.data?.kind!=='mk-preview-status')return;
      const report=event.data.report?.match(/^<([^|:>]+)/)?.[1];
      const previous=m.report;m.report=report||'';m.last=performance.now();
      if(previous!==m.report){if(m.job && m.report!=='Idle')finish('動作状態が変わったため残りの削除を中止しました。');else refresh();}
    };
    const timer=setInterval(()=>{if(m.job&&!idle())finish('通信・動作状態を確認できないため残りの削除を中止しました。');},500);
    window.addEventListener('message',listener);
    return()=>{window.removeEventListener('message',listener);clearInterval(timer);clearTimeout(m.timer);m.job=null;};
  },[]);
  useEffect(()=>{
    if(m.selectionContext!==key()){m.selected.clear();m.selectionContext=key();m.message='';refresh();}
    else {const names=new Set(entries().map(e=>e.name));for(const name of m.selected)if(!names.has(name))m.selected.delete(name);}
    advance();
  },[state.filePath,state.fileSystem,state.filesList,state.isLoading,machine.status?.state]);
  const disabled=!ready();
  const button=(label,onClick,off,icon=true)=>jsx('button',{type:'button',class:'btn mk-delete-button',disabled:off,'data-operation-disabled':off?'':undefined,'aria-label':label,title:label,onClick,children:icon?jsx(Trash,{}):label});
  return {
    checkbox:e=>eligible(e)?jsx('input',{type:'checkbox',class:'mk-delete-check',checked:m.selected.has(e.name),disabled,'data-operation-disabled':disabled?'':undefined,'aria-label':`${e.name}を削除対象に選択`,onChange:event=>{event.currentTarget.checked?m.selected.add(e.name):m.selected.delete(e.name);refresh();}}):null,
    remove:e=>button(`${e.name}を削除`,()=>ask([e]),disabled||!eligible(e)),
    toolbar:()=>jsx('div',{class:'mk-delete-toolbar',children:[jsx('label',{children:[jsx('input',{type:'checkbox',disabled:disabled||!entries().length,'data-operation-disabled':disabled?'':undefined,checked:entries().length>0&&entries().every(e=>m.selected.has(e.name)),onChange:event=>{m.selected=event.currentTarget.checked?new Set(entries().map(e=>e.name)):new Set();refresh();},'aria-label':'表示中のファイルを全選択'}),'全選択']}),button(`選択した${m.selected.size}件を削除`,()=>ask(entries().filter(e=>m.selected.has(e.name))),disabled||!m.selected.size,false),m.message?jsx('span',{role:'status',class:'mk-delete-result',children:m.message}):null]})
  };
}
