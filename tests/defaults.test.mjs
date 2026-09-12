import test from 'node:test';
import assert from 'node:assert/strict';
import {DefaultsController,validateSnapshot,differences,restorePath,equal,yamlObject,FEATURE_KEYS,BACKUP_FILE} from '../standard/defaults-core.js';
const snapshot=()=>({version:1,createdAt:'2026-09-12T00:00:00Z',identity:'42',firmware:'v4.0.3',filename:'config.yaml',config:{board:'test',axes:{x:{steps_per_mm:800}}},preferences:{settings:{xyfeedrate:'500',macros:[]}},features:{'Report/Status':{type:'I',value:'1'}},persistedConfig:'board: test\n'});
test('Diffs and individual restores preserve all unrelated values',()=>{
  const a=snapshot(),b=snapshot();a.config.axes.x.steps_per_mm=400;
  assert.deepEqual(differences(a.config,b.config).map(x=>x.path),[['axes','x','steps_per_mm']]);
  assert.deepEqual(restorePath(a.config,b.config,['axes','x','steps_per_mm']),b.config);
  assert.equal(a.config.axes.x.steps_per_mm,400);
  assert.deepEqual(restorePath({x:1,y:2},{y:2},['x']),{y:2});
  assert.ok(equal({b:2,a:1},{a:1,b:2}));
});
test('Invalid snapshots, connection fields and malformed YAML fail closed',()=>{
  assert.throws(()=>validateSnapshot({...snapshot(),filename:'../config.yaml'}));
  assert.throws(()=>validateSnapshot({...snapshot(),features:{'Sta/Password':{value:'secret'}}}));
  assert.throws(()=>yamlObject('x: [broken'));
  assert.ok(!FEATURE_KEYS.some(k=>/wifi|sta\/|ap\/|http|telnet|notification|usb/i.test(k)));
});
class Mock extends DefaultsController {
  constructor(){super('http://localhost');this.state=snapshot();this.files={};this.events=[];this.safe=true;}
  async idle(){this.events.push('idle');if(!this.safe)throw Error('moving');return {FWVersion:this.state.firmware};}
  async identity(){return this.state.identity;}
  async capture(){return structuredClone(this.state);}
  async upload(name,text){await this.idle();this.events.push(name);if(this.fail===name)throw Error('write failed');this.files[name]=text;}
  async command(cmd){
    this.events.push(cmd);
    if(cmd.startsWith('[ESP400]'))return Object.entries(this.state.features).map(([P,s])=>({P,V:s.value}));
    const match=cmd.match(/P=(\S+) T=\S+ V=(.*?) json=yes/);
    if(match)this.state.features[match[1]].value=match[2];return {};
  }
}
test('Full restore backs up first and never writes network, SD, reset or motion',async()=>{
  const m=new Mock(),baseline=snapshot();m.state.config.axes.x.steps_per_mm=100;m.state.preferences.settings.xyfeedrate='1000';m.state.features['Report/Status'].value='2';
  const result=await m.restore(baseline);
  assert.equal(result.restart,true);assert.equal(JSON.parse(m.files[BACKUP_FILE]).config.axes.x.steps_per_mm,100);
  assert.equal(yamlObject(m.files['config.yaml']).axes.x.steps_per_mm,800);
  assert.equal(JSON.parse(m.files['preferences.json']).settings.xyfeedrate,'500');
  assert.ok(m.events.indexOf(BACKUP_FILE)<m.events.indexOf('preferences.json'));
  assert.ok(!m.events.some(x=>/RESTART|M3|G0|Sta\/|WiFi|\/sd\//.test(x)));
});
test('Individual screen restoration does not touch machine file or features',async()=>{
  const m=new Mock(),baseline=snapshot();m.state.preferences.settings.xyfeedrate='1000';m.state.preferences.settings.macros=[{name:'keep'}];
  const result=await m.restore(baseline,{group:'preferences',path:['settings','xyfeedrate']});
  assert.equal(result.restart,false);assert.ok(!m.files['config.yaml']);
  assert.deepEqual(JSON.parse(m.files['preferences.json']).settings.macros,[{name:'keep'}]);
});
test('Motion, wrong device, firmware mismatch and failed backup prevent writes',async()=>{
  const baseline=snapshot();for(const kind of ['motion','identity','firmware','backup']){
    const m=new Mock();if(kind==='motion')m.safe=false;if(kind==='identity')m.state.identity='other';if(kind==='firmware')m.state.firmware='other';if(kind==='backup')m.fail=BACKUP_FILE;
    await assert.rejects(m.restore(baseline));assert.deepEqual(m.files,{});
  }
});
test('Partial failures stop further operations and retain backup',async()=>{
  const m=new Mock();m.fail='config.yaml';await assert.rejects(m.restore(snapshot()),/途中/);
  assert.ok(m.files[BACKUP_FILE]);assert.ok(!m.events.some(x=>x.startsWith('[ESP401]')));
});
