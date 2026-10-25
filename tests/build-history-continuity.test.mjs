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
// R39: independently scoped website source review remains not installable.
const r39Id='nightly-browser-pr14-r2-hardware-facts-independent-scoped-review-20261025';
assert.ok(lock.rows.length>=128,'128 history rows must be pinned');
const r39Index=original.findIndex(x=>x.id===r39Id);
assert.equal(r39Index,127,'R39 appended last');
const r39=original[r39Index];
assert.equal(r39.source_commit,'593c0fc3c18200fd887373bff4602bfd322f0d54');
assert.equal(r39.source_tree,'e1255056dff9ebdcb2d1836e6e139dfa506f8995');
assert.equal(r39.status,'validation-evidence-only');
assert.deepEqual(r39.models,['elite','pro']);
assert.equal(r39.installable,false);assert.equal(r39.device_verified,false);
assert.equal(r39.artifact_distribution_approved,false);assert.equal(r39.artifact_bytes_independently_verified,false);
assert.match(r39.reported_checks.result,/INDEPENDENT QA SCOPED REVIEWED/);
assert.ok(r39.reported_checks.result.includes('FULL WEBSITE/BROWSER QA INCOMPLETE'));
mustReject('R39 QA event deleted',rows=>rows.splice(r39Index,1));
mustReject('R39 source SHA forged',rows=>rows[r39Index].source_commit='f'.repeat(40));
mustReject('R39 source tree forged',rows=>rows[r39Index].source_tree='f'.repeat(40));
mustReject('R39 QA scope forged',rows=>rows[r39Index].reported_checks.result='FULL SITE PASS');
mustReject('R39 download fabricated',rows=>rows[r39Index].installable=true);
mustReject('R39 device PASS fabricated',rows=>rows[r39Index].device_verified=true);
mustReject('R39 rights grant fabricated',rows=>rows[r39Index].artifact_distribution_approved=true);
console.log('PASS: ' + lock.rows.length + ' SHA256-pinned historical records with R39 continuity negatives; safe append');


// R40 BF-031: musical sequencer source evidence is not an independently built/qualified firmware package.
const r40Id='bugfinder-bf031-pr140-tb3po-logical-bars-source-20261025';
const r40Index=original.findIndex(x=>x.id===r40Id);
assert.equal(r40Index,128,'R40 appended after immutable 128-row history');
const r40=original[r40Index];
assert.equal(r40.source_commit,'a964401ec29028ab488a7586d8b54d0e24ea58ce');
assert.equal(r40.source_tree,'2a3c78247b6164d43f995e640d98b71aae933498');
assert.equal(r40.firmware_subtree,'7f35a88270c7a4c0e782d7711cfd7110fc162a23');
assert.equal(r40.status,'source-only');assert.deepEqual(r40.models,[]);
assert.equal(r40.installable,false);assert.equal(r40.device_verified,false);
assert.equal(r40.artifact_distribution_approved,false);assert.equal(r40.exact_remote_native_build,false);
assert.match(r40.reported_checks.result,/INDEPENDENT FIRMWARE QA PENDING/);
mustReject('R40 BF031 source removed',rows=>rows.splice(r40Index,1));
mustReject('R40 BF031 root forged',rows=>rows[r40Index].source_tree='f'.repeat(40));
mustReject('R40 BF031 source forged',rows=>rows[r40Index].source_commit='f'.repeat(40));
mustReject('R40 fake independent QA',rows=>rows[r40Index].reported_checks.result='INDEPENDENT FULL ROOT PASS');
mustReject('R40 fake device PASS',rows=>rows[r40Index].device_verified=true);
mustReject('R40 fake firmware download',rows=>rows[r40Index].installable=true);
mustReject('R40 fake firmware BUILD_ONLY',rows=>rows[r40Index].exact_remote_native_build=true);
console.log('PASS: R40 pinned source-only BF031 and negative evidence checks; full native root still required');


