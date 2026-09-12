import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const script=buildSync({entryPoints:[new URL('./defaults-ui.js',import.meta.url).pathname],bundle:true,write:false,minify:true,format:'iife',target:'es2022'}).outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const style=readFileSync(new URL('./defaults-ui.css',import.meta.url),'utf8');
export const defaultsBlock=`<style data-mk-defaults>${style}</style><script data-mk-defaults>${script}</script>`;
export function installDefaults(html){assert.equal(html.split('</body>').length,2);assert.ok(!html.includes('data-mk-defaults'));return html.replace('</body>',()=>defaultsBlock+'</body>');}
export function removeDefaults(html){assert.equal(html.split(defaultsBlock).length,2);return html.replace(defaultsBlock,'');}
