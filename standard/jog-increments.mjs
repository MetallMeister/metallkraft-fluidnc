import assert from 'node:assert/strict';

// Pinned WebUI-3 selector fragments. Do not rebuild or rewrite the surrounding bundle.
export const jogIncrementPatches = [
  {
    before: 'id:"move_xy_100",name:"select_distance_xy",value:"100",checked:100==we,onClick:e=>{l.Uc.haptic(),h(e,100)}}),(0,o.tZ)("label",{for:"move_xy_100",children:"100"}',
    after: 'id:"move_xy_0_01",name:"select_distance_xy",value:"0.01",checked:0.01==we,onClick:e=>{l.Uc.haptic(),h(e,0.01)}}),(0,o.tZ)("label",{for:"move_xy_0_01",children:"0.01"}',
  },
  {
    before: 'id:"move_z_50",name:"select_distance_z",value:"50",checked:50==ye,onClick:e=>{l.Uc.haptic(),p(e,50)}}),(0,o.tZ)("label",{for:"move_z_50",children:"50"}',
    after: 'id:"move_z_0_01",name:"select_distance_z",value:"0.01",checked:0.01==ye,onClick:e=>{l.Uc.haptic(),p(e,0.01)}}),(0,o.tZ)("label",{for:"move_z_0_01",children:"0.01"}',
  },
];

export function patchJogIncrements(html) {
  for (const { before, after } of jogIncrementPatches) {
    assert.equal(html.split(before).length, 2, 'Expected exactly one original jog selector');
    assert.ok(!html.includes(after), 'Jog selector was already patched');
    html = html.replace(before, after);
  }
  return html;
}
