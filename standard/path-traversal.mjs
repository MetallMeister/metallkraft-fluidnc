import { parseJobStatus } from './job-progress.mjs';

const blockSize = 256, tolerance = 0.025, maxChecks = 8192;
const count = path => path.segmentCount ?? path.segments.length;
export const segmentPoint = (path, index, t) => {
  const p = path.positions, s = path.segments[index];
  return [0,1,2].map(k => {
    const a = p ? p[index * 6 + k] : s.a[k];
    return a + ((p ? p[index * 6 + 3 + k] : s.b[k]) - a) * t;
  });
};
const distance = (a,b) => Math.hypot(...a.map((v,k)=>v-b[k]));

// Built in the parsing worker. Block bounds avoid scanning every segment on
// each status report; a hard work limit leaves ambiguous/dense paths unmarked.
export function createTraversalIndex(path) {
  const size = count(path), bounds = new Float64Array(Math.ceil(size / blockSize) * 6);
  for (let start = 0; start < size; start += blockSize) {
    const offset = start / blockSize * 6;
    bounds.set([Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity], offset);
    for (let i = start; i < Math.min(size, start + blockSize); i++) {
      for (const point of [segmentPoint(path,i,0),segmentPoint(path,i,1)]) for (let k = 0; k < 3; k++) {
        bounds[offset+k] = Math.min(bounds[offset+k],point[k]);
        bounds[offset+3+k] = Math.max(bounds[offset+3+k],point[k]);
      }
    }
  }
  return bounds;
}

function locate(path, point, cursor) {
  const bounds = path.traversalBounds;
  let best = null, squared = Infinity, ambiguous = false, checked = 0;
  for (let block = Math.floor(cursor / blockSize); block < bounds.length / 6; block++) {
    const offset = block * 6;
    if (point.some((v,k)=>v < bounds[offset+k]-tolerance || v > bounds[offset+3+k]+tolerance)) continue;
    for (let i = Math.max(Math.floor(cursor),block*blockSize); i < Math.min(count(path),(block+1)*blockSize); i++) {
      if (++checked > maxChecks) return null;
      const a = segmentPoint(path,i,0), b = segmentPoint(path,i,1), d = b.map((v,k)=>v-a[k]);
      const length2 = d.reduce((sum,v)=>sum+v*v,0);
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, d.reduce((sum,v,k)=>sum+v*(point[k]-a[k]),0) / length2));
      const progress = i+t;
      if (progress < cursor-1e-6) continue;
      const error = point.reduce((sum,v,k)=>sum+(v-a[k]-d[k]*t)**2,0);
      if (error > tolerance*tolerance) continue;
      if (error < squared-1e-8) { squared=error; best=progress; ambiguous=false; }
      else if (Math.abs(error-squared)<=1e-8 && Math.abs(progress-best)>1e-6) ambiguous=true;
    }
  }
  return ambiguous ? null : best;
}

function continuousDistance(path, from, to) {
  if (Math.ceil(to)-Math.floor(from)>maxChecks) return Infinity;
  let length=0, previous=null;
  for (let i=Math.floor(from);i<Math.ceil(to);i++) {
    const a=segmentPoint(path,i,Math.max(0,from-i)), b=segmentPoint(path,i,Math.min(1,to-i));
    if (previous && distance(previous,a)>0.0001) return Infinity;
    length+=distance(a,b); previous=b;
  }
  return length;
}

// Display estimate only: never use SD read percentage as executed distance,
// extrapolate across missing samples, or mark an entire prefix as completed.
export class PathTraversal {
  constructor() { this.setPath(null); }
  setPath(path, name='') { this.path=path; this.name=name ? '/sd'+name : ''; this.clear(); }
  clear() { this.ranges=[]; this.previous=null; this.cursor=0; this.active=false; this.percent=null; this.context=null; }
  accept(line, point, now, context, units=1) {
    const report=parseJobStatus(line)[0];
    if (!report || !this.path?.traversalBounds || !this.name) return {};
    let reset=false;
    if (['Alarm','Check','Home','Jog','Sleep'].includes(report.state) || (report.name && report.name!==this.name)) {
      this.clear(); return {reset:true};
    }
    if (report.state==='Idle') { this.active=false; this.previous=null; return {}; }
    if (report.state!=='Run' || report.name!==this.name || report.percent===null) { this.previous=null; return {}; }
    if (!this.active || report.percent<this.percent || context!==this.context) { this.clear(); reset=true; }
    this.active=true; this.percent=report.percent; this.context=context;
    const feedText=line.match(/\|FS:(\d+(?:\.\d+)?),/)?.[1];
    if (!point?.every(Number.isFinite) || point.length!==3 || !Number.isFinite(now) || feedText===undefined) {
      this.previous=null; return {reset};
    }
    const feed=Number(feedText)*units, before=this.previous;
    if (before && distance(point,before.point)<0.0001) { this.previous={...before,now,feed}; return {reset}; }
    const at=locate(this.path,point,this.cursor);
    if (at===null) { this.previous=null; return {reset}; }
    this.previous={at,point,now,feed}; this.cursor=at;
    const elapsed=before ? now-before.now : Infinity;
    if (!before || elapsed<=0 || elapsed>1500 || at<=before.at || this.ranges.length>=4096) return {reset};
    const length=continuousDistance(this.path,before.at,at);
    // Allow reporting/acceleration error but not an implausible jump to a later pass.
    if (length>Math.max(.1,Math.max(feed,before.feed)*elapsed/60000*2+.05)) return {reset};
    const range=[before.at,at], last=this.ranges.at(-1);
    if (last && Math.abs(last[1]-range[0])<1e-6) last[1]=range[1]; else this.ranges.push([...range]);
    return {reset,range};
  }
}
