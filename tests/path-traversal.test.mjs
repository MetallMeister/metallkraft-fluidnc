import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToolpath } from '../src/toolpath.js';
import { PathTraversal, createTraversalIndex, segmentPoint } from '../standard/path-traversal.mjs';

const pathFor = body => {
  const path=parseToolpath('G21 G90 G17 G54\nG0 X0 Y0 Z0\n'+body,{packed:true});
  assert.equal(path.issue,''); path.traversalBounds=createTraversalIndex(path); return path;
};
const setup = (body='G1 X10 F1000\nY10') => {
  const t=new PathTraversal();t.setPath(pathFor(body),'/part.nc');return t;
};
const report = (state='Run',percent=100,name='/sd/part.nc') => `<${state}|WPos:0,0,0|FS:1000,6000|SD:${percent},${name}>`;
const accept = (t,point,time,options={}) => t.accept(report(options.state,options.percent,options.name),point,time,options.context || 'G54:mm:0',1);

test('Trace marks only the observed interval, never the read-ahead percentage or prefix',()=>{
  const t=setup();
  accept(t,[2,0,0],0);assert.deepEqual(t.ranges,[]);
  assert.deepEqual(accept(t,[4,0,0],200).range,[.2,.4]);
  accept(t,[6,0,0],400);assert.deepEqual(t.ranges,[[.2,.6]]);
  accept(t,[10,0,0],700);accept(t,[10,2,0],900);
  assert.deepEqual(t.ranges,[[.2,1.2]]);
  accept(t,[10,10,0],1000,{state:'Idle'});
  assert.deepEqual(t.ranges,[[.2,1.2]],'Idle and 100% never fill the rest');
});
test('Jog, wrong file, local preview and invalid coordinates cannot advance a trace',()=>{
  for(const options of [{state:'Jog'},{state:'Home'},{state:'Alarm'},{state:'Check'},{name:'/sd/other.nc'},{name:'/littlefs/part.nc'},{name:'/sd/sub/part.nc'},{name:'/part.nc'}]) {
    const t=setup();accept(t,[0,0,0],0);accept(t,[2,0,0],200,options);assert.deepEqual(t.ranges,[]);
  }
  for(const point of [null,[NaN,0,0],[0,0],[2,0,1]]) {
    const t=setup();accept(t,[0,0,0],0);accept(t,point,200);assert.deepEqual(t.ranges,[]);
  }
  const t=setup();t.name='';accept(t,[0,0,0],0);accept(t,[2,0,0],200);assert.deepEqual(t.ranges,[]);
});
test('Pause, stale samples and rejected positions do not bridge unobserved intervals',()=>{
  const t=setup();accept(t,[0,0,0],0);accept(t,[1,0,0],200);
  accept(t,[5,0,0],2000);assert.deepEqual(t.ranges,[[0,.1]]);
  accept(t,[6,0,0],2200);assert.deepEqual(t.ranges,[[0,.1],[.5,.6]]);
  accept(t,[7,0,0],2400,{state:'Hold:0'});accept(t,[8,0,0],2600);
  assert.deepEqual(t.ranges,[[0,.1],[.5,.6]]);
  accept(t,[9,0,0],2800);assert.deepEqual(t.ranges.at(-1),[.8,.9]);
});
test('New runs, rewind, coordinate changes and disconnect discard old coverage',()=>{
  for(const reset of [
    t=>accept(t,[0,0,0],500,{percent:1}),
    t=>accept(t,[0,0,0],500,{context:'G54:mm:new-offset'}),
    t=>{accept(t,[2,0,0],400,{state:'Idle'});accept(t,[0,0,0],500);},
    t=>t.clear(),
    t=>t.setPath(null),
  ]) {
    const t=setup();accept(t,[0,0,0],0);accept(t,[2,0,0],200);assert.equal(t.ranges.length,1);
    reset(t);assert.deepEqual(t.ranges,[]);
  }
});
test('Arcs are colored along parsed chords, not a shortcut between reported positions',()=>{
  const t=setup('G3 X10 Y10 I0 J10');
  const p=t.path.positions;
  const start=Array.from(p.slice(6,9)),end=Array.from(p.slice(6*10,6*10+3));
  accept(t,start,0);accept(t,end,500);
  assert.ok(Math.abs(t.ranges[0][0]-1)<1e-6);
  assert.ok(Math.abs(t.ranges[0][1]-10)<1e-6);
});
test('Overlapping passes, backwards positions and omitted machine moves are not inferred',()=>{
  const repeated=setup('G1 X10\nX0\nX10');
  accept(repeated,[2,0,0],0);accept(repeated,[4,0,0],200);assert.deepEqual(repeated.ranges,[]);
  const reverse=setup();accept(reverse,[4,0,0],0);accept(reverse,[2,0,0],200);assert.deepEqual(reverse.ranges,[]);
  const omitted=setup('G1 X10\nG53 G0 X100\nG0 X20\nG1 X30');
  accept(omitted,[2,0,0],0);accept(omitted,[25,0,0],1400);assert.deepEqual(omitted.ranges,[]);
});
test('A physically implausible jump and a stationary repeated point do not mark a later pass',()=>{
  const t=setup('G1 X1000');accept(t,[0,0,0],0);accept(t,[500,0,0],200);assert.deepEqual(t.ranges,[]);
  const s=setup();accept(s,[2,0,0],0);accept(s,[2,0,0],200);assert.deepEqual(s.ranges,[]);
});
test('A large indexed file can anchor late without filling earlier segments',()=>{
  const t=setup(Array.from({length:20000},(_,i)=>`G1 X${i+1}`).join('\n'));
  accept(t,[19000.2,0,0],0);accept(t,[19000.8,0,0],200);
  assert.equal(t.ranges.length,1);
  assert.ok(t.ranges[0][0]>19000);
  assert.ok(t.path.traversalBounds.byteLength<4000);
});

