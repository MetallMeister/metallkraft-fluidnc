import { PathCanvas } from '../src/toolpath.js';
import { createIcons, FolderOpen, RotateCcw, ZoomIn, ZoomOut, Square } from 'lucide';
import { previewLimits } from './preview-limits.mjs';
import { ToolPosition } from './tool-position.mjs';
import { PathTraversal } from './path-traversal.mjs';
import { TraversalCanvas } from './traversal-canvas.js';

createIcons({ icons: { FolderOpen, RotateCcw, ZoomIn, ZoomOut, Square } });
const input = document.querySelector('#gcode-file');
const info = document.querySelector('#preview-info');
const name = document.querySelector('#preview-filename');
const canvas = document.querySelector('#path-canvas');
const cancel = document.querySelector('#cancel-preview');
let loaded = null;
let remoteId = null;
const position = new ToolPosition();
const traversal = new PathTraversal();
let previewReadySent = false;
const marker = document.querySelector('#tool-marker');
const positionReadout = document.querySelector('#tool-position-readout');
const positionState = document.querySelector('#tool-position-state');
const positionValues = document.querySelector('#tool-position-values');
let pathWcs = '';
let connected = true;
let positionRequest = 0;
let unitAttempts = 0;
let retryUnitsOnIdle = false;
let refreshMetadataOnIdle = false;
const updateMarker = () => {
  if (loaded && !pathWcs) pathWcs = loaded.wcs || position.wcs;
  const point = position.position(loaded ? pathWcs : position.wcs, performance.now());
  const screen = point && view.projectPosition(point);
  marker.hidden = !screen || screen[0] < 7 || screen[1] < 7 || screen[0] > canvas.clientWidth - 7 || screen[1] > canvas.clientHeight - 7;
  positionReadout.dataset.available = String(Boolean(point));
  positionValues.textContent = point ? point.map((v,i)=>`${'XYZ'[i]} ${v.toFixed(3)}`).join(' / ') + ' mm' : '';
  positionState.textContent = !point ? '工具位置: 座標確認待ち' : marker.hidden ? '工具位置: 表示範囲外（全体表示で確認）' : '工具位置（作業座標）';
  if (marker.hidden) { delete marker.dataset.position; return; }
  marker.style.left = screen[0] + 'px'; marker.style.top = screen[1] + 'px';
  marker.dataset.position = point.join(',');
  marker.title = `工具位置 X ${point[0].toFixed(3)} / Y ${point[1].toFixed(3)} / Z ${point[2].toFixed(3)} mm（基板報告値）`;
};
const tellParent = data => { if (window.parent !== window) window.parent.postMessage(data, location.origin); };
const requestPositionMetadata = () => {
  const id = 'mk-tool-position-' + ++positionRequest;
  unitAttempts = 1;
  retryUnitsOnIdle = false;
  // Native extension callbacks also return HTTP-only settings replies.
  for (const content of ['$/report_inches', '$G']) tellParent({ type: 'cmd', target: 'webui', id, content });
};
const initializePosition = () => {
  refreshMetadataOnIdle = false;
  tellParent({ kind: 'mk-preview-reloaded' });
  requestPositionMetadata();
};
const view = new PathCanvas(canvas, { background: '#080808', grid: '#242424', rapid: '#909090', cut: '#fff', text: '#ccc', origin: '#e0c96a', padding: 48, axes: ['#ddd','#ddd','#ddd'] }, () => {
  traversed.redraw();
  if (!loaded) { updateMarker(); return; }
  const spans = loaded.bounds.max.map((v,i) => (v - loaded.bounds.min[i]).toFixed(2));
  info.textContent = `X ${spans[0]} / Y ${spans[1]} / Z ${spans[2]} mm`;
  info.title = loaded.notice;
  info.dataset.state = 'ready';
  cancel.disabled = true;
  updateMarker();
  if (remoteId !== null && !previewReadySent) { previewReadySent = true; tellParent({ kind: 'mk-preview-ready', id: remoteId }); }
});
const traversed = new TraversalCanvas(document.querySelector('#traversed-path'), view, traversal);
view.onDrawStart = () => traversed.invalidate();
const clearTraversal = () => { traversal.setPath(null); traversed.redraw(); };
const receiveLine = line => {
  const now = performance.now();
  position.accept(line, now);
  if (/^(?:Grbl |FluidNC |ALARM:)/.test(line)) {
    // A controller reset need not disconnect its WebSocket. Revalidate units/WCS
    // on the next Idle report, without clearing the selected file or moving axes.
    refreshMetadataOnIdle = true;
    positionRequest++;
    retryUnitsOnIdle = false;
    traversal.clear(); traversed.redraw(); return;
  }
  if (!line.startsWith('<')) return;
  const context = JSON.stringify([position.wcs, position.units, position.status.WCO || null]);
  const result = traversal.accept(line, position.position(pathWcs, now), now, context, position.units);
  if (result.reset) traversed.redraw();
  else if (result.range) traversed.add(result.range);
};
const showReference = () => {
  clearTraversal();
  // A scale grid, not machine travel limits or a fabricated machining path.
  view.setPath({ bounds:{min:[-50,-50,0],max:[50,50,0]}, segments:[], reference:true, wcs:position.wcs });
};
const modeButtons = document.querySelectorAll('button[data-view-mode]');
const selectMode = mode => {
  view.setMode(mode);
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewMode === mode)));
  canvas.setAttribute('aria-label', mode === '2d' ? '加工予定経路の2Dプレビュー (XY・真上)' : '加工予定経路の3Dプレビュー');
  canvas.title = mode === '2d' ? 'ドラッグ: 平行移動 / ホイール: 拡大縮小 / 全体表示: 中央へ戻す' : 'ドラッグ: 回転 / 右ドラッグ・Shift＋ドラッグ: 平行移動 / ホイール: 拡大縮小';
};
modeButtons.forEach(button => button.addEventListener('click', () => selectMode(button.dataset.viewMode)));
selectMode('2d');
showReference();
let worker, timeout, generation = 0;
const stopWorker = () => { clearTimeout(timeout); worker?.terminate(); worker = null; };
const fail = message => {
  stopWorker();
  loaded = null;
  clearTraversal();
  marker.hidden = true;
  view.setPath(null);
  cancel.disabled = true;
  info.textContent = message;
  info.dataset.state = 'error';
  if (remoteId !== null) tellParent({ kind: 'mk-preview-error', id: remoteId });
};

