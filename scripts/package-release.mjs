import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = ['index.html.gz', 'theme-metallkraft.gz', 'lang-ja.json.gz', 'preferences.json', 'metallkraft-links.html', 'metallkraft-news.html', 'metallkraft-preview.html.gz'];
await mkdir('install/ui', { recursive: true });
const manifest = {
  version: JSON.parse(await readFile('package.json')).version,
  date: '2026-09-11',
  firmware: 'FluidNC v4.0.3 (not included)',
  webuiBase: 'ESP3D-WEBUI v3.0.10',
  board: 'MKS DLC32 MAX V1.0_002 / ESP32-S3',
  configStatus: 'Initial setup, uncalibrated; homing/limits/probe/spindle disabled',
  files: {},
};
for (const file of files) await copyFile('dist-standard/' + file, 'install/ui/' + file);
for (const file of [...files.map(name => 'ui/' + name), 'boards/mks-dlc32-max-v1.0/config.yaml']) {
  const data = await readFile('install/' + file);
  manifest.files[file] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
await writeFile('install/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Packaged ' + files.length + ' UI files and one board configuration.');
