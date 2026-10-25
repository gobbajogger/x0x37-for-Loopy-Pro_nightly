// SPDX-License-Identifier: GPL-3.0-only
// Cross-revision audit for THIS populated catalog; the schema separately permits empty fresh history.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const lock = read('tests/fixtures/history-appendonly-baseline-20261024.json');
const original = read('build-status.json').history;
assert.equal(lock.schema, 1);
assert.equal(lock.origin.digest, 'SHA256(UTF8(JSON.stringify(parsed row)))');
function check(history) {
  assert.ok(Array.isArray(history) && history.length >= lock.rows.length,'history must preserve baseline');
  for(let i=0;i<lock.rows.length;i++){
    assert.equal(history[i].id,lock.rows[i].id,'history ID deleted or reordered at '+i);
    assert.equal(createHash('sha256').update(JSON.stringify(history[i]),'utf8').digest('hex'),
      lock.rows[i].sha256,'historical row modified at '+i);
  }
}
// Immutable append-only R19 baseline; old lock covered only 91 of 115 genuine rows.
assert.ok(lock.rows.length >= 115, 'R19 history digest pins must not be removed');
const clone = () => structuredClone(original);
const mustReject = (name,edit) => {
  const rows=clone();edit(rows);assert.throws(()=>check(rows),{name:'AssertionError'},name);
};
check(original);
const failure=original.findIndex(row=>row.id==='producer-pr93-20261023');
assert.ok(failure>=0,'historical compiler failure missing');
mustReject('deleted native compiler-failure receipt', rows=>rows.splice(failure,1));
mustReject('deleted failure and forged unrelated failed row',rows=>{
  rows.splice(failure,1);rows.find(r=>r.status==='source-only').status='failed';
});
mustReject('compiler failure relabeled',rows=>rows[failure].status='source-only');
mustReject('compiler log SHA forged',rows=>rows[failure].failed_build.pro.log_sha256='a'.repeat(64));
mustReject('history reorder',rows=>{[rows[0],rows[1]]=[rows[1],rows[0]];});
mustReject('last SHA256-pinned historical receipt removed',rows=>rows.splice(lock.rows.length - 1, 1));
// Permanent negative fixtures for previously unpinned recent historical evidence.
const recentSource = original.findIndex(r => r.id === 'integration-pr103-smc58-solo-current-root-20261024-r17');
const recentNoGo = original.findIndex(r => r.id === 'integration-pr103-r12-native-solo-no-go-20261024-r18');
assert.ok(recentSource >= 91 && recentSource < lock.rows.length, 'R17 source receipt must be pinned');
assert.ok(recentNoGo >= 91 && recentNoGo < lock.rows.length, 'R12 native NO-GO receipt must be pinned');
mustReject('newer R17 source commit forged with valid SHA shape', rows => rows[recentSource].source_commit = 'f'.repeat(40));
mustReject('newer R12 native failure evidence relabeled', rows => rows[recentNoGo].status = 'source-only');
mustReject('newer pinned tail record deleted', rows => rows.splice(lock.rows.length - 1, 1));
const appended=clone();
appended.push({...appended.at(-1),id:'continuity-synthetic-future-source',source_commit:'f'.repeat(40)});
check(appended);

const r29Pinned = [
  'integration-pr103-r23-mit-notice-source-only-20261024',
  'data-safety-pr114-r11-sample-pairing-ota-no-go-20261024',
  'bugfinder-bf022-pr128-legacy-master-highpass-20261024',
];
assert.ok(lock.rows.length >= 122, 'R29 122 immutable historical SHA256 receipts required');
for (const id of r29Pinned) {
  const index = original.findIndex(row => row.id === id);
  assert.ok(index >= 119 && index < lock.rows.length, id + ': R29 source receipt absent');
  mustReject('R29 source-SHA proof mutation ' + id,
    rows => { rows[index].source_commit = 'f'.repeat(40); });
}

