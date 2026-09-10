import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
import { useFileWorkflow } from './file-workflow.js';

const hook = '(' + transformSync('globalThis.__mkWorkflow=(' + useFileWorkflow.toString() + ')', { minify: true, target: 'es2022' }).code.trim().replace(/^globalThis\.__mkWorkflow=/, '').replace(/;$/, '') + ')';
assert.ok(hook.length > 1000 && hook.includes('sendSerialCmd'), 'Workflow implementation must not be optimized away');
export const fileWorkflowHook = hook;
const deleteButton = '(0,o.tZ)(L.yS,{m1:!0,ltooltip:!0,"data-tooltip":-1==e.size?(0,S.T)("S101"):(0,S.T)("S100"),icon:(0,o.tZ)(J.V,{}),onClick:t=>{l.Uc.haptic(),t.currentTarget.blur();const i=(0,o.BX)(y.HY,{children:[(0,o.BX)("div",{children:[-1==e.size?(0,S.T)("S101"):(0,S.T)("S100"),":"]}),(0,o.tZ)("div",{style:"text-align:center",children:(0,o.tZ)("li",{children:e.name})})]});(0,C.fv)({modals:c,title:(0,S.T)("S26"),content:i,button1:{cb:()=>{n.deleteCommand(e)},text:(0,S.T)("S27")},button2:{text:(0,S.T)("S28")}})}})';
export const fileWorkflowPatches = [
  {
    before: 'className:"emergency-btn",icon:',
    after: 'className:"emergency-btn",donotdisable:!0,icon:',
  },
  { before: deleteButton, after: '(0,o.BX)("details",{class:"mk-file-management",children:[(0,o.tZ)("summary",{"aria-label":"ファイル管理",children:"…"}),' + deleteButton + ']})' },
  {
    before: 't="OverridesPanel";return(0,o.BX)("div",{class:"panel panel-dashboard",id:t,children:[(0,o.tZ)(L.IY,{id:t}),(0,o.BX)("div",{class:"navbar",children:',
    after: 't="OverridesPanel";return(0,o.BX)("details",{class:"panel panel-dashboard mk-fold-overrides",id:t,children:[(0,o.tZ)(L.IY,{id:t}),(0,o.BX)("summary",{class:"navbar",children:',
  },
  {
    before: '[d,h]=(0,x.eJ)(!1);return(0,x.d4)((()=>{M(s.current)',
    after: '[d,h]=(0,x.eJ)(!1);const mk=' + hook + '(x,o.BX,t,n,u,Zt(),C.fv,c,W.s);return(0,x.d4)((()=>{M(s.current)',
  },
  {
    before: 'class:"file-line form-control",children:[(0,o.BX)("div",{class:"feather-icon-container file-line-name "+',
    after: 'class:"file-line form-control"+(mk.selected(e)?" mk-file-selected":""),children:[(0,o.BX)("div",{role:mk.canSelect(e)?"button":void 0,tabIndex:mk.canSelect(e)?0:void 0,"aria-pressed":mk.canSelect(e)?mk.selected(e):void 0,onKeyDown:t=>{if(mk.canSelect(e)&&["Enter"," "].includes(t.key)){t.preventDefault();mk.select(e)}},class:"feather-icon-container file-line-name "+',
  },
  {
    before: 'onClick:t=>{l.Uc.haptic(),n.ElementClicked(t,e)},children:',
    after: 'onClick:t=>{l.Uc.haptic();if(mk.canSelect(e))mk.select(e);else{mk.clear();n.ElementClicked(t,e)}},children:',
  },
  {
    before: 'u.capability(t.fileSystem,"Process",r[t.fileSystem],e.name)&&(0,o.tZ)(L.yS,{m1:!0,ltooltip:!0,"data-tooltip":(0,S.T)("S74")',
    after: '"DIRECTSD"===t.fileSystem&&u.capability(t.fileSystem,"Process",r[t.fileSystem],e.name)&&(0,o.tZ)(L.yS,{m1:!0,ltooltip:!0,"data-tooltip":(0,S.T)("S74")',
  },
  {
    before: '(0,o.tZ)(L.yS,{m1:!0,ltooltip:!0,"data-tooltip":(0,S.T)("S74"),icon:(0,o.tZ)(W.s,{}),onClick:o=>{o.currentTarget.blur(),l.Uc.haptic();const i=u.command(t.fileSystem,"play",r[t.fileSystem],e.name);n.sendSerialCmd(i.cmd)}})',
    after: '(0,o.tZ)(L.yS,{m1:!0,ltooltip:!0,"data-tooltip":"経路を選択",label:mk.selected(e)?"選択済み":"選択",onClick:o=>{o.currentTarget.blur();mk.select(e)}})',
  },
  {
    before: '(0,o.BX)("div",{class:"files-list-footer",children:[!t.isLoading',
    after: 'mk.render(),(0,o.BX)("div",{class:"files-list-footer",children:[!t.isLoading',
  },
  // The alternative full-screen file manager is management-only, not another start path.
  {
    before: '(0,o.tZ)("button",{class:"btn btn-sm btn-action",title:(0,S.T)("S74"),onClick:o=>{o.target.blur(),l.Uc.haptic();const i=u.command(e.fileSystem,"play",m[e.fileSystem],n.name);t.sendSerialCmd(i.cmd)},children:(0,o.tZ)(W.s,{size:16})})',
    after: 'null/* mk-management-only */',
  },
];
export function patchFileWorkflow(html) {
  for (const {before,after} of fileWorkflowPatches) {
    assert.equal(html.split(before).length, 2, 'Expected one reviewed file workflow fragment');
    html = html.replace(before, () => after);
  }
  return html;
}