async function loadFile(file, selectionId = null) {
  remoteId = selectionId;
  previewReadySent = false;
  const job = ++generation;
  stopWorker();
  loaded = null;
  clearTraversal();
  marker.hidden = true;
  view.setPath(null);
  info.dataset.state = '';
  name.textContent = file.name;
  name.title = file.name;
  if (file.size > previewLimits.maxBytes) { fail('表示上限: 20 MB。CAMで経路を確認してください。'); return; }
  cancel.disabled = false;
  info.dataset.state = 'loading';
  info.textContent = '経路を解析中…';
  try {
    const text = await file.text();
    if (job !== generation) return;
    const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' }));
    try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
    worker.onmessage = ({ data }) => {
      if (job !== generation) return;
      if (data.type === 'progress') { info.textContent = `経路を解析中… ${Math.floor(data.value * 100)}%`; return; }
      stopWorker();
      if (data.issue) { fail(data.issue); return; }
      if (!data.bounds) { fail('表示できる経路がありません。'); return; }
      loaded = data;
      pathWcs = data.wcs || position.wcs;
      traversal.setPath(data, remoteId === null ? '' : file.name);
      info.textContent = '経路を描画中…';
      view.setPath(data);
      document.querySelector('#limitations').textContent = remoteId === null ? 'PCプレビュー / 衝突判定なし' : '白: 予定 / 灰: 通過推定';
      document.querySelector('#limitations').title = data.notice + ' 黄色はファイル原点。青い点は同じワーク座標系での工具位置（基板報告値、実測値ではありません）。灰色は連続した報告座標と経路を照合した通過推定です。通信の空白・重複経路・照合できない区間は白のまま残し、完了を保証しません。';
    };
    worker.onerror = () => { if (job === generation) fail('経路を表示できません。CAMで確認してください。'); };
    timeout = setTimeout(() => { if (job === generation) fail('解析が30秒を超えたため中止しました。'); }, previewLimits.timeoutMs);
    worker.postMessage(text);
  } catch { if (job === generation) fail('ファイルを読み込めませんでした。'); }
}
input.addEventListener('change', () => {
  const file = input.files[0]; input.value = '';
  if (!file) return;
  tellParent({ kind: 'mk-preview-local' });
  loadFile(file);
});
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== location.origin) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'cmd' && data.id === 'mk-tool-position-' + positionRequest) {
    if (data.content?.status === 'success' && typeof data.content.response === 'string') {
      for (const line of data.content.response.split(/\r?\n/)) receiveLine(line.trim());
    }
    // FluidNC may reject settings reads during motion. Retry once on a native Idle report.
    if (data.content?.initiator?.content === '$/report_inches') retryUnitsOnIdle = !position.units && unitAttempts < 2;
    updateMarker();
  } else if (['stream','response'].includes(data.type) && typeof data.content === 'string') {
    for (const report of data.content.match(/<[^>]+>/g) || []) tellParent({ kind: 'mk-preview-status', report });
    for (const line of data.content.split(/\r?\n/)) receiveLine(line.trim());
    updateMarker();
    if (refreshMetadataOnIdle && /<Idle\|/.test(data.content)) {
      refreshMetadataOnIdle = false;
      requestPositionMetadata();
    } else if (retryUnitsOnIdle && /<Idle\|/.test(data.content)) {
      retryUnitsOnIdle = false; unitAttempts++;
      tellParent({type:'cmd',target:'webui',id:'mk-tool-position-'+positionRequest,content:'$/report_inches'});
    }
  } else if (data.type === 'notification' && typeof data.content?.isConnected === 'boolean') {
    if (!data.content.isConnected) {
      connected = false; positionRequest++; retryUnitsOnIdle = false; position.reset(); traversal.clear(); traversed.redraw(); updateMarker(); tellParent({ kind: 'mk-preview-disconnected' });
    } else if (!connected) {
      connected = true; initializePosition();
    }
  }
  else if (data.kind === 'mk-file-load' && Number.isSafeInteger(data.id) && typeof data.name === 'string' && typeof data.text === 'string' && data.text.length <= previewLimits.maxBytes) {
    loadFile(new File([data.text], data.name), data.id);
  } else if (data.kind === 'mk-file-clear') {
    generation++; remoteId = null; stopWorker(); loaded = null; showReference();
    name.textContent = ''; name.title = ''; info.textContent = ''; info.dataset.state = ''; cancel.disabled = true;
  }
});
initializePosition();
document.querySelector('#open-preview').addEventListener('click', () => input.click());
document.querySelector('#fit-preview').addEventListener('click', () => view.fit(position.position(loaded ? pathWcs : position.wcs, performance.now())));
document.querySelector('#zoom-in').addEventListener('click', () => view.scale(1.2));
document.querySelector('#zoom-out').addEventListener('click', () => view.scale(1/1.2));
cancel.addEventListener('click', () => { generation++; fail('プレビューを中止しました。'); });
window.addEventListener('pagehide', stopWorker);
// Refresh marker visibility only; tracing consumes received reports, not a poller.
const markerTimer = setInterval(updateMarker, 500);
window.addEventListener('pagehide', () => clearInterval(markerTimer));
window.addEventListener('pagehide', () => traversed.invalidate());
