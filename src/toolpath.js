import Toolpath from 'gcode-toolpath';
import { parseLine } from 'gcode-parser';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { Vector3 } from 'three/src/math/Vector3.js';

const axisKeys = ['x', 'y', 'z'];
const supportedG = new Set([0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 28, 30, 40, 49, 53, 54, 55, 56, 57, 58, 59, 80, 90, 91, 91.1, 94]);
const supportedM = new Set([0, 1, 2, 3, 4, 5, 7, 8, 9, 30]);
const point = p => [p.x, p.y, p.z];

// CNCjs supplies modal positions and arc centers. This adapter bounds work and
// rejects constructs it cannot represent instead of drawing guessed geometry.
export function parseToolpath(text, { maxSegments = 50000, maxLines = 60000, packed = false, onProgress } = {}) {
  const segments = [], bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let segmentCount = 0, capacity = 0, positions, rapids;
  let units = false, distance = false, known = new Set(), include = false, line = 0, wcs = '', motion = null, ended = false, omitted = false;
  const fail = message => { throw new Error(`${line}行: ${message}`); };
  const add = (a, b, rapid) => {
    if (!include) return;
    if (![...a, ...b].every(n => Number.isFinite(n) && Math.abs(n) <= 1000000)) fail('座標を表示できません');
    if (a.every((n, i) => n === b[i])) return;
    if (segmentCount >= maxSegments) fail(`線分の表示上限（${maxSegments.toLocaleString()}）を超えています`);
    if (packed) {
      if (segmentCount === capacity) {
        capacity = Math.min(maxSegments, Math.max(4096, capacity * 2));
        const nextPositions = new Float64Array(capacity * 6), nextRapids = new Uint8Array(capacity);
        if (positions) { nextPositions.set(positions); nextRapids.set(rapids); }
        positions = nextPositions; rapids = nextRapids;
      }
      positions.set(a, segmentCount * 6); positions.set(b, segmentCount * 6 + 3);
      rapids[segmentCount] = Number(rapid);
    } else segments.push({ a, b, rapid, line });
    segmentCount++;
    for (let i = 0; i < 3; i++) { bounds.min[i] = Math.min(bounds.min[i], a[i], b[i]); bounds.max[i] = Math.max(bounds.max[i], a[i], b[i]); }
  };
  const engine = new Toolpath({
    addLine: (modal, a, b) => add(point(a), point(b), modal.motion === 'G0'),
    addArcCurve: (modal, a, b, center) => {
      if (!include) fail('円弧の開始位置が不明です');
      const r = Math.hypot(a.x - center.x, a.y - center.y), endR = Math.hypot(b.x - center.x, b.y - center.y);
      if (!Number.isFinite(r) || r < 0.000001 || Math.abs(r - endR) > Math.max(0.005, r * 0.001)) fail('円弧の半径が不整合です');
      const start = Math.atan2(a.y - center.y, a.x - center.x), end = Math.atan2(b.y - center.y, b.x - center.x);
      let sweep = end - start;
      if (modal.motion === 'G2') { if (sweep >= -1e-10) sweep -= Math.PI * 2; }
      else if (sweep <= 1e-10) sweep += Math.PI * 2;
      const count = Math.max(8, Math.ceil(Math.abs(sweep) / Math.min(Math.PI / 36, 2 * Math.acos(Math.max(-1, 1 - 0.01 / r)))));
      if (!Number.isFinite(count) || count > maxSegments - segmentCount) fail('円弧の表示上限を超えています');
      // CNCjs emits arc vectors in the active plane's XY frame.
      const unplane = p => modal.plane === 'G18' ? [p[1], p[2], p[0]] : modal.plane === 'G19' ? [p[2], p[0], p[1]] : p;
      let previous = unplane(point(a));
      for (let i = 1; i <= count; i++) {
        const t = i / count, angle = start + sweep * t;
        const next = unplane(i === count ? point(b) : [center.x + r * Math.cos(angle), center.y + r * Math.sin(angle), a.z + (b.z - a.z) * t]);
        add(previous, next, false); previous = next;
      }
    }
  });
  try {
    const lines = text.split(/\r\n|\r|\n/);
    if (lines.length > maxLines) fail(`行数の表示上限（${maxLines.toLocaleString()}）を超えています`);
    for (let index = 0; index < lines.length && !ended; index++) {
      line = index + 1;
      if (onProgress && index % 4096 === 0) onProgress(index / lines.length);
      if (lines[index].length > 1024) fail('1行が長すぎます');
      const parsed = parseLine(lines[index].toUpperCase(), { lineMode: 'compact' });
      const compact = parsed.line;
      if (!compact || compact === '%') continue;
      if (compact.replace(/[A-Z][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g, '')) fail('変数・式・マクロ等は未対応です');
      const words = parsed.words;
      if (words.some(([key, value]) => !'NGMXYZIJKRFSTP'.includes(key) || !Number.isFinite(value))) fail('未対応の軸または命令です');
      const g = words.filter(w => w[0] === 'G').map(w => w[1]), m = words.filter(w => w[0] === 'M').map(w => w[1]);
      const unsupported = g.find(v => !supportedG.has(v));
      if (unsupported !== undefined) fail(`G${unsupported} は経路表示の対象外です`);
      const unsupportedM = m.find(v => !supportedM.has(v));
      if (unsupportedM !== undefined) fail(`M${unsupportedM} は経路表示の対象外です`);
      for (const group of [[0,1,2,3,80], [17,18,19], [20,21], [90,91], [54,55,56,57,58,59]]) if (g.filter(v => group.includes(v)).length > 1) fail('同一モーダル群の重複です');
      for (const key of 'XYZIJKRFSTP') if (words.filter(w => w[0] === key).length > 1) fail(`${key} が重複しています`);
      const nextWCS = g.find(v => v >= 54 && v <= 59);
      if (nextWCS !== undefined) { if (wcs && wcs !== `G${nextWCS}`) fail('複数のワーク座標系は未対応です'); wcs = `G${nextWCS}`; }
      const args = words.filter(w => 'XYZIJKRFSP'.includes(w[0]));
      const xyz = args.filter(w => 'XYZ'.includes(w[0]));
      if (g.some(v => v === 20 || v === 21)) units = true;
      if (g.some(v => v === 90 || v === 91)) distance = true;
      const nextMotion = g.find(v => [0,1,2,3,80].includes(v));
      if (nextMotion !== undefined) motion = nextMotion;
      // Normalize modal words before the motion regardless of source word order.
      for (const code of g.filter(v => ![0,1,2,3,4,28,30,53,80,91.1].includes(v))) engine.loadFromStringSync(`G${code}`);
      if (g.some(v => [28,30,53].includes(v))) {
        omitted = true;
        if (xyz.length) xyz.forEach(([key]) => known.delete(key)); else known.clear();
        continue;
      }
      if (g.includes(4)) { if (xyz.length) fail('G4 と軸移動の混在は未対応です'); continue; }
      const hasMotion = xyz.length || args.some(w => 'IJKR'.includes(w[0]));
      if (hasMotion) {
        if (!units || !distance) fail('移動前に G20/G21 と G90/G91 を指定してください');
        if (motion === null || motion === 80) fail('移動モードが指定されていません');
        const absolute = engine.getModal().distance === 'G90';
        if (!absolute && xyz.some(([key]) => !known.has(key))) fail('相対移動の開始位置が不明です');
        include = known.size === 3;
        if (absolute) xyz.forEach(([key]) => known.add(key));
        if (motion >= 2 && !args.some(w => 'IJKR'.includes(w[0]))) fail('円弧中心または半径が必要です');
        if (motion >= 2 && args.some(w => w[0] === 'R') && args.some(w => 'IJK'.includes(w[0]))) fail('円弧中心と半径が重複しています');
        engine.loadFromStringSync(`G${motion} ` + args.map(w => w.join('')).join(' '));
      }
      if (m.includes(2) || m.includes(30)) ended = true;
    }
    return { segments, ...(packed ? { positions: positions?.subarray(0, segmentCount * 6), rapids: rapids?.subarray(0, segmentCount), segmentCount } : {}), bounds: segmentCount ? bounds : null, wcs, issue: '', omitted, notice: (omitted ? 'G28/G30/G53の退避区間と、' : '') + '開始位置が確定するまでの移動は未表示。素材・工具径・衝突判定は含みません。' };
  } catch (e) {
    return { segments: [], bounds: null, wcs, issue: e.message, notice: '経路を表示できません。CAMとGコードで全経路を別途確認してください。' };
  }
}

// A sphere-based fit is independent of camera angles, so rotation never zooms.
export function createPathView(bounds, { width, height, padding = 80, zoom = 1, azimuth = -Math.PI / 3, elevation = Math.PI / 3, includeOrigin = false, mode = '3d', panX = 0, panY = 0 }) {
  const fitted = {
    min: bounds.min.map(v => includeOrigin ? Math.min(0, v) : v),
    max: bounds.max.map(v => includeOrigin ? Math.max(0, v) : v),
  };
  const center = new Vector3(...fitted.min.map((v, i) => (v + fitted.max[i]) / 2));
  const spans = fitted.max.map((v, i) => v - fitted.min[i]);
  const diameter = Math.max(1, Math.hypot(...spans));
  const fittedScale = mode === '2d'
    ? Math.min((width - padding) / Math.max(1, spans[0]), (height - padding) / Math.max(1, spans[1]))
    : Math.min(width - padding, height - padding) / diameter;
  const pixels = Math.max(0.000001, fittedScale) * zoom;
  const rotation = mode === '2d' ? new Quaternion() : new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), elevation - Math.PI / 2)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -azimuth - Math.PI / 2));
  const p = new Vector3();
  return { bounds: fitted, pixels, rotation, project: (values, offset = 0) => {
    p.fromArray(values, offset).sub(center).applyQuaternion(rotation);
    return [width / 2 + p.x * pixels + panX, height / 2 - p.y * pixels + panY];
  } };
}