const r30Id = 'integration-pr103-firmware-nightly-merged-browser-route-20261024';
assert.ok(lock.rows.length >= 123, 'R30 merged NIGHTLY source receipt must be SHA256 pinned');
const r30Index = original.findIndex(row => row.id === r30Id);
assert.equal(r30Index, 122, 'R30 new immutable receipt must be appended, not inserted or reordered');
const r30Row = original[r30Index];
assert.equal(r30Row.status, 'validation-evidence-only', 'NIGHTLY integration is not a new build');
assert.equal(r30Row.source_commit, '54f2ffbc3124f7449a69067dc8215a2d91a2e675');
assert.equal(r30Row.source_tree, '3b5cadafba33f4c1b116660bc9d19a27a892337c');
assert.equal(r30Row.firmware_subtree, '5c209609b770fd13949230aeb80956594fd6b741');
assert.equal(r30Row.installable, false, 'merged source is not a hardware-test candidate');
assert.equal(r30Row.device_verified, false, 'never fabricate physical device QA');
assert.equal(r30Row.artifact_distribution_approved, false, 'never self-authorize distribution');
mustReject('R30 confirmed protected NIGHTLY merge removed', rows => rows.splice(r30Index, 1));
mustReject('R30 merged source Git commit forged', rows => { rows[r30Index].source_commit = 'f'.repeat(40); });
mustReject('R30 compiled firmware subtree impersonated', rows => { rows[r30Index].firmware_subtree = 'f'.repeat(40); });
mustReject('R30 hardware flashability fraud', rows => { rows[r30Index].installable = true; });

// R33: a publisher Pages Git manifest observation is not a new firmware build or flash approval.
const pagesGitId='nightly-pages-git-dev-candidate-54f2ffbc-20261024';
assert.ok(lock.rows.length >= 124, 'R33 Pages Git record must be pinned');
const pagesIndex=original.findIndex(row=>row.id===pagesGitId);
assert.equal(pagesIndex,123,'R33 Pages Git receipt must append without reordering');
const pagesRow=original[pagesIndex];
assert.equal(pagesRow.status,'validation-evidence-only');
assert.equal(pagesRow.source_commit,'54f2ffbc3124f7449a69067dc8215a2d91a2e675');
assert.equal(pagesRow.source_tree,'3b5cadafba33f4c1b116660bc9d19a27a892337c');
assert.equal(pagesRow.firmware_subtree,'5c209609b770fd13949230aeb80956594fd6b741');
assert.equal(pagesRow.installable,false);
assert.equal(pagesRow.device_verified,false);
assert.equal(pagesRow.artifact_distribution_approved,false);
assert.match(pagesRow.source_identity_note,/b7af05f00a91056ca732b21cbe1dc719edbcb585/);
mustReject('R33 Pages Git receipt deleted',rows=>rows.splice(pagesIndex,1));
mustReject('R33 Pages Git SHA forged',rows=>{rows[pagesIndex].source_identity_note=rows[pagesIndex].source_identity_note.replace('b7af05f00a91056ca732b21cbe1dc719edbcb585','f'.repeat(40));});
mustReject('R33 download falsely granted',rows=>{rows[pagesIndex].installable=true;});
mustReject('R33 hardware PASS falsely granted',rows=>{rows[pagesIndex].device_verified=true;});
mustReject('R33 distribution permission falsely granted',rows=>{rows[pagesIndex].artifact_distribution_approved=true;});



