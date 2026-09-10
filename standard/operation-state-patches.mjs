import assert from 'node:assert/strict';

// Native status drives local input availability; command handlers stay untouched.
export const motionUnavailable = status => `!["Idle","Jog","Alarm"].includes(${status}?.state)`;
const jogBusy = motionUnavailable('mkJogStatus');
const probeBusy = motionUnavailable('mkProbeStatus');
const positionBusy = motionUnavailable('mkPositionStatus');
export const operationStatePatches = [
  {before:'{positions:i}=Zt(),r="jogPanel"',after:'{positions:i,status:mkJogStatus}=Zt(),r="jogPanel"'},
  ...['`btn+${e}`','`btn-${e}`','`btnH${e}`','`btnZ${e}`',
    '"btn+Z"','"btn-Z"','"btnHZ"','"btnZZ"',
    '"btn+axis"','"btn-axis"','"btnHaxis"','"btnZaxis"','"btnHAll"','"btnZAll"']
    .map(id=>({before:`id:${id},onClick:`,after:`id:${id},disabled:${jogBusy},"data-operation-disabled":${jogBusy}?"":void 0,onClick:`})),
  {before:'ke=({onWPosClick:e})=>{const{positions:t}=Zt();',after:'ke=({onWPosClick:e})=>{const{positions:t,status:mkPositionStatus}=Zt();'},
  {before:'class:"m-1 jog-position-value jog-position-clickable",onClick:',after:`class:"m-1 jog-position-value jog-position-clickable",inert:${positionBusy},"aria-disabled":${positionBusy},onClick:`},
  {before:'{targetCommands:n}=(0,ne.KB)(),i="ProbePanel";',after:'{targetCommands:n}=(0,ne.KB)(),{status:mkProbeStatus}=Zt(),i="ProbePanel";'},
  {before:'disabled:!($e.valid&&Ae.valid&&je.valid&&De.valid),icon:n.icon',after:`disabled:${probeBusy}||!($e.valid&&Ae.valid&&je.valid&&De.valid),"data-operation-disabled":${probeBusy}?"":void 0,icon:n.icon`},
  // Closing a native modal must not re-enable a control still locked by machine state.
  {before:'e.removeAttribute("disabled"),e.classList.contains("dropdown-toggle")',after:'e.hasAttribute("data-operation-disabled")?e.setAttribute("disabled","true"):e.removeAttribute("disabled"),e.classList.contains("dropdown-toggle")'},
];

export function patchOperationStates(html) {
  for (const {before,after} of operationStatePatches) {
    assert.equal(html.split(before).length,2,'Expected one reviewed operation-state render fragment');
    html=html.replace(before,after);
  }
  return html;
}
