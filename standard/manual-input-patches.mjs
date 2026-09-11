import assert from 'node:assert/strict';

const busy = state => `!["Idle","Alarm"].includes(${state}?.state)`;
const lock = state => `disabled:${busy(state)},"data-operation-disabled":${busy(state)}?"":void 0,`;

// Lock native inputs only. Native command builders, senders and handlers stay intact.
export const manualInputPatches = [
  { before:'{processData:i}=Zt(),{targetCommands:s}', after:'{processData:i,status:mkTerminalStatus}=Zt(),{targetCommands:s}' },
  { before:'type:"text",class:"form-input",onInput:e=>{n.input.current=', after:`${lock('mkTerminalStatus')}type:"text",class:"form-input",onInput:e=>{n.input.current=` },
  { before:'group:!0,ltooltip:!0,"data-tooltip":(0,S.T)("S82")', after:`${lock('mkTerminalStatus')}group:!0,ltooltip:!0,"data-tooltip":(0,S.T)("S82")` },
  { before:'{processData:t}=Tt,{targetCommands:n,failToast:r}', after:'{status:mkMacroStatus}=Zt(),{processData:t}=Tt,{targetCommands:n,failToast:r}' },
  { before:'id:e.id,m1:!0,showlow:!0,label:e.name,icon:t,onClick:', after:`id:e.id,${lock('mkMacroStatus')}m1:!0,showlow:!0,label:e.name,icon:t,onClick:` },
];

export function patchManualInputs(html) {
  for (const {before,after} of manualInputPatches) {
    assert.equal(html.split(before).length,2,'Expected one native manual input fragment');
    html=html.replace(before,after);
  }
  return html;
}
