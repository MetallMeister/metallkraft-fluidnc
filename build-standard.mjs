import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { transform, build } from 'esbuild';
import { patchStandardUI } from './standard/display-patches.mjs';
import { icons } from 'lucide';

const source = 'vendor/index.html.gz';
const expected = '46f6a276e1c4d17f17cfd6a5c48d44d5cb23ea16ce32e67194ee160951d030fa';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const original = await readFile(source);
if (sha256(original) !== expected) throw new Error('The pinned WebUI-3 release has changed. Refusing to build.');
await mkdir('dist-standard', { recursive: true });
// Only the allowlisted presentation fragments differ from the pinned standard release.
const jogUI = patchStandardUI(gunzipSync(original).toString());
await writeFile('dist-standard/index.html.gz', gzipSync(jogUI, { level: 9 }));
await writeFile('dist-standard/index.html', jogUI);
const theme = await readFile('standard/theme-metallkraft.css', 'utf8') + '\n' + await readFile('standard/theme-modern.css', 'utf8') + '\n' + await readFile('standard/operator-layout.css', 'utf8');
const probeIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter">' + icons.ArrowDownToLine[2].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')} />`).join('') + '</svg>';
let themedIcons = theme.replace('__PROBE_ICON__', 'data:image/svg+xml,' + encodeURIComponent(probeIcon));
for (const [direction, icon] of Object.entries({UP:icons.ArrowUp, DOWN:icons.ArrowDown, LEFT:icons.ArrowLeft, RIGHT:icons.ArrowRight})) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + icon[2].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')} />`).join('') + '</svg>';
  themedIcons = themedIcons.replace('__JOG_' + direction + '_ICON__', 'data:image/svg+xml,' + encodeURIComponent(svg));
}
const css = (await transform(themedIcons, { loader: 'css', minify: true })).code;
await writeFile('dist-standard/theme-metallkraft.gz', gzipSync(css, { level: 9 }));
const language = JSON.parse(await readFile('vendor/lang-ja.json', 'utf8'));
Object.assign(language, JSON.parse(await readFile('standard/japanese-labels.json', 'utf8')));
await writeFile('dist-standard/lang-ja.json.gz', gzipSync(JSON.stringify(language), { level: 9 }));
const preferences = JSON.parse(await readFile('standard/preferences.json', 'utf8'));
await writeFile('dist-standard/preferences.json', JSON.stringify(preferences));
await copyFile('standard/metallkraft-links.html', 'dist-standard/metallkraft-links.html');
const newsJS = (await build({entryPoints:['standard/news.js'],bundle:true,write:false,minify:true,format:'iife',target:['es2022']})).outputFiles[0].text;
const refreshIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + icons.RefreshCw[2].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')} />`).join('') + '</svg>';
const newsHTML = (await readFile('standard/metallkraft-news.html','utf8')).replace('/* NEWS_SCRIPT */', () => newsJS.replace(/<\/script/gi, '<\\/script')).replace('<!-- REFRESH_ICON -->', refreshIcon);
await writeFile('dist-standard/metallkraft-news.html', newsHTML);
const jobJS = (await build({entryPoints:['standard/job.js'],bundle:true,write:false,minify:true,format:'iife',target:['es2022']})).outputFiles[0].text;
const jobHTML = (await readFile('standard/metallkraft-job.html','utf8')).replace('/* JOB_SCRIPT */', () => jobJS.replace(/<\/script/gi, '<\\/script'));
await writeFile('dist-standard/metallkraft-job.html', jobHTML);
const browserBuild = {bundle:true,write:false,minify:true,format:'iife',target:['es2022'],alias:Object.fromEntries(['fs','events','stream','timers'].map(name=>[name,'./src/node-unavailable.js']))};
const worker = (await build({...browserBuild,entryPoints:['standard/preview-worker.js']})).outputFiles[0].text;
const previewJS = (await build({...browserBuild,entryPoints:['standard/preview.js'],define:{__WORKER_SOURCE__:JSON.stringify(worker)}})).outputFiles[0].text;
const licenses = (await Promise.all(['lucide','three','gcode-toolpath','gcode-interpreter','gcode-parser'].map(async name=>name+'\n'+await readFile('node_modules/'+name+'/LICENSE','utf8')))).join('\n\n');
const preview = (await readFile('standard/metallkraft-preview.html','utf8')).replace('/* PREVIEW_SCRIPT */', () => previewJS.replace(/<\/script/gi, '<\\/script')) + '\n<!-- Third-party licenses\n'+licenses.replaceAll('--','- -')+'\n-->';
await writeFile('dist-standard/metallkraft-preview.html.gz', gzipSync(preview,{level:9}));
const files = ['index.html.gz', 'theme-metallkraft.gz', 'lang-ja.json.gz', 'preferences.json', 'metallkraft-links.html', 'metallkraft-news.html', 'metallkraft-preview.html.gz', 'metallkraft-job.html'];
const manifest = { standardSource: source, standardSha256: expected, firmwareChanges: false, standardExecutableModified: true, standardModification: 'Reviewed display patches and SD selection/preview/direct-start gate; native job command builder and sender retained', standardCommunicationModified: false, additionalCommunication: 'Bounded read-only SD GET on selection and before direct start; native $/report_inches and $G initialize the marker, with one Idle-only retry if the units read fails; same-origin display messages; no additional socket or controller polling', customExecutableJavaScript: true, customJavaScriptScope: ['toolpath-preview', 'read-only-announcements', 'read-only-job-progress', 'sd-file-selection-and-start-gate'], noticesSource: 'https://metallmeister.net/wp-json/wp/v2/pages/4102', files: {} };
manifest.customJavaScriptScope.push('sd-file-deletion-selection-confirmation-and-sequencing');
manifest.customJavaScriptScope.push('sequential-sd-downloads');
manifest.additionalCommunication += '; user-requested sequential read-only SD downloads with per-file timeout and state checks';
for (const file of files) { const bytes = await readFile('dist-standard/' + file); manifest.files[file] = { bytes: bytes.length, sha256: sha256(bytes) }; }
await writeFile('dist-standard/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
await import('./scripts/package-release.mjs');
