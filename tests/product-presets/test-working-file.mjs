import test from 'node:test';
import assert from 'node:assert/strict';
import {OriginalPresetWorkingFile} from '../../web/product-site/presets/working-file.mjs';

const raw = '[{"uid":"u", "name":"A", "bank":"User", "cutoff":1.0000, "waveform1":0}]';
const file = text => new File([text], 'Bank.json');
const capture = (workspace, kind) => {
  let result;
  workspace.download(kind, (bytes, _kind, name) => { result = [new TextDecoder().decode(bytes), name]; });
  return result;
};

test('only the kept revision of a valid active file is eligible for a current copy', async () => {
  const working = new OriginalPresetWorkingFile();
  await working.open(file(raw), 'synthone');
  assert.equal(working.canSaveCurrent, false);
  working.keep();
  assert.equal(working.canSaveCurrent, true);
  assert.deepEqual(capture(working, 'kept'), [raw, 'Bank.json']);
  working.rename(0, 'A');
  assert.equal(working.canSaveCurrent, true);
  working.rename(0, 'B');
  assert.equal(working.canSaveCurrent, false);
  working.keep();
  const edited = raw.replace('"name":"A"', '"name":"B"');
  assert.deepEqual(capture(working, 'kept'), [edited,'Bank.json']);
  assert.deepEqual(capture(working, 'original'), [raw,'Bank.json']);
  await assert.rejects(working.open(file(raw), 'superj6'));
  assert.equal(working.document, null);
  assert.equal(working.canSaveCurrent, false);
  assert.deepEqual(capture(working, 'kept'), [edited,'Bank.json']);
  working.clear();
  assert.equal(capture(working, 'kept'), undefined);
});

test('late original reads and late rejections yield to the most recent selection', async () => {
  const working = new OriginalPresetWorkingFile();
  let finish, fail;
  const older = working.open(file(raw),'synthone', () => new Promise(resolve => { finish = resolve; }));
  const failed = working.open(file(raw),'synthone', () => new Promise((_,reject) => { fail = reject; }));
  await working.open(file(raw.replace('"name":"A"', '"name":"Newest"')),'synthone');
  working.keep();
  finish(new TextEncoder().encode(raw)); fail(Error('older read'));
  assert.deepEqual(await Promise.all([older,failed]),[undefined,undefined]);
  assert.equal(working.document.names[0], 'Newest');
  assert.equal(working.canSaveCurrent,true);
});

test('an individual Synth One program keeps its .synth1 filename and unchanged bytes', async () => {
  const working = new OriginalPresetWorkingFile();
  const single = raw.slice(1,-1);
  await working.open(new File([single], 'One.synth1'),'synthone');
  working.keep();
  assert.deepEqual(capture(working,'kept'),[single,'One.synth1']);
  working.rename(0,'Copy');
  working.keep();
  assert.deepEqual(capture(working,'original'),[single,'One.synth1']);
  assert.deepEqual(capture(working,'kept'),[single.replace('"name":"A"','"name":"Copy"'),'One.synth1']);
});
