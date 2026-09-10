import assert from 'node:assert/strict';
import { buildSync, transformSync } from 'esbuild';
import { motionUnavailable } from './operation-state-patches.mjs';
import { spindleDisplayValueExpression } from './spindle-readout.mjs';
import { fileWorkflowHook } from './file-workflow-patches.mjs';
import { useFileWorkflow } from './file-workflow.js';

const jogBusy = motionUnavailable('mkJogStatus');
const spindleBusy = motionUnavailable('i');
const jobButtonSource = buildSync({entryPoints:[new URL('./job-button.js',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'mkJobDisplay',target:'es2022',minify:true}).outputFiles[0].text;
export const workflowPresentationEdits = [
  { before: 'const { eJ: useState,', after: `const jobButton = (()=>{${jobButtonSource};return mkJobDisplay.useJobButton(hooks,jsx,machine);})();\n  const { eJ: useState,` },
  { before: "children: [jsx(Play, {}), jsx('span', { children: '加工開始' })]", after: "children: [jsx(Play, {}), jsx('span', { children: '加工開始' })], ...jobButton()" },
];
let workflow = useFileWorkflow.toString();
for (const { before, after } of workflowPresentationEdits) {
  assert.equal(workflow.split(before).length, 2);
  workflow = workflow.replace(before, () => after);
}
const jobHook = '(' + transformSync('globalThis.__mkWorkflow=(' + workflow + ')', { minify: true, target: 'es2022' }).code.trim().replace(/^globalThis\.__mkWorkflow=/, '').replace(/;$/, '') + ')';
const jogStop = '(0,o.tZ)(L.yS,{m1:!0,tooltip:!0,label:(0,S.T)("CN23"),id:"btnStop",icon:(0,o.tZ)("span",{class:"text-error",children:(0,o.tZ)(fe.P,{})}),"data-tooltip":(0,S.T)("CN23"),onClick:e=>{l.Uc.haptic(),e.target.blur();const t=l.Uc.getValue("jogstopcmd");a(t,";")}})';
export const liveControlsPatches = [
  { before: jogStop, after: jogStop + ',' + jogStop.replace('id:"btnStop"', 'id:"btnStopZ"') },
  ...[['xy', ['0_01','50','10','1','0_1']], ['z', ['0_01','25','10','1','0_1']]].flatMap(([axis, values]) => values.map(value => ({
    before: `id:"move_${axis}_${value}",name:`,
    after: `id:"move_${axis}_${value}",disabled:${jogBusy},"data-operation-disabled":${jogBusy}?"":void 0,name:`,
  }))),
  { before: 'role:"radio","aria-checked":xy===String(speed)', after: `role:"radio",disabled:${jogBusy},"data-operation-disabled":${jogBusy}?"":void 0,"aria-checked":xy===String(speed)` },
  // The fieldset disables all manual spindle inputs without altering their handlers.
  { before: 'return 0==c.filter((e=>null!=e)).length?null:(0,o.BX)("fieldset",{class:', after: `return 0==c.filter((e=>null!=e)).length?null:(0,o.BX)("fieldset",{disabled:e.label==="CN55"&&${spindleBusy},"data-operation-disabled":e.label==="CN55"&&${spindleBusy}?"":void 0,class:` },
  // Keep the native F/S modal state intact; expose a separate display-only FS feed.
  { before: 'e.status&&(s(e.status),St.current!==e.status', after: 'e.status&&(s({...e.status,mkFeed:e.f?.value}),St.current!==e.status' },
  { before: 'lt=()=>{const{states:e}=Zt(),', after: 'lt=()=>{const{states:e,status:mkSpindleStatus}=Zt(),' },
  { before: 'const l=e[i.id],s=' + spindleDisplayValueExpression, after: 'const l=e[i.id],s="feed_rate"===i.id?(mkSpindleStatus?.mkFeed??"--"):' + spindleDisplayValueExpression },
  { before: fileWorkflowHook, after: jobHook },
];
export function patchLiveControls(html) {
  for (const { before, after } of liveControlsPatches) {
    assert.equal(html.split(before).length, 2, 'Expected one reviewed live-control fragment');
    html = html.replace(before, () => after);
  }
  return html;
}
