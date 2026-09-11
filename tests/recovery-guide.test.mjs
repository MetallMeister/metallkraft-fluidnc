import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryView } from '../standard/recovery-guide.js';

test('Recovery instructions follow confirmed states, not the last button alone', () => {
  assert.equal(recoveryView({state:'Idle'}), null);
  assert.equal(recoveryView({state:'Run'}), null);
  assert.equal(recoveryView({state:'Sleep',intent:'quickstop'}).action, 'reset');
  assert.equal(recoveryView({state:'Door',intent:'sleep'}).action, 'reset');
  assert.equal(recoveryView({state:'Alarm',alarmCode:3}).action, 'unlock');
  assert.equal(recoveryView({state:'Alarm',alarmCode:14}).action, 'home');
  for (const alarmCode of [1,2,13]) assert.equal(recoveryView({state:'Alarm',alarmCode}).action, 'reset');
  assert.equal(recoveryView({state:'Alarm',alarmCode:16}).action, '');
  assert.equal(recoveryView({state:'ConfigAlarm'}).action, '');
});

test('No premature resume suggestion while decelerating or disconnected', () => {
  for (const code of ['1','',undefined]) assert.equal(recoveryView({state:'Hold',code}).action, '');
  assert.equal(recoveryView({state:'Hold',code:'0'}).action, 'resume');
  for (const state of ['Run','Jog','?']) assert.equal(recoveryView({state,intent:'quickstop'}).action, '');
  assert.match(recoveryView({state:'Door'}).text, /途中再開ではありません/);
  assert.match(recoveryView({state:'Idle',intent:'sleep'}).text, /原点/);
  assert.equal(recoveryView({state:'Idle',errorCode:20,intent:'sleep'}).title, 'エラーを確認してください');
});
