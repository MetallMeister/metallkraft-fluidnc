import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToolpath, createPathView } from '../src/toolpath.js';

test('Panning translates all projected coordinates without changing scale or model bounds',()=>{
  const bounds={min:[-10,-20,-3],max:[50,20,5]}, original=structuredClone(bounds);
  for (const mode of ['2d','3d']) {
    const options={width:800,height:400,mode};
    const base=createPathView(bounds,options), moved=createPathView(bounds,{...options,panX:70,panY:-35});
    assert.equal(base.pixels,moved.pixels);
    for (const p of [[0,0,0],[10,20,5],[-5,1,2]]) {
      assert.deepEqual(moved.project(p),base.project(p).map((v,i)=>v+[70,-35][i]));
      assert.deepEqual(moved.project(new Float64Array([99,99,99,...p]),3),moved.project(p));
    }
    assert.deepEqual(bounds,original);
  }
});
import { Preparation } from '../src/workflow.js';
import { previewLimits } from '../standard/preview-limits.mjs';

const head = 'G21 G90 G17\nG54\nG0 X0 Y0 Z5\n';
const close = (a,b,t=0.02) => assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);
test('Rotation preserves magnification and keeps origin and path inside the fitted viewport', () => {
  for (const bounds of [
    {min:[100,20,-4],max:[150,50,5]},
    {min:[-1000,-200,-20],max:[-990,-195,-10]},
    {min:[0,0,0],max:[5000,1,0]},
    {min:[0,0,0],max:[0,0,0]},
  ]) {
    const before = JSON.stringify(bounds);
    for (const [width,height] of [[900,450],[240,200]]) {
      const options = {width,height,padding:48,includeOrigin:true};
      const initial = createPathView(bounds,options);
      for (let step = 0; step < 64; step++) {
        const view = createPathView(bounds,{...options,azimuth:step*Math.PI/16,elevation:.08+(step%12)*.12});
        assert.equal(view.pixels, initial.pixels);
        const corners = Array.from({length:8},(_,mask) => [0,1,2].map(i => (mask & (1<<i) ? bounds.max : bounds.min)[i]));
        for (const position of [[0,0,0],...corners]) {
          const [x,y] = view.project(position);
          assert.ok(x >= 24-1e-8 && x <= width-24+1e-8);
          assert.ok(y >= 24-1e-8 && y <= height-24+1e-8);
        }
      }
      assert.equal(createPathView(bounds,{...options,zoom:2}).pixels, initial.pixels*2);
      assert.equal(createPathView(bounds,{...options,width:width*2-48,height:height*2-48}).pixels, initial.pixels*2);
    }
    assert.equal(JSON.stringify(bounds),before,'Display fitting never modifies parsed coordinates');
  }
});
test('Packed and ordinary coordinates share the same projection, including the file origin', () => {
  const view = createPathView({min:[-10,-20,-3],max:[50,20,5]},{width:800,height:400});
  assert.deepEqual(view.project(new Float64Array([99,99,99,1,2,3]),3),view.project([1,2,3]));
  assert.ok(createPathView({min:[0,0,0],max:[10000,10000,0]},{width:800,height:400}).pixels < 1);
});
test('2D is an exact top-down XY projection, unaffected by Z depth or saved 3D angles', () => {
  const bounds = {min:[10,-20,-5000],max:[50,30,8000]};
  const before = JSON.stringify(bounds);
  const options = {width:800,height:400,padding:48,includeOrigin:true,mode:'2d'};
  const view = createPathView(bounds, options);
  const origin = view.project([0,0,0]);
  const x = view.project([10,0,0]), y = view.project([0,10,0]);
  assert.ok(x[0] > origin[0]); assert.equal(x[1],origin[1]);
  assert.ok(y[1] < origin[1]); assert.equal(y[0],origin[0]);
  assert.deepEqual(view.project([0,0,8000]),origin,'Depth cannot tilt the top view');
  assert.equal(view.pixels, Math.min((800-48)/50,(400-48)/50));
  for (let step=0;step<16;step++) {
    const other = createPathView(bounds,{...options,azimuth:step,elevation:step/12});
    assert.deepEqual(other.project([10,20,30]),view.project([10,20,30]));
    assert.equal(other.pixels,view.pixels);
  }
  assert.equal(createPathView(bounds,{...options,zoom:2}).pixels,view.pixels*2);
  for (const corner of [[0,0,0],bounds.min,bounds.max]) {
    const [x,y]=view.project(corner);
    assert.ok(x>=24 && x<=776 && y>=24 && y<=376);
  }
  assert.equal(JSON.stringify(bounds),before);
});
test('absolute path skips unknown initial move and includes rapid/cutting paths', () => {
  const p = parseToolpath(head+'G1 Z0\nX20 F200\nG0 Y10\nM2');
  assert.equal(p.issue,''); assert.equal(p.segments.length,3);
  assert.equal(p.segments[0].rapid,false); assert.equal(p.segments[2].rapid,true);
  assert.deepEqual(p.bounds,{min:[0,0,0],max:[20,10,5]}); assert.equal(p.wcs,'G54');
});
test('inch, relative motion and modal words placed after coordinates', () => {
  const p = parseToolpath('G20 G90\nG0 X0 Y0 Z0\nG1 X1 G91\nY1\nM30\nG1 X100');
  assert.equal(p.issue,''); close(p.bounds.max[0],25.4); close(p.bounds.max[1],25.4);
});
test('CW and CCW XY arcs, full circle and helix', () => {
  for (const motion of ['G2','G3']) {
    const p = parseToolpath(head+`${motion} X0 Y0 Z0 I10 J0\n`);
    assert.equal(p.issue,''); assert.ok(p.segments.length>50);
    close(p.bounds.max[0],20); close(p.bounds.min[1],-10); close(p.bounds.max[1],10); close(p.bounds.min[2],0);
  }
});
test('R arcs support short and long arcs', () => {
  const short = parseToolpath(head+'G2 X10 Y0 R10');
  const long = parseToolpath(head+'G2 X10 Y0 R-10');
  assert.equal(short.issue,''); assert.equal(long.issue,'');
  assert.ok(long.segments.length>short.segments.length);
  assert.ok(long.bounds.max[1]-long.bounds.min[1]>10);
});
test('ZX and YZ arcs map back to actual XYZ', () => {
  const xz = parseToolpath('G21 G90 G18\nG0 X0 Y7 Z0\nG3 X0 Z0 I10 K0');
  const yz = parseToolpath('G21 G90 G19\nG0 X7 Y0 Z0\nG3 Y0 Z0 J10 K0');
  assert.equal(xz.issue,''); assert.equal(yz.issue,'');
  close(xz.bounds.min[1],7); close(xz.bounds.max[0],20); close(xz.bounds.min[2],-10);
  close(yz.bounds.min[0],7); close(yz.bounds.max[1],20); close(yz.bounds.min[2],-10);
});
test('partial XYZ initialization does not invent initial coordinates', () => {
  const p = parseToolpath('G21 G90\nG0 Z5\nX10 Y20\nG1 Z0');
  assert.equal(p.segments.length,1); assert.deepEqual(p.segments[0].a,[10,20,5]);
});
test('unsupported constructs erase partial output, not silently approximate', () => {
  for(const line of ['G55 X2','G43.1 Z1','G92 X0','G81 Z-5 R1','G90.1','G1 A30','G1 X#1','G1 X[2+3]','M98 P1','M6','G1 X1 X2','G2 X100 Y0 R1','G2 X10 Y0 I1 J0']) {
    const p=parseToolpath(head+'G1 X5\n'+line); assert.ok(p.issue,line); assert.equal(p.segments.length,0,line);
  }
});
test('machine-coordinate and return moves are omitted without invented connecting paths', () => {
  const p=parseToolpath(head+'G1 X10\nG53 G0 Z0\nG0 X20 Y10\nZ5\nG1 Z-1\nG28 G91 Z0\nG90');
  assert.equal(p.issue,''); assert.equal(p.omitted,true); assert.equal(p.segments.length,2);
  assert.deepEqual(p.segments[1].a,[20,10,5]); assert.deepEqual(p.segments[1].b,[20,10,-1]);
});
test('missing units and relative initial position are unavailable', () => {
  assert.ok(parseToolpath('G90 G0 X1 Y1 Z1').issue);
  assert.ok(parseToolpath('G21 G91 G1 X1').issue);
});
test('comments are ignored, limits bounded, malformed input rejected', () => {
  assert.equal(parseToolpath(head+'(G53 ; comment) G1 X1 ; G91\n').issue,'');
  assert.ok(parseToolpath(head+'G1 X1\nX2\nX3', {maxSegments:2}).issue);
  assert.ok(parseToolpath(head+'G1 X1000001').issue);
  assert.ok(parseToolpath(head+'G1 X'+ '1'.repeat(2000)).issue);
});
test('Packed paths preserve every coordinate, rapid flag and bound without object cloning', () => {
  for (const body of ['G1 Z0\nX20\nG0 Y10', 'G3 X0 Y0 Z0 I10 J0', 'G2 X10 Y0 R-10']) {
    const ordinary = parseToolpath(head + body), packed = parseToolpath(head + body, {packed:true});
    assert.equal(packed.issue, '');
    assert.deepEqual(packed.bounds, ordinary.bounds);
    assert.equal(packed.segmentCount, ordinary.segments.length);
    assert.equal(packed.segments.length, 0);
    ordinary.segments.forEach((s, i) => {
      assert.deepEqual(Array.from(packed.positions.subarray(i * 6, i * 6 + 6)), [...s.a, ...s.b]);
      assert.equal(Boolean(packed.rapids[i]), s.rapid);
    });
  }
});
test('Large packed preview fits the configured line budget without dropping segments', () => {
  const count = previewLimits.maxLines - 4;
  const text = head + Array.from({length:count}, (_,i) => `G1 X${i % 500} Y${Math.floor(i/500)} Z${i % 2}`).join('\n');
  assert.ok(Buffer.byteLength(text) > 1024 * 1024);
  let progress = 0;
  const p = parseToolpath(text, {...previewLimits, packed:true, onProgress:value => { assert.ok(value >= progress); progress = value; }});
  assert.equal(p.issue, '');
  assert.equal(p.segmentCount, count);
  assert.equal(p.positions.length, count * 6);
  assert.ok(p.positions.buffer.byteLength + p.rapids.buffer.byteLength <= previewLimits.maxSegments * 49);
  assert.ok(progress > .95);
  assert.deepEqual(Array.from(p.positions.subarray(-3)), [(count-1)%500, Math.floor((count-1)/500), (count-1)%2]);
});
test('Packed preview limits and invalid commands reject the whole path', () => {
  for (const [text, options] of [
    [head + 'G1 X1\nX2\nX3', {maxSegments:2}],
    [head + 'G3 X0 Y0 I10 J0', {maxSegments:2}],
    [head + 'G1 X1\nX2\nX3', {maxLines:5}],
    [head + 'G1 X1\nG81 Z-1', {}],
  ]) {
    const p = parseToolpath(text, {packed:true, ...options});
    assert.ok(p.issue); assert.equal(p.bounds, null); assert.equal(p.positions, undefined); assert.equal(p.segments.length, 0);
  }
});
test('manual preparation never survives context changes or explicit resets', () => {
  const p=new Preparation(); p.updateContext('file1:G54:offset0');
  for(const k of ['path','fixture','origin']) p.set(k,true);
  assert.equal(p.ready,true); const revision=p.revision;
  p.updateContext('file1:G54:offset0'); assert.equal(p.revision,revision);
  p.updateContext('file1:G54:offset1'); assert.equal(p.ready,false);
  p.set('unknown',true); assert.equal(p.checks.size,0);
  p.set('origin',true); p.reset(); assert.equal(p.checks.size,0);
});
