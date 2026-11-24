/* HTML版の公開前チェック。ブラウザ入口から参照されるファイルの欠落を検出する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exists = async path => { try { await access(path); return true; } catch { return false; } };

test('index.html がHTML版の起動に必要なローカル資産を参照している', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.match(html, /<html lang="ja"/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<script type="module" src="\.\/js\/main\.js"/);
  const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 3, 'ローカル資産の参照が見つからない');
  for (const ref of refs) assert.equal(await exists(resolve(root, ref)), true, `index.html の参照先がありません: ${ref}`);
});

test('main.js から辿れる静的・動的ローカルimportがすべて存在する', async () => {
  const visited = new Set();
  const pending = ['js/main.js'];
  const importRE = /(?:import\s+(?:[\s\S]*?\s+from\s*)?|import\s*\()(['"])(\.\/[^'"]+)\1/g;
  while (pending.length) {
    const rel = pending.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const abs = resolve(root, rel);
    assert.equal(await exists(abs), true, `import先がありません: ${rel}`);
    const source = await readFile(abs, 'utf8');
    importRE.lastIndex = 0;
    for (const match of source.matchAll(importRE)) {
      const target = resolve(dirname(abs), match[2]);
      const targetRel = relative(root, target).replaceAll('\\\\', '/');
      assert.ok(!targetRel.startsWith('../'), `リポジトリ外を参照しています: ${rel} -> ${match[2]}`);
      assert.ok(extname(targetRel), `拡張子のないimportです: ${rel} -> ${match[2]}`);
      pending.push(targetRel);
    }
  }
  assert.ok(visited.size >= 20, `起動時の依存ファイルが少なすぎます: ${visited.size}`);
});

test('図面読込エンジンと単価マスターがHTML版に含まれている', async () => {
  for (const rel of ['js/kaku-engine.html', 'js/master-data.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/three/build/three.module.js']) {
    assert.equal(await exists(resolve(root, rel)), true, `必要な部品がありません: ${rel}`);
  }
});
