import assert from 'node:assert/strict';

// `be` is the pinned native currentFeedRate map, read by the original jog handler.
// The extra hook only refreshes selection feedback; it never sends a command.
export const jogSpeedStateUpdate = 'be.XY=String(speed),be.Z=String(speed),mkRefreshSpeed((value=>value+1))';
const header = '(0,o.BX)("div",{class:"panel panel-dashboard",id:r,children:[(0,o.tZ)(L.IY,{id:r}),(0,o.BX)("div",{class:"navbar",children:[';
export const jogSpeedPatches = [
  {
    before: '[t,n]=(0,x.eJ)(xe),{positions:i}=Zt(),r="jogPanel"',
    after: '[t,n]=(0,x.eJ)(xe),[mkSpeedRevision,mkRefreshSpeed]=(0,x.eJ)(0),{positions:i}=Zt(),r="jogPanel"',
  },
  {
    before: header,
    after: header + '((xy,z)=>(0,o.BX)("div",{class:"mk-jog-speed",children:[(0,o.BX)("div",{class:"mk-jog-speed-caption",children:[(0,o.tZ)("span",{children:"移動速度"}),(0,o.tZ)("span",{class:"mk-jog-speed-value",children:(xy===z?xy:"XY "+xy+" / Z "+z)+" mm/min"})]}),(0,o.tZ)("div",{class:"mk-jog-speed-buttons",role:"radiogroup","aria-label":"XY・Z共通の移動速度 (mm/min)",children:[10,50,100,500,1000].map((speed=>(0,o.tZ)("button",{type:"button",class:"btn tooltip tooltip-bottom",role:"radio","aria-checked":xy===String(speed)&&z===String(speed),"aria-label":speed+" mm/min","data-tooltip":"XY・Zの手動移動速度を"+speed+" mm/minにします。選ぶだけでは動きません。",onClick:()=>{l.Uc.haptic(),' + jogSpeedStateUpdate + '},children:String(speed)},speed)))})]}))(String(be.XY??l.Uc.getValue("xyfeedrate")),String(be.Z??l.Uc.getValue("zfeedrate"))),',
  },
];

export function patchJogSpeedPresets(html) {
  for (const {before,after} of jogSpeedPatches) {
    assert.equal(html.split(before).length, 2, 'Expected exactly one native jog speed render fragment');
    assert.ok(!html.includes(after), 'Jog speed presets were already patched');
    html = html.replace(before,after);
  }
  return html;
}
