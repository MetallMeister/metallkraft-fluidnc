// Mounted by the pinned Files render patch. Only native sendSerialCmd executes a job.
export function useFileWorkflow(hooks, jsx, state, actions, files, machine, confirm, modals, Play) {
  const { eJ: useState, sO: useRef, d4: useEffect } = hooks;
  const [, repaint] = useState(0);
  const ref = useRef(null);
  if (!ref.current) ref.current = { id: Math.floor(Math.random() * 2 ** 48), selected: null, lastStatus: 0, report: '', stage: 'empty', message: '加工ファイルを選択', abort: null };
  const m = ref.current;
  m.context = { state, actions, files, machine };
  const refresh = () => repaint(n => n + 1);
  const frame = () => document.querySelector('#extra_content_metallkraft-preview iframe')?.contentWindow;
  const post = message => frame()?.postMessage(message, location.origin);
  const idle = () => m.context.machine.status?.state === 'Idle' && m.report === 'Idle' && performance.now() - m.lastStatus < 3000 && !document.hidden;
  const clear = (message = '加工ファイルを選択', clearPreview = true) => {
    m.abort?.abort(); m.abort = null; m.id++; m.selected = null; m.stage = 'empty'; m.message = message;
    if (clearPreview) post({ kind: 'mk-file-clear' }); refresh();
  };
  const fail = message => { m.abort?.abort(); m.stage = 'error'; m.message = message; post({ kind: 'mk-file-clear' }); refresh(); };
  const available = () => idle() && !m.context.state.isLoading && m.context.state.fileSystem === m.selected?.fs && m.context.state.filePath === m.selected?.path && m.context.state.filesList?.files?.some(f => f.name === m.selected.name && String(f.size) === m.selected.size);
  const read = async selected => {
    const controller = new AbortController(); m.abort?.abort(); m.abort = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(selected.url, { method: 'GET', signal: controller.signal, cache: 'no-store', redirect: 'error' });
      if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw Error('SDのファイルを読み込めません');
      const reader = response.body.getReader(), chunks = []; let bytes = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.length;
        if (bytes > 20 * 1024 * 1024) { controller.abort(); throw Error('表示上限は20 MBです'); }
        chunks.push(part.value);
      }
      if (bytes !== Number(selected.size)) throw Error('ファイルが変更されています。一覧を更新してください');
      return await new Blob(chunks).text();
    } finally { clearTimeout(timeout); }
  };
  const canSelect = line => state.fileSystem === 'DIRECTSD' && Number(line.size) >= 0 && files.capability(state.fileSystem, 'Process', state.filePath, line.name);
  const select = async line => {
    clear();
    if (!canSelect(line) || !idle()) { fail('待機中・通信接続中にファイルを選択してください'); return; }
    const path = state.filePath || '/';
    if (/[\r\n\x00]/.test(path + line.name) || /[\\/]/.test(line.name) || ['.', '..'].includes(line.name) || path.split('/').includes('..')) { fail('使用できないファイル名です'); return; }
    const fullPath = (path.endsWith('/') ? path : path + '/') + line.name;
    const selected = { name: line.name, path, fs: state.fileSystem, size: String(line.size), url: '/sd' + fullPath.split('/').map(encodeURIComponent).join('/'), fullPath };
    const id = m.id; m.selected = selected; m.stage = 'loading'; m.message = 'SDから読み込み中'; refresh();
    if (Number(line.size) > 20 * 1024 * 1024) { fail('表示上限は20 MBです'); return; }
    try {
      const text = await read(selected);
      if (id !== m.id) return;
      if (!available() || !frame()) { clear('待機状態と経路画面を確認して再選択'); return; }
      selected.text = text;
      m.message = '経路を確認中'; refresh();
      post({ kind: 'mk-file-load', id, name: selected.fullPath, text });
    } catch (error) { if (id === m.id) fail(error.name === 'AbortError' ? '読み込みが中断されました。再選択してください' : error.message); }
  };
  const start = async () => {
    if (m.stage !== 'ready' || !available()) return;
    const id = m.id, selected = m.selected;
      m.stage = 'checking'; m.message = '実行ファイルを照合中'; refresh();
      try {
        const text = await read(selected);
        if (id !== m.id) return;
        if (!available()) { clear('待機状態を確認して再選択'); return; }
        if (text !== selected.text) { clear('SDの内容が変更されました。再選択してください'); return; }
        // Consume the selection before calling the original command builder/sender.
        m.stage = 'sent'; m.message = '開始指令を送信済み'; m.selected = null; refresh();
        const cmd = files.command(selected.fs, 'play', selected.path, selected.name);
        actions.sendSerialCmd(cmd.cmd);
      } catch (error) { if (id === m.id) fail('ファイルを照合できません。再選択してください'); }
  };
  useEffect(() => {
    const listener = event => {
      if (event.source !== frame() || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.kind === 'mk-preview-status' && typeof data.report === 'string') {
        const report = data.report.match(/^<(Idle|Run|Hold|Jog|Home|Alarm|Door|Check|Sleep|Tool)(?::\d+)?\|/);
        if (!report) return;
        const wasIdle = idle(); m.report = report[1]; m.lastStatus = performance.now();
        if (m.report !== 'Idle' && m.selected && !(m.stage === 'ready' && ['Jog', 'Home'].includes(m.report))) clear('動作中です。終了後にファイルを選択');
        else if (wasIdle !== idle()) refresh();
      } else if (data.kind === 'mk-preview-ready' && data.id === m.id && m.stage === 'loading') {
        m.stage = 'ready'; m.message = '経路を確認して加工開始'; refresh();
      } else if (data.kind === 'mk-preview-error' && data.id === m.id) fail('経路を表示できません。ファイルを確認してください');
      else if (data.kind === 'mk-preview-local') clear('SDのファイルを選択してください', false);
      else if (['mk-preview-reloaded', 'mk-preview-disconnected'].includes(data.kind)) {
        clear('ファイルを再選択してください');
      }
    };
    const visibility = () => { if (document.hidden && m.selected) clear('画面に戻ったらファイルを再選択'); };
    const stop = event => { if (event.target.closest?.('#btnEStop') && m.selected) clear('停止を選択しました。ファイルを再選択'); };
    window.addEventListener('message', listener); document.addEventListener('visibilitychange', visibility);
    document.addEventListener('click', stop, true);
    const timer = setInterval(() => { if (m.selected && performance.now() - m.lastStatus >= 3000) clear('通信状態を確認してファイルを再選択'); }, 500);
    return () => { window.removeEventListener('message', listener); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('click', stop, true); clearInterval(timer); m.abort?.abort(); m.id++; post({ kind: 'mk-file-clear' }); };
  }, []);
  useEffect(() => { if (m.selected && (state.isLoading || state.fileSystem !== m.selected.fs || state.filePath !== m.selected.path || !state.filesList?.files?.some(f => f.name === m.selected.name && String(f.size) === m.selected.size))) clear(); }, [state.fileSystem, state.filePath, state.isLoading, state.filesList]);
  return {
    select, canSelect, clear,
    selected: line => m.selected?.name === line.name && m.selected.fs === state.fileSystem && m.selected.path === state.filePath,
    render: () => jsx('section', { class: 'mk-job-start', 'aria-label': '加工開始', children: [
      jsx('div', { class: 'mk-selected-file', 'data-phase': m.stage, children: [jsx('strong', { title: m.selected?.fullPath || '', children: m.selected ? 'SD: ' + m.selected.fullPath : '加工ファイル未選択' }), jsx('span', { role: 'status', title: m.message, children: m.message })] }),
      jsx('button', { id: 'mk-start-job', class: 'btn tooltip do-not-disable', 'data-tooltip': '選択したSDファイルを確認し、加工を開始します。選択だけでは動きません。', disabled: m.stage !== 'ready' || !available(), onClick: start, children: [jsx(Play, {}), jsx('span', { children: '加工開始' })] }),
    ] }),
  };
}
