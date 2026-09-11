import assert from 'node:assert/strict';
import { patchJogIncrements } from './jog-increments.mjs';
import { patchFileWorkflow } from './file-workflow-patches.mjs';
import { patchJogSpeedPresets } from './jog-speed-presets.mjs';
import { patchOperationStates } from './operation-state-patches.mjs';
import { patchLiveControls } from './live-controls-patches.mjs';
import { patchRecoveryUI } from './recovery-patches.mjs';
import { spindleDisplayValueExpression } from './spindle-readout.mjs';
export { spindleDisplayValueExpression };

// This changes a rendered value only; native states and command generation stay intact.
export const spindleReadoutPatch = {
  before: 'const l=e[i.id],s=Array.isArray(l)?l.map((e=>e.value)).join(" "):l.value;return(0,o.BX)("div",{class:"extra-control mt-1 tooltip tooltip-bottom"',
  after: 'const l=e[i.id],s=' + spindleDisplayValueExpression + ';return(0,o.BX)("div",{class:"extra-control mt-1 tooltip tooltip-bottom"',
};

export function patchLegacyDisplayUI(html) {
  html = patchJogIncrements(html);
  assert.equal(html.split(spindleReadoutPatch.before).length, 2, 'Expected exactly one spindle readout expression');
  assert.ok(!html.includes(spindleReadoutPatch.after), 'Spindle readout was already patched');
  return html.replace(spindleReadoutPatch.before, spindleReadoutPatch.after);
}

// Change only native render tags. Browser disclosure behavior needs no event handler.
export const panelDisclosurePatches = ['a'].map(id => {
  const before = `(0,o.BX)("div",{class:"panel panel-dashboard",id:${id},children:[(0,o.tZ)(L.IY,{id:${id}}),(0,o.BX)("div",{class:"navbar",children:`;
  const after = `(0,o.BX)("section",{class:"panel panel-dashboard mk-macros-panel",id:${id},children:[(0,o.tZ)(L.IY,{id:${id}}),(0,o.BX)("div",{class:"navbar",children:`;
  return {before,after};
});
// Wrap already-rendered native nodes; do not duplicate controls or change hook order.
export const parameterPatches = [
  {
    before: 'children:n.controls.map((n=>(0,o.tZ)("div",{class:"states-buttons-container",children:n.elements.map',
    after: 'children:((controls)=>[(0,o.BX)("details",{class:"mk-probe-parameters mk-parameters",name:"mk-aux-panels",children:[(0,o.tZ)("summary",{children:"測定条件"}),(0,o.tZ)("div",{class:"mk-parameter-content",children:controls.slice(0,-1)})]}),controls.at(-1)])(n.controls.map((n=>(0,o.tZ)("div",{class:"states-buttons-container",children:n.elements.map',
  },
  {
    before: 'validation:i},n.id)}}))},n.id)))})]},n.id)))]})]})}),{}),name:"CN37"',
    after: 'validation:i},n.id)}}))},n.id))))})]},n.id)))]})]})}),{}),name:"CN37"',
  },
  {
    before: 'children:t.buttons.map(((n,i)=>(0,o.tZ)(L.yS,{mt1:!0,className:t.buttons.length/2>i?',
    after: 'children:((buttons)=>"CN69"===t.label?buttons:[buttons[0],buttons[4],(0,o.BX)("details",{class:"mk-override-parameters mk-parameters",name:"mk-aux-panels",children:[(0,o.tZ)("summary",{"aria-label":"CN67"===t.label?"主軸補正の詳細":"送り補正の詳細",children:"詳細"}),(0,o.BX)("div",{class:"mk-parameter-content",children:[(0,o.tZ)("strong",{children:(0,S.T)(t.label)}),...buttons.slice(1,4)]})]})])(t.buttons.map(((n,i)=>(0,o.tZ)(L.yS,{mt1:!0,className:t.buttons.length/2>i?',
  },
  {
    before: 'e(n.command)}},n.label)))})})]},t.label)))]})]})}),{}),name:"CN65"',
    after: 'e(n.command)}},n.label))))})})]},t.label)))]})]})}),{}),name:"CN65"',
  },
  {
    before: '.map((t=>(0,o.BX)("fieldset",{class:"fieldset-top-separator fieldset-bottom-separator field-group",children:[(0,o.tZ)("legend",{children:(0,o.tZ)("label",{class:"m-1 buttons-bar-label",children:(0,S.T)(t.label)})}),(0,o.tZ)("div",{class:"field-group-content maxwidth",children:(0,o.tZ)("div",{class:"states-buttons-container",children:t.buttons.map',
    after: '.map((t=>(0,o.BX)("CN69"===t.label?"details":"fieldset",{class:"fieldset-top-separator fieldset-bottom-separator field-group"+("CN69"===t.label?" mk-rapid-parameters mk-parameters":""),name:"mk-aux-panels",children:[(0,o.tZ)("CN69"===t.label?"summary":"legend",{children:(0,o.tZ)("label",{class:"m-1 buttons-bar-label",children:(0,S.T)(t.label)})}),(0,o.tZ)("div",{class:"field-group-content maxwidth",children:(0,o.tZ)("div",{class:"states-buttons-container",children:t.buttons.map',
  },
];
export const fileCapacityPatch = {
  before: '(0,o.BX)("div",{class:"filelist-occupation",children:[',
  after: '(0,o.BX)("details",{class:"filelist-occupation mk-file-capacity",children:[(0,o.tZ)("summary",{children:"容量"}),',
};
export const statusColorPatch = {
  before: 'class:"status-ctrls",children:(0,o.BX)("div",{class:"extra-control mt-1 tooltip tooltip-bottom","data-tooltip":(0,S.T)("CN34")',
  after: 'class:"status-ctrls","data-machine-state":e.state,children:(0,o.BX)("div",{class:"extra-control mt-1 tooltip tooltip-bottom","data-tooltip":(0,S.T)("CN34")',
};

export function patchModernDisplayUI(html) {
  html = patchLegacyDisplayUI(html);
  // Outer rapid-group prefix must change before wrapping its nested button map.
  for (const {before,after} of [...panelDisclosurePatches,fileCapacityPatch,...parameterPatches.toReversed(),statusColorPatch]) {
    assert.equal(html.split(before).length, 2, 'Expected exactly one auxiliary panel render prefix');
    assert.ok(!html.includes(after), 'Panel disclosure was already patched');
    html = html.replace(before,after);
  }
  return html;
}

export function patchPreviousStandardUI(html) {
  return patchFileWorkflow(patchModernDisplayUI(html));
}

export function patchSpeedPresetUI(html) {
  return patchJogSpeedPresets(patchPreviousStandardUI(html));
}

export function patchOperationUI(html) {
  return patchOperationStates(patchSpeedPresetUI(html));
}

export function patchLiveUI(html) {
  return patchLiveControls(patchOperationUI(html));
}

// Hide only these macOS-managed directories in the dashboard, without deleting them.
export const fileVisibilityPatch = {
  before: 'class:"file-line form-control"+(mk.selected(e)?" mk-file-selected":""),children:',
  after: '"data-system-entry":-1==e.size&&[".fseventsd",".Spotlight-V100"].includes(e.name),class:"file-line form-control"+(mk.selected(e)?" mk-file-selected":""),children:',
};
export function patchStandardUI(html) {
  html = patchLiveUI(html);
  assert.equal(html.split(fileVisibilityPatch.before).length, 2);
  return patchRecoveryUI(html.replace(fileVisibilityPatch.before, fileVisibilityPatch.after));
}