// R41: BF031 R2 uses musical slot parity, not accidental random source-step parity.
const r41SwingId='bugfinder-bf031-pr140-r2-random-temporal-swing-source-20261025',r41SwingIndex=original.findIndex(r=>r.id===r41SwingId);
assert.equal(r41SwingIndex,129);const r41Swing=original[r41SwingIndex];
assert.equal(r41Swing.source_commit,'a4bb338f0e456381675409fef75709155916e265');
assert.equal(r41Swing.source_tree,'a5ffdb29d990c8d093cf691baa481d727f5c290e');
assert.equal(r41Swing.firmware_subtree,'f83d9e624ea54618dada87427c8f7954fca28aa6');
assert.equal(r41Swing.status,'source-only');assert.deepEqual(r41Swing.models,[]);
assert.equal(r41Swing.installable,false);assert.equal(r41Swing.device_verified,false);
assert.equal(r41Swing.exact_remote_native_build,false);
assert.match(r41Swing.reported_checks.result,/INDEPENDENT FIRMWARE QA PENDING/);
mustReject('R41 swing deleted',r=>r.splice(129,1));
mustReject('R41 swing source changed',r=>r[129].source_commit='f'.repeat(40));
mustReject('R41 swing compiler source changed',r=>r[129].firmware_subtree='f'.repeat(40));
mustReject('R41 swing fabricated build',r=>r[129].exact_remote_native_build=true);
mustReject('R41 swing fake hardware',r=>r[129].device_verified=true);
mustReject('R41 swing fake installable',r=>r[129].installable=true);

// R41: removed native-build/licensing gates are a source POLICY HOLD, not approved firmware.
const r41PolicyId='nightly-pr15-qualification-gate-removal-policy-hold-20261025',r41PolicyIndex=original.findIndex(r=>r.id===r41PolicyId);
assert.equal(r41PolicyIndex,130);const r41Policy=original[r41PolicyIndex];
assert.equal(r41Policy.source_commit,'c2fdf75577baa0945735c44c15ef219f7adfd9f3');assert.equal(r41Policy.source_tree,'1123a906173b6aa0065600528840823162fb502d');
assert.equal(r41Policy.status,'validation-evidence-only');assert.deepEqual(r41Policy.models,[]);
assert.equal(r41Policy.installable,false);assert.equal(r41Policy.artifact_distribution_approved,false);
assert.equal(r41Policy.exact_remote_native_build,false);
assert.match(r41Policy.reported_checks.result,/SOURCE POLICY CONTRADICTION OBSERVED/);
mustReject('R41 safety HOLD removed',r=>r.splice(130,1));
mustReject('R41 safety HOLD forged',r=>r[130].source_commit='f'.repeat(40));
mustReject('R41 safety HOLD false QA approval',r=>r[130].reported_checks.result='FULL PASS');
mustReject('R41 safety HOLD false distribution',r=>r[130].artifact_distribution_approved=true);
mustReject('R41 safety HOLD false install',r=>r[130].installable=true);
console.log('PASS R41: 131 SHA-256 seals and permanent source-only / negative policy evidence; native npm still required');


// R42: exact musical clock repair, bundled source integration and upstream-proof clarification are noninstallable.
const r42Pins=[
 ['bugfinder-bf031-pr140-r3-random-clock-handoff-source-20261025','4b67024e62bfd1b4d5789827334f6bea4f9b4e00'],
 ['nightly-pr142-bundled-controller-source-in-firmware-nightly-20261025','04cb592c47f4b8d5049f5399d7f6f45b50b92c2c'],
 ['nightly-pr15-r2-upstream-proof-policy-clarification-pending-20261025','b26c0838f8d91788fd4c65bddcf66c2df05883b6']
];
assert.ok(lock.rows.length>=134,'R42 134 immutable SHA256 rows required');
for(let n=0;n<r42Pins.length;n++){
 const i=131+n, r=original[i];assert.equal(r.id,r42Pins[n][0]);assert.equal(r.source_commit,r42Pins[n][1]);
 assert.deepEqual(r.models,[]);assert.equal(r.installable,false);assert.equal(r.device_verified,false);
 assert.equal(r.artifact_distribution_approved,false);assert.equal(r.exact_remote_native_build,false);
 assert.equal(r.artifact_bytes_independently_verified,false);
 mustReject('R42 deletion '+n,rows=>rows.splice(i,1));
 mustReject('R42 source forgery '+n,rows=>rows[i].source_commit='f'.repeat(40));
 mustReject('R42 false publication '+n,rows=>rows[i].installable=true);
 mustReject('R42 false rights '+n,rows=>rows[i].artifact_distribution_approved=true);
}
assert.equal(original[131].firmware_subtree,'7165ed8e7a5d4297c19123037cc70c9a4f7a293e');
assert.match(original[131].reported_checks.result,/INDEPENDENT FIRMWARE QA PENDING/);
assert.match(original[132].reported_checks.result,/RIGHTS\/SOURCE\/NOTICES UNRESOLVED/);
assert.match(original[133].reported_checks.result,/SAME-BYTE UPSTREAM EVIDENCE LINKAGE NOT ESTABLISHED/);
mustReject('R42 compiler mismatch',rows=>rows[131].firmware_subtree='f'.repeat(40));
console.log('PASS R42: 134 immutable noninstallable development history receipts');


