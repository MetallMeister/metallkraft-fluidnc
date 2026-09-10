import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolPosition } from '../standard/tool-position.mjs';

test('Tool marker uses WCO and reported units, not modal G20/G21',()=>{
  const p=new ToolPosition();
  p.accept('[GC:G21 G54 M5]',0);
  p.accept('<Idle|MPos:100,200,300|WCO:90,180,270>',0);
  assert.equal(p.position('G54',0),null);
  p.accept('$/report_inches=false',1);
  assert.equal(p.position('G54',1),null);
  p.accept('<Idle|MPos:100,200,300|WCO:90,180,270>',2);
  assert.deepEqual(p.position('G54',2),[10,20,30]);
  p.accept('<Jog|MPos:110,210,310>',3);
  assert.deepEqual(p.position('G54',3),[20,30,40]);
  p.accept('$/report_inches=true',4);
  p.accept('<Idle|WPos:1,2,3>',5);
  assert.deepEqual(p.position('G54',5),[25.4,50.8,76.19999999999999]);
});
test('Missing, invalid, stale, disconnected and mismatched coordinates are hidden',()=>{
  const p=new ToolPosition();
  p.accept('$/report_inches=false',0);p.accept('[GC:G21 G54 M5]',0);
  p.accept('<Idle|MPos:100,200,300>',0);
  assert.equal(p.position('G54',0),null);
  p.accept('<Idle|MPos:100,200,300|WCO:90,180,270>',1);
  assert.equal(p.position('G55',2),null);
  assert.equal(p.position('G54',4000),null);
  p.accept('[GC:G21 G55 M5]',3);
  p.accept('<Idle|MPos:100,200,300>',4);
  assert.equal(p.position('G55',4),null);
  p.accept('<Idle|MPos:100,200,300|WCO:99,198,297>',5);
  assert.deepEqual(p.position('G55',5),[1,2,3]);
  p.accept('<Idle|WPos:,2,3>',6);
  assert.equal(p.position('G55',6),null);
  p.reset();assert.equal(p.position('G55',7),null);
});
