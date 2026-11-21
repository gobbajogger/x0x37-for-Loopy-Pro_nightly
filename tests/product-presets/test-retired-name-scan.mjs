import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const name = String.fromCharCode(100, 114, 111, 110, 101);
// Byte-exact GPL qualification inputs at ffd31a735acc5721d1f90a30fc1ceb283aad6fc5,
// plus original AudioKit bank descriptions and patch names at 6466a371.
// Each exemption identifies exact original bytes; siblings stay in scope.
const historicalInputs = new Map([
  ['tools/master-source/firmware/src/app/engine.c', '67c77e856e761f29f646c9f5842d99db87c284c8a0a38fc2ade128ebab27f580'],
  ['tools/master-source/firmware/src/app/ui.c', 'd7f9db8ec08f62ae65a6a6d6e9a25f26aaf7069143a8b4b54a78d7d6f6d6526a'],
  ['web/product-site/remote/synth-one-banks/BankA.json', '1486c2b1fcb922d145541c96f436e7e15d755dba72ff9a8030052ef22d224bed'],
  ['web/product-site/remote/synth-one-banks/Bonus.json', 'e189a9782469bd851d97a2bd157cfdd43692621287de68eb2909e8aabbd4b996'],
  ['web/product-site/remote/synth-one-banks/Brice Beasley.json', 'a42a515cc66fc392f8831efa4865145dc9e2c8a8d9bc2554d1fd8a1aed242d45'],
  ['web/product-site/remote/synth-one-banks/JEC.json', '9af56a4f52d050c98da8bfc6bc355ac872772cdd419def188bb644b0c9dff0c0'],
  ['web/product-site/remote/synth-one-banks/Red Sky Lullaby.json', 'db813fe373ebd0c2434c8c0af376b245c331c35080b396bce83bc4d9f2fb0aac'],
]);

function scan(cwd) {
  for (const [path, sha256] of historicalInputs) {
    const bytes = readFileSync(join(cwd, path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256,
      `Pinned historical input bytes changed: ${path}`);
  }
  // Rule 19 uses the retired name to identify the label it prohibits.
  // Only the original line is allowed. A second mention or a changed line
  // keeps the entire document in the scan.
  const rules = spawnSync('git', ['grep', '-hiwI', name, '--', 'RULES.md'], { cwd, encoding: 'utf8' });
  if (rules.status !== 0 && rules.status !== 1) return rules;
  const originalRule = rules.status === 0 && createHash('sha256').update(rules.stdout).digest('hex') ===
    '4ea2ad4de54900b167005e4cf3cd289aa020fe1ca99b26752e89b8bb8976a347';
  return spawnSync('git', ['grep', '-liwI', name, '--', '.',
    ':!*CHANGELOG*', ':!docs/history/**', ':!docs/scheduler-handoffs/**',
    ...(originalRule ? [':!RULES.md'] : []),
    ...[...historicalInputs.keys()].map(path => `:!${path}`)], { cwd, encoding: 'utf8' });
}

function trackedFixture(files, run) {
  const cwd = mkdtempSync(join(tmpdir(), 'retired-name-boundary-'));
  try {
    const init = spawnSync('git', ['init', '--quiet', cwd], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    for (const path of historicalInputs.keys()) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), readFileSync(join(root, path)));
    }
    for (const [path, bytes] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), bytes);
    }
    // The production scanner intentionally covers tracked files. No commit or
    // changes to this repository's index are needed for these temporary controls.
    const add = spawnSync('git', ['add', '-f', '--', '.'], { cwd, encoding: 'utf8' });
    assert.equal(add.status, 0, add.stderr);
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('tracked current sources have no retired engine name', () => {
  const result = scan(root);
  assert.equal(result.status, 1, result.stdout || result.stderr);
});

test('exact historical inputs alone do not fail the current-source scan', () => {
  trackedFixture({ 'web/current-engine.mjs': 'Synth One\n' }, cwd => {
    const result = scan(cwd);
    assert.equal(result.status, 1, result.stdout || result.stderr);
  });
});

test('only the original prohibition in the rules is exempt', () => {
  const rule = readFileSync(join(root, 'RULES.md'), 'utf8').split('\n').find(line => line.startsWith('19. '));
  trackedFixture({ 'RULES.md': rule + '\n' }, cwd => {
    assert.equal(scan(cwd).status, 1);
    for (const text of [rule + ' changed\n', rule + '\n' + name + '\n', rule + '\n' + rule + '\n']) {
      writeFileSync(join(cwd, 'RULES.md'), text);
      const result = scan(cwd);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.split('\n').includes('RULES.md'));
    }
  });
});

for (const path of [
  'firmware/src/app/current-engine.c',
  'web/product-site/remote/current-engine.mjs',
  'tests/product-presets/current-engine.mjs',
  'web/product-site/remote/synth-one-banks/unreviewed.json',
  'tools/master-source/firmware/src/app/current-engine.c',
]) {
  test(`current-source detection still rejects ${path}`, () => {
    trackedFixture({ [path]: name.toUpperCase() + '\n' }, cwd => {
      const result = scan(cwd);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.split('\n').includes(path), result.stdout);
    });
  });
}

test('a changed historical input fails its pinned identity instead of bypassing detection', () => {
  trackedFixture({}, cwd => {
    for (const path of ['tools/master-source/firmware/src/app/engine.c','web/product-site/remote/synth-one-banks/BankA.json']) {
      const original = readFileSync(join(cwd,path));
      writeFileSync(join(cwd,path), Buffer.concat([original,Buffer.from('\n')]));
      assert.throws(() => scan(cwd), /Pinned historical input bytes changed/);
      writeFileSync(join(cwd,path), original);
    }
  });
});
