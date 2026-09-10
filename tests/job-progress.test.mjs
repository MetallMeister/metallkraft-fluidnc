import test from 'node:test';
import assert from 'node:assert/strict';
import { JobProgress, parseJobStatus, formatRemaining } from '../standard/job-progress.mjs';

const report = (percent, state = 'Run', name = '/sd/part.nc') => ({ state, name, percent });
function ramp(model, from, now, count) {
  for (let i = 0; i <= count; i++) model.accept(report(from + i), now + i * 1000);
}
test('Standard SD reports only, with strict percent bounds and safe filenames', () => {
  assert.deepEqual(parseJobStatus('<Run|FS:500,10000|SD:20.5,/sd/a,b.nc>'), [report(20.5,'Run','/sd/a,b.nc')]);
  assert.equal(parseJobStatus('<Hold:0|SD:40,/part.nc>')[0].state,'Hold');
  for (const text of ['G1 X100','[MSG:success]',null,'<Unknown|SD:20,/a>','<Run|SD:NaN,/a>','<Run|SD:101,/a>','<Run|SD:-1,/a>']) {
    assert.ok(parseJobStatus(text).every(r => r.percent === null));
  }
  assert.equal(parseJobStatus('x'.repeat(20000)).length,0);
});
test('ETA requires observed progress, including when connecting midway', () => {
  const model = new JobProgress();
  assert.equal(model.view(0).remaining,null);
  model.accept(report(50),0);
  assert.equal(model.view(0).remaining,null);
  ramp(model,50,0,10);
  assert.equal(model.view(10000).remaining,40);
  assert.equal(formatRemaining(40),'約1分');
  assert.equal(formatRemaining(null),'--');
  assert.equal(formatRemaining(3601),'約1時間1分');
});
test('Pause, disconnect, stale reports, reset, restart and switching files cannot retain ETA', () => {
  const model = new JobProgress();
  ramp(model,10,0,12);
  assert.ok(model.view(12000).remaining > 0);
  model.accept(report(22,'Hold'),13000);
  assert.equal(model.view(13000).remaining,null);
  assert.equal(model.view(13000).label,'一時停止中');
  for(let t=14000;t<30000;t+=1000) model.accept(report(22,'Hold'),t);
  model.accept(report(22),30000);
  assert.equal(model.view(30000).remaining,null);
  ramp(model,22,30000,12);
  assert.ok(model.view(42000).remaining > 0);
  assert.equal(model.view(48000).percent,null);
  model.accept(report(40),49000);
  assert.equal(model.view(49000).remaining,null);
  ramp(model,40,49000,12);
  model.accept(report(2),62000);
  assert.equal(model.view(62000).remaining,null);
  ramp(model,2,62000,12);
  model.accept(report(30,'Run','/new.nc'),75000);
  assert.equal(model.view(75000).remaining,null);
  model.reset();
  assert.equal(model.view(75000).percent,null);
});
test('100% bytes read never becomes machining complete; errors/no SD clear the job', () => {
  const model = new JobProgress();
  ramp(model,80,0,20);
  assert.equal(model.view(20000).percent,100);
  assert.equal(model.view(20000).remaining,null);
  assert.equal(model.view(20000).label,'読込済・完了未確認');
  model.accept(report(100,'Alarm'),21000);
  assert.equal(model.view(21000).percent,null);
  model.accept(report(40),22000);
  model.accept({state:'Idle',name:'',percent:null},23000);
  assert.equal(model.view(23000).percent,null);
  assert.equal(model.view(23000).label,'実行ファイルなし');
  model.accept({state:'Run',name:'',percent:null},24000);
  assert.equal(model.view(24000).label,'進捗情報なし','SD prefetch finishing cannot imply motion has finished');
});
