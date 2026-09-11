import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const source = buildSync({ entryPoints: [new URL('./recovery-guide.js', import.meta.url).pathname], bundle: true, write: false, format: 'iife', globalName: 'mkRecoveryModule', target: 'es2022', minify: true }).outputFiles[0].text;
export const recoveryPatches = [
  { before: 'const he={id:"terminalPanel",', after: `const mkRecovery=(()=>{${source};return mkRecoveryModule.createRecoveryGuide(x,o.tZ,()=>Zt());})();const he={id:"terminalPanel",` },
  { before: 'children:[(0,o.tZ)(Me,{}),n&&Object.keys(n).length', after: 'children:[(0,o.tZ)(Me,{}),(0,o.tZ)(mkRecovery,{}),n&&Object.keys(n).length' },
  { before: 'class:"file-status",children:(0,S.T)(t.filesList.status)', after: 'class:"file-status","data-file-status":t.filesList.status,children:(0,S.T)(t.filesList.status)' },
];
export function patchRecoveryUI(html) {
  for (const { before, after } of recoveryPatches) {
    assert.equal(html.split(before).length, 2, 'Expected one reviewed recovery render fragment');
    html = html.replace(before, () => after);
  }
  return html;
}
