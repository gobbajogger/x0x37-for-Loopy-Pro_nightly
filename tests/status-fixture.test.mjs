// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {withStatusFixture} from './fixtures/status-fixture.mjs';

test('a rejected verifier cleans its private root and preserves the original error', async () => {
  const files = new Map([['docs/status.json', Buffer.from('original')], ['empty', Buffer.alloc(0)]]);
  const failure = new Error('verifier failed');
  let privateRoot;
  await assert.rejects(withStatusFixture(files, async (dir, reset) => {
    privateRoot = dir;
    reset();
    writeFileSync(join(dir, 'docs/status.json'), 'modified');
    rmSync(join(dir, 'empty'));
    mkdirSync(join(dir, 'extra'));
    writeFileSync(join(dir, 'extra/artifact'), 'unexpected');
    reset();
    assert.equal(readFileSync(join(dir, 'docs/status.json'), 'utf8'), 'original');
    assert.equal(readFileSync(join(dir, 'empty')).length, 0);
    assert.equal(existsSync(join(dir, 'extra')), false);
    throw failure;
  }), error => error === failure);
  assert.equal(existsSync(privateRoot), false);
});
