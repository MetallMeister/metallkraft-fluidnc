import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
import { useFileDeletion } from './file-deletion-before-download.js';
import { deleteButton } from './file-workflow-patches.mjs';

const hook='('+transformSync('globalThis.__mkDeletion=('+useFileDeletion.toString()+')',{minify:true,target:'es2022'}).code.trim().replace(/^globalThis\.__mkDeletion=/,'').replace(/;$/,'')+')';
assert.ok(hook.length>1000 && hook.includes('deleteCommand'));
const wrapped='(0,o.BX)("details",{class:"mk-file-management",children:[(0,o.tZ)("summary",{"aria-label":"ファイル管理",children:"…"}),'+deleteButton+']})';
export const fileDeletionPatches=[
  {before:'(x,o.BX,t,n,u,Zt(),C.fv,c,W.s);return(0,x.d4)',after:`(x,o.BX,t,n,u,Zt(),C.fv,c,W.s);const mkDelete=${hook}(x,o.BX,t,n,u,Zt(),C.fv,c,J.V,mk.clear);return(0,x.d4)`},
  {before:wrapped,after:'mkDelete.remove(e)'},
  {before:'class:"file-line form-control"+(mk.selected(e)?" mk-file-selected":""),children:[',after:'class:"file-line form-control"+(mk.selected(e)?" mk-file-selected":""),children:[mkDelete.checkbox(e),'},
];
// Insert the toolbar before the existing native list, leaving its grid row unchanged.
export function patchFileDeletion(html){
  for(const {before,after} of fileDeletionPatches){
    assert.equal(html.split(before).length,2,'Expected one reviewed file deletion render fragment');html=html.replace(before,()=>after);
  }
  const at=html.indexOf('class:"drop-zone files-list m-1"');
  assert.ok(at>0);
  const next=html.indexOf('children:[',at);
  assert.ok(next>at && next-at<1800);
  const before=html.slice(at,next+10),after=before+'mkDelete.toolbar(),';
  html=html.replace(before,()=>after);
  return html;
}
export function undoFileDeletion(html){
  assert.equal(html.split('mkDelete.toolbar(),').length,2);
  html=html.replace('mkDelete.toolbar(),','');
  for(const {before,after} of fileDeletionPatches.toReversed()){
    assert.equal(html.split(after).length,2);html=html.replace(after,()=>before);
  }
  return html;
}
