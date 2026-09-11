import { segmentPoint } from './path-traversal.mjs';

// A transparent incremental layer keeps the large, unchanged planned path cached.
export class TraversalCanvas {
  constructor(canvas, view, traversal) { this.canvas=canvas; this.view=view; this.traversal=traversal; this.frame=0; this.queue=[]; this.ready=false; }
  invalidate() { cancelAnimationFrame(this.frame); this.frame=0; this.queue=[]; this.ready=false; this.canvas.hidden=true; }
  redraw() {
    this.invalidate();
    const c=this.canvas, base=this.view.canvas;
    c.width=base.width; c.height=base.height;
    this.context=c.getContext('2d');
    this.context.scale(base.width / Math.max(1,base.clientWidth),base.height / Math.max(1,base.clientHeight));
    this.ready=Boolean(this.view.projection && this.traversal.path);
    c.hidden=!this.ready; c.dataset.ranges=String(this.traversal.ranges.length);
    c.dataset.rendering='false';
    if (this.ready) for (const range of this.traversal.ranges) this.add(range);
  }
  add(range) {
    if (!this.ready) return;
    this.queue.push([...range]);
    this.canvas.dataset.ranges=String(this.traversal.ranges.length);
    this.canvas.dataset.rendering='true';
    if (!this.frame) this.frame=requestAnimationFrame(()=>this.paint());
  }
  paint() {
    this.frame=0;
    const started=performance.now(), path=this.traversal.path, ctx=this.context;
    let drawn=0;
    while (this.queue.length) {
      const range=this.queue[0], i=Math.floor(range[0]);
      const rapid=path.positions ? path.rapids[i] : path.segments[i].rapid;
      ctx.strokeStyle='#808080'; ctx.lineWidth=rapid ? 1.5 : 2.2; ctx.setLineDash(rapid ? [5,4] : []);
      ctx.beginPath();
      ctx.moveTo(...this.view.projectPosition(segmentPoint(path,i,range[0]-i)));
      const end=Math.min(i+1,range[1]);
      ctx.lineTo(...this.view.projectPosition(segmentPoint(path,i,end-i))); ctx.stroke();
      range[0]=end;
      if (end>=range[1]) this.queue.shift();
      if (++drawn>=1000 || performance.now()-started>=5) break;
    }
    if (this.queue.length) this.frame=requestAnimationFrame(()=>this.paint());
    else this.canvas.dataset.rendering='false';
  }
}
