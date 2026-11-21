// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('Project Workspace writes its JSON receipt under the configured temporary directory', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'project workspace receipt '));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const suite = fileURLToPath(new URL('./project-workspace-browser.py', import.meta.url));
  const receipt = { result: 'PASS', checks: [{ label: 'a project check', pass: true }] };
  const write = "import json, runpy, sys\nrunpy.run_path(sys.argv[1])['write_receipt'](json.loads(sys.argv[2]))";
  execFileSync('python3', ['-c', write, suite, JSON.stringify(receipt)], {
    env: { ...process.env, TMPDIR: temp },
  });
  assert.deepEqual(JSON.parse(await readFile(join(temp, 'song-ux-review.json'), 'utf8')), receipt);
});
