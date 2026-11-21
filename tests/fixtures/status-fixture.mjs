// SPDX-License-Identifier: GPL-3.0-only
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// The verifier reads a fresh logical copy on every invocation. Reuse ordinary
// file inodes while restoring all bytes and removing any unrecognized paths.
export async function withStatusFixture(files, check) {
  const directories = new Set();
  for (const name of files.keys()) {
    for (let parent = dirname(name); parent !== '.'; parent = dirname(parent)) {
      directories.add(parent);
    }
  }
  const dir = fs.mkdtempSync(join(tmpdir(), 'x0x37-status-'));
  function reset() {
    const missing = new Map(files);
    function inspect(relative) {
      for (const entry of fs.readdirSync(join(dir, relative), {withFileTypes:true})) {
        const name = relative ? relative + '/' + entry.name : entry.name;
        const target = join(dir, name);
        if (entry.isDirectory() && directories.has(name)) {
          inspect(name);
          continue;
        }
        const original = files.get(name);
        if (original && entry.isFile()) {
          const info = fs.lstatSync(target);
          if (info.nlink === 1) {
            if (info.size !== original.length || !fs.readFileSync(target).equals(original)) {
              fs.writeFileSync(target, original);
            }
            missing.delete(name);
            continue;
          }
        }
        // Remove unexpected entries and type changes, including links, before
        // restoring the expected file or directory at the same path.
        fs.rmSync(target, {recursive:true, force:true});
      }
    }
    if (!fs.lstatSync(dir, {throwIfNoEntry:false})?.isDirectory()) {
      fs.rmSync(dir, {recursive:true, force:true});
      fs.mkdirSync(dir);
    }
    inspect('');
    for (const [name, bytes] of missing) {
      const target = join(dir, name);
      fs.mkdirSync(dirname(target), {recursive:true});
      fs.writeFileSync(target, bytes);
    }
  }
  try {
    return await check(dir, reset);
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
