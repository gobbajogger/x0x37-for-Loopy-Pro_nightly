// SPDX-License-Identifier: GPL-3.0-only
// Published installer and catalog at gh-pages 6a9953de, for offline comparisons.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function gitBlobId(text) {
  return createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
}

export const liveInstaller = readFileSync(new URL('pinned-live-installer-15d43a0a.html', import.meta.url), 'utf8');
assert.equal(gitBlobId(liveInstaller), '15d43a0a8398a69c70e73aa7b6a6dc6bbe5bace0');

const embedded = /^const catalog = (.+);$/m.exec(liveInstaller);
assert.ok(embedded, 'Published installer must include its catalog');
// The published JSON file uses two-space indentation and a trailing newline.
const published = JSON.stringify(JSON.parse(embedded[1]), null, 2) + '\n';
assert.equal(gitBlobId(published), '24a8b208aa01d539b5ef4e23af73d9c4aa2ac3d8');
export const readLiveCatalog = () => JSON.parse(published);