export class PathCanvas {
  constructor(canvas, palette = {}, onDraw = () => {}) {
    this.palette = { background: '#fff', grid: '#e0e3e5', rapid: '#959fa5', cut: '#2e617d', text: '#41484c', padding: 80, axes: ['#a13d3d','#35744e','#2e617d'], ...palette };
    this.canvas = canvas; this.zoom = 1; this.path = null; this.mode = '3d';
    this.onDraw = onDraw; this.frame = 0;
    this.azimuth = -Math.PI / 3; this.elevation = Math.PI / 3;
    this.panX = 0; this.panY = 0;
    this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(canvas);
    canvas.addEventListener('wheel', e => { if (!this.path?.bounds) return; e.preventDefault(); this.scale(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      if (!this.path?.bounds || ![0,1,2].includes(e.button) || this.drag) return;
      e.preventDefault();
      this.drag = { x:e.clientX, y:e.clientY, id:e.pointerId, pan:this.mode === '2d' || e.shiftKey || e.button !== 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (this.drag.pan) this.pan(dx,dy);
      else this.rotate(dx * 0.008, dy * 0.008);
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, e => { if (e.pointerId === this.drag?.id) this.drag = null; });
    canvas.addEventListener('keydown', e => {
      const turn = { ArrowLeft: [-0.15,0], ArrowRight: [0.15,0], ArrowUp: [0,-0.15], ArrowDown: [0,0.15] }[e.key];
      if (turn) { e.preventDefault(); this.rotate(...turn); }
    });
  }
  setMode(mode) {
    if (!['2d','3d'].includes(mode)) throw new Error('Unknown preview mode');
    this.mode = mode; this.drag = null; this.draw();
  }
  setPath(path) { this.path = path; this.fitBounds = null; this.fit(); }
  fit(point = null) {
    const bounds = this.path?.bounds;
    this.fitBounds = bounds && point?.length === 3 && point.every(Number.isFinite)
      ? { min: bounds.min.map((v,i)=>Math.min(v,point[i])), max: bounds.max.map((v,i)=>Math.max(v,point[i])) } : null;
    this.zoom = 1; this.panX = 0; this.panY = 0; this.drag = null;
    this.azimuth = -Math.PI / 3; this.elevation = Math.PI / 3; this.draw();
  }
  pan(x,y) { if (!Number.isFinite(x) || !Number.isFinite(y)) return; this.panX += x; this.panY += y; this.draw(); }
  rotate(x, y) { if (this.mode !== '3d') return; this.azimuth -= x; this.elevation = Math.max(0.08, Math.min(Math.PI / 2 - 0.03, this.elevation + y)); this.draw(); }
  scale(factor) { this.zoom = Math.min(15, Math.max(0.25, this.zoom * factor)); this.draw(); }
  projectPosition(position) { return this.path?.bounds && this.projection ? this.projection.project(position) : null; }
  draw() {
    this.onDrawStart?.();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const c = this.canvas, w = c.clientWidth, h = c.clientHeight;
    c.dataset.viewMode = this.mode;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.fillStyle = this.palette.background; ctx.fillRect(0,0,w,h);
    const bounds = this.fitBounds || this.path?.bounds;
    if (!bounds) { this.projection = null; c.dataset.rendering = 'false'; delete c.dataset.pixelsPerMm; delete c.dataset.origin; return; }
    c.dataset.rendering = 'true';
    // Three.js supplies the 3D view rotation; orthographic Canvas drawing keeps the
    // bundle small enough for DLC32 flash and works without a WebGL context.
    const projection = createPathView(bounds, { width: w, height: h, padding: this.palette.padding, zoom: this.zoom, azimuth: this.azimuth, elevation: this.elevation, includeOrigin: Boolean(this.palette.origin), mode: this.mode, panX:this.panX, panY:this.panY });
    const { rotation: view, project: xy } = projection;
    this.projection = projection;
    c.dataset.pixelsPerMm = String(projection.pixels);
    const radius = Math.max(1, ...projection.bounds.max.slice(0,this.mode === '2d' ? 2 : 3).map((v,i) => v - projection.bounds.min[i]));
    const line = (a,b) => { ctx.moveTo(...xy(a)); ctx.lineTo(...xy(b)); };
    const desired = radius / 8, magnitude = 10 ** Math.floor(Math.log10(desired));
    const grid = [1,2,5,10].map(n=>n*magnitude).find(n=>n>=desired);
    const floor = bounds.min[2], min = projection.bounds.min.map(v=>Math.floor(v/grid)*grid), max = projection.bounds.max.map(v=>Math.ceil(v/grid)*grid);
    ctx.strokeStyle=this.palette.grid; ctx.lineWidth=1; ctx.beginPath();
    for (let x=min[0];x<=max[0]+grid*0.01;x+=grid) line([x,min[1],floor],[x,max[1],floor]);
    for (let y=min[1];y<=max[1]+grid*0.01;y+=grid) line([min[0],y,floor],[max[0],y,floor]);
    ctx.stroke();
    const path = this.path, count = path.segmentCount ?? path.segments.length;
    const xyPacked = offset => xy(path.positions, offset);
    let pass = 0, index = 0;
    // Yield between bounded batches so a large local preview cannot monopolize
    // the controller UI's main thread. A new view cancels the obsolete frame.
    const batch = () => {
      const started = performance.now();
      while (pass < 2) {
        const rapid = pass === 0;
        ctx.strokeStyle=rapid?this.palette.rapid:this.palette.cut;ctx.lineWidth=rapid?1:1.8;ctx.setLineDash(rapid?[5,4]:[]);ctx.beginPath();
        const end = Math.min(count, index + 1000);
        for (; index < end; index++) {
          if (path.positions) {
            if (Boolean(path.rapids[index]) !== rapid) continue;
            ctx.moveTo(...xyPacked(index*6)); ctx.lineTo(...xyPacked(index*6+3));
          } else {
            const s = path.segments[index];
            if (s.rapid !== rapid) continue;
            ctx.moveTo(...xy(s.a)); ctx.lineTo(...xy(s.b));
          }
        }
        ctx.stroke();
        if (index === count) { pass++; index = 0; }
        if (pass < 2 && performance.now() - started >= 5) { this.frame = requestAnimationFrame(batch); return; }
      }
      this.frame = 0;
      finish();
      c.dataset.rendering = 'false';
      this.onDraw();
    };
    const finish = () => {
    ctx.setLineDash([]);
    const colors=this.palette.axes;
    ctx.font='bold 16px sans-serif';ctx.lineWidth=2;
    if (this.mode === '2d') {
      ctx.fillStyle=this.palette.text;ctx.fillText('X →  Y ↑',10,18);
    } else {
    ctx.fillStyle=this.palette.background;ctx.fillRect(0,h-70,84,70);
    for (let i=0;i<3;i++) {
      const v = new Vector3(...[0,1,2].map(a=>a===i?1:0)).applyQuaternion(view);
      const x=40+v.x*24,y=h-32-v.y*24;
      ctx.strokeStyle=colors[i];ctx.fillStyle=colors[i];ctx.beginPath();ctx.moveTo(40,h-32);ctx.lineTo(x,y);ctx.stroke();
      ctx.fillText(axisKeys[i].toUpperCase(),x+v.x*9-4,y-v.y*9+5);
    }
    }
    ctx.fillStyle=this.palette.text;ctx.font='16px sans-serif';ctx.textAlign='right';ctx.fillText(this.mode === '2d' ? '2D / XY / mm' : '3D / mm',w-10,18);ctx.textAlign='left';
    if (this.palette.origin) {
      const [x,y] = xy([0,0,0]);
      const label = path.reference ? '作業原点' : path.wcs ? `原点 ${path.wcs}` : '原点 (ファイル)';
      c.dataset.origin = label;
      ctx.setLineDash([]);ctx.lineWidth=2;ctx.strokeStyle=this.palette.origin;ctx.fillStyle=this.palette.background;
      ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-11,y);ctx.lineTo(x+11,y);ctx.moveTo(x,y-11);ctx.lineTo(x,y+11);ctx.stroke();
      ctx.font='bold 16px sans-serif';
      const labelWidth=ctx.measureText(label).width, tx=Math.max(4,Math.min(w-labelWidth-4,x+14)), ty=Math.max(16,Math.min(h-5,y+(this.mode === '2d' ? 20 : -12)));
      ctx.fillStyle=this.palette.background;ctx.fillRect(tx-2,ty-17,labelWidth+4,21);
      ctx.fillStyle=this.palette.origin;ctx.fillText(label,tx,ty);
    }
    };
    batch();
  }
}
