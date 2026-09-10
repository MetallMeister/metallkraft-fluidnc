import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { patchStandardUI } from '../standard/display-patches.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['index.html.gz', 'theme-metallkraft.gz', 'lang-ja.json.gz', 'preferences.json', 'metallkraft-links.html', 'metallkraft-news.html', 'metallkraft-preview.html.gz'];

test('Install folder contains exactly seven UI files and every digest matches', async () => {
  assert.deepEqual((await readdir('install/ui')).sort(), [...files].sort());
  const manifest = JSON.parse(await readFile('install/manifest.json'));
  assert.equal(Object.keys(manifest.files).length, 8);
  for (const [name, expected] of Object.entries(manifest.files)) {
    const data = await readFile('install/' + name);
    assert.equal(data.length, expected.bytes);
    assert.equal(sha(data), expected.sha256);
  }
});

test('The published executable contains exactly the existing allowlisted patches', async () => {
  const source = await readFile('vendor/index.html.gz');
  assert.equal(sha(source), '46f6a276e1c4d17f17cfd6a5c48d44d5cb23ea16ce32e67194ee160951d030fa');
  const actual = gunzipSync(await readFile('install/ui/index.html.gz')).toString();
  assert.equal(actual, patchStandardUI(gunzipSync(source).toString()));
  assert.equal(sha(await readFile('vendor/esp3d-webui-v3.0.10-source.tar.gz')), 'f0bc0d805b192f6f45c970fb29f2348743bb824ec3bf55b02a0d69f27d664ea3');
});

test('Public defaults contain no demo macros or controller command overrides', async () => {
  const preferences = JSON.parse(await readFile('install/ui/preferences.json'));
  const settings = preferences.settings;
  assert.deepEqual(settings.macros, []);
  assert.equal(settings.jogdistancedefault, '10');
  assert.equal(settings.zjogdistancedefault, '10');
  assert.equal(settings.xyfeedrate, '500');
  assert.equal(settings.zfeedrate, '500');
  assert.equal(settings.default_filesystem, 'DIRECTSD');
  assert.equal(settings.enableshortcuts, false);
  assert.equal(settings.enableautorepeat, false);
  for (const key of Object.keys(settings)) assert.ok(!/cmd|polling|password|ssid|token/i.test(key), key);
  const names = new Set(files.map(name => name.replace(/\.gz$/, '')));
  assert.ok(names.has(settings.theme));
  assert.ok(names.has(settings.language));
  for (const content of settings.extracontents) assert.ok(names.has(content.source), content.source);
});

test('Public machine config stays identical to the reviewed initial MAX config', async () => {
  const data = await readFile('install/boards/mks-dlc32-max-v1.0/config.yaml');
  assert.equal(sha(data), '1c05016ca220a59477d8d514cd31636fe05e15ab65afbe7cd42940d84dbdc93d');
});

test('Deployment assets contain no local paths, private LAN addresses or credential fields', async () => {
  for (const name of files) {
    const data = await readFile('install/ui/' + name);
    const text = (name.endsWith('.gz') ? gunzipSync(data) : data).toString();
    assert.ok(!/\/Users\/|192\.168\./.test(text), name);
  }
  const preferences = await readFile('install/ui/preferences.json', 'utf8');
  assert.ok(!/"(?:password|ssid|token|apiKey)"\s*:/i.test(preferences));
});