// R35: independent native extraction failure is factual read-only history, never NIGHTLY qualification.
const r35Id='data-safety-pr114-r18-native-extract-fdopen-needs-changes-20261025';
assert.ok(lock.rows.length >= 125,'R35 native extraction QA receipt must remain pinned');
const r35Index=original.findIndex(row=>row.id===r35Id);
assert.equal(r35Index,124,'R35 must append without replacing 124 prior records');
const r35Row=original[r35Index];
assert.equal(r35Row.source_commit,'8361f45a0becb26426d51a795a9505e675cafd2b');
assert.equal(r35Row.source_tree,'577e442f9d8a0a17062a845b8be8cd676a232e2e');
assert.equal(r35Row.status,'source-only');
assert.deepEqual(r35Row.models,[]);
assert.equal(r35Row.installable,false);
assert.equal(r35Row.device_verified,false);
assert.equal(r35Row.artifact_distribution_approved,false);
assert.equal(r35Row.exact_remote_native_build,false);
assert.match(r35Row.reported_checks.result,/NEEDS CHANGES/);
assert.match(r35Row.reported_checks.command,/exit 1, 5\/6/);
mustReject('R35 independent failed QA deleted',rows=>rows.splice(r35Index,1));
mustReject('R35 independent failure changed to PASS',rows=>rows[r35Index].reported_checks.result='PASS');
mustReject('R35 source SHA forged',rows=>rows[r35Index].source_commit='f'.repeat(40));
mustReject('R35 qualified-download fabricated',rows=>rows[r35Index].installable=true);
mustReject('R35 device QA fabricated',rows=>rows[r35Index].device_verified=true);


 
// R36: a known unsafe Pages Git admission precondition is a factual, noninstallable status event.
const r36Id='nightly-pages-git-unqualified-dev-admission-20261025';
assert.ok(lock.rows.length>=126,'R36 unsafe Pages Git source observation must remain pinned');
const r36Index=original.findIndex(row=>row.id===r36Id);
assert.equal(r36Index,125,'R36 must append after all 125 prior history events');
const r36Row=original[r36Index];
assert.equal(r36Row.source_commit,'b7af05f00a91056ca732b21cbe1dc719edbcb585');
assert.equal(r36Row.source_tree,'9e192c467973368c407cf148099e35c6280b2eae');
assert.equal(r36Row.status,'validation-evidence-only');
assert.deepEqual(r36Row.models,['elite','pro']);
assert.equal(r36Row.installable,false);
assert.equal(r36Row.device_verified,false);
assert.equal(r36Row.artifact_distribution_approved,false);
assert.equal(r36Row.exact_remote_native_build,false);
assert.equal(r36Row.artifact_bytes_independently_verified,false);
assert.match(r36Row.reported_checks.result,/UNSAFE CATALOG ADMISSION OBSERVED/);
mustReject('R36 Pages Git unsafe admission record deleted',rows=>rows.splice(r36Index,1));
mustReject('R36 Pages Git commit forged',rows=>{rows[r36Index].source_commit='f'.repeat(40);});
mustReject('R36 source tree forged',rows=>{rows[r36Index].source_tree='f'.repeat(40);});
mustReject('R36 unsafe admission denied as PASS',rows=>{rows[r36Index].reported_checks.result='PASS';});
mustReject('R36 falsely qualified for download',rows=>{rows[r36Index].installable=true;});
mustReject('R36 forged hardware PASS',rows=>{rows[r36Index].device_verified=true;});
mustReject('R36 fake verified server bytes',rows=>{rows[r36Index].artifact_bytes_independently_verified=true;});


// R37 immutable website source-only repair proposal; never a firmware or browser safety acceptance.
const r37Id='nightly-browser-pr14-catalog-approval-denials-source-20261025',r37Index=original.findIndex(x=>x.id===r37Id);
assert.equal(r37Index,126);
const r37=original[r37Index];
assert.equal(r37.source_commit,'7515d147e4817248dece608c73fd7fb171e996f2');
assert.equal(r37.source_tree,'7db90a3810f790d3b939b4cdc34a768ff6e9200a');
assert.equal(r37.status,'source-only');
assert.deepEqual(r37.models,['elite','pro']);
assert.equal(r37.installable,false);
assert.equal(r37.device_verified,false);
assert.equal(r37.artifact_distribution_approved,false);
assert.equal(r37.artifact_bytes_independently_verified,false);
assert.match(r37.reported_checks.result,/INDEPENDENT WEBSITE QA PENDING/);
mustReject('R37 report deleted',rows=>rows.splice(r37Index,1));
mustReject('R37 SHA forged',rows=>{rows[r37Index].source_commit='f'.repeat(40)});
mustReject('R37 root forged',rows=>{rows[r37Index].source_tree='f'.repeat(40)});
mustReject('R37 download fabricated',rows=>{rows[r37Index].installable=true});
mustReject('R37 device PASS fabricated',rows=>{rows[r37Index].device_verified=true});
console.log('PASS: ' + lock.rows.length + ' SHA256-pinned historical records with R37 continuity negatives; safe append');