// R43: three exact source observations are immutable and never authorize installation.
const r43Pins=[["bugfinder-bf032-pr152-tb3po-accent-preservation-source-20261025","d92f9735eb61eecc6dae30d510c0b56ab587ab00","edb53879916d7a91305f2cf78227a544746ab4bb"],["nightly-installer-pr16-bundled-bluetooth-verifier-draft-20261025","cc7e7e8e68717acda8c774d4da8ca7d5cc401ff8","7600043f26378ff575e22bc8a8ee245e4a044d35"],["nightly-workspace-pr17-firmware-samples-unified-draft-20261025","7d920217b32edb7e3c93fae222a1c69a0025696f","b615bc8dc25136a47b0052bcd44a466e1cd713df"]];
assert.ok(lock.rows.length>=137,'R43 137 SHA256-pinned records required');
for(let n=0;n<r43Pins.length;n++){
 const i=134+n,r=original[i];assert.equal(r.id,r43Pins[n][0]);
 assert.equal(r.source_commit,r43Pins[n][1]);assert.equal(r.source_tree,r43Pins[n][2]);
 assert.equal(r.status,'source-only');assert.equal(r.installable,false);assert.equal(r.device_verified,false);
 assert.equal(r.artifact_distribution_approved,false);assert.equal(r.exact_remote_native_build,false);
 assert.equal(r.artifact_bytes_independently_verified,false);
 mustReject('R43 deleted '+n,h=>h.splice(i,1));
 mustReject('R43 source forgery '+n,h=>h[i].source_commit='f'.repeat(40));
 mustReject('R43 false install '+n,h=>h[i].installable=true);
 mustReject('R43 false rights '+n,h=>h[i].artifact_distribution_approved=true);
}
assert.equal(original[134].firmware_subtree,'50fe0ba0433291b93f8798a93bffd74c7173886f');
assert.deepEqual(original[135].models,['elite','pro']);assert.deepEqual(original[136].models,[]);
mustReject('R43 forged compiler',h=>h[134].firmware_subtree='f'.repeat(40));
mustReject('R43 wrong model',h=>h[135].models=['pro','elite']);
mustReject('R43 false QA',h=>h[136].reported_checks.result='FULL INDEPENDENT QA PASS');
console.log('PASS R43: 137 SHA256-pinned nonflashable historical events');


// R44: immutable source-only host QA and website integration records, never install admission.
const r44SourceIds=["bugfinder-bf033-pr159-random-tie-independent-host-20261025","website-main-pr14-pr16-pr17-merged-source-only-20261025"];
assert.ok(lock.rows.length>=139,'R44 139 SHA-256 history seals required');
for(let n=0;n<2;n++){
 const i=137+n,r=original[i];assert.equal(r.id,r44SourceIds[n]);
 assert.equal(r.installable,false);assert.equal(r.device_verified,false);
 assert.equal(r.artifact_distribution_approved,false);assert.equal(r.exact_remote_native_build,false);
 mustReject('R44 deleted '+n,h=>h.splice(i,1));
 mustReject('R44 forged SHA '+n,h=>h[i].source_commit='f'.repeat(40));
 mustReject('R44 false download '+n,h=>h[i].installable=true);
 mustReject('R44 false rights '+n,h=>h[i].artifact_distribution_approved=true);
}
assert.equal(original[137].firmware_subtree,'75a7a40cb8b0fb647e7143b889309b485bb59fcd');
assert.equal(original[138].source_tree,'b615bc8dc25136a47b0052bcd44a466e1cd713df');
mustReject('R44 false compiler tree',h=>h[137].firmware_subtree='f'.repeat(40));