test('An anchored pass remains traceable when a distant later pass overlaps it',()=>{
  const t=setup('G1 X0 Y10\nX100\nY0\nX10\nY10\nX100');
  accept(t,[0,9,0],0);
  accept(t,[2,10,0],200);
  const update=accept(t,[12,10,0],700);
  assert.ok(update.range,'The later identical segment is outside the reachable distance');
  assert.ok(Math.abs(update.range[1]-1.12)<1e-6);
  assert.equal(t.ranges.length,1);
  assert.ok(t.ranges[0][1]<2,'No later pass is marked');
});

test('Reachable overlapping candidates and stale anchors remain ambiguous',()=>{
  const body='G1 Y10\nX1\nX0\nX1';
  for(const delay of [200,2000]) {
    const t=setup(body);accept(t,[0,9,0],0);
    accept(t,[.5,10,0],delay);
    assert.deepEqual(t.ranges,[]);
  }
});

test('Burst-delivered positions do not permanently skip a continuous traversed interval',()=>{
  const t=setup('G1 X100');
  accept(t,[0,0,0],0);
  accept(t,[4,0,0],1);
  assert.deepEqual(t.ranges,[],'A short arrival interval alone is not enough evidence');
  accept(t,[6,0,0],400);
  assert.deepEqual(t.ranges,[[0,.06]],'The next moving report validates the whole bounded interval');
});

test('Equal arrival times can be resolved by a later moving report',()=>{
  const t=setup('G1 X100');
  accept(t,[0,0,0],0);accept(t,[2,0,0],0);accept(t,[4,0,0],250);
  assert.deepEqual(t.ranges,[[0,.04]]);
});

test('Batched arc positions recover the curved interval rather than a straight shortcut',()=>{
  const t=setup('G3 X10 Y10 I0 J10');
  accept(t,segmentPoint(t.path,1,0),0);
  accept(t,segmentPoint(t.path,4,0),1);
  assert.deepEqual(t.ranges,[]);
  accept(t,segmentPoint(t.path,8,0),500);
  assert.ok(Math.abs(t.ranges[0][0]-1)<1e-6);
  assert.ok(Math.abs(t.ranges[0][1]-8)<1e-6);
});

test('Pending timing gaps are not filled by waiting stationary, pausing or stale reports',()=>{
  for(const next of [
    t=>accept(t,[4,0,0],400),
    t=>{accept(t,[4,0,0],100,{state:'Hold:0'});accept(t,[6,0,0],400);},
    t=>accept(t,[6,0,0],2000),
    t=>{accept(t,null,100);accept(t,[6,0,0],400);},
  ]) {
    const t=setup('G1 X100');accept(t,[0,0,0],0);accept(t,[4,0,0],1);next(t);
    assert.deepEqual(t.ranges,[]);
  }
});
