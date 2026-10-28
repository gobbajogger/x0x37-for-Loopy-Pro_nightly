// SPDX-License-Identifier: GPL-3.0-only
// Test a private copy so malformed manifests never touch tracked files.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const required = [
  'scripts/verify-build-status.mjs', 'build-status.json', 'docs/build-status.json',
  'preview-catalog.json', 'docs/versions.json', 'docs/builds/index.html', 'docs/index.html',
  'docs/scheduler-handoffs/catalog-sync-20261024.json',
  'docs/scheduler-handoffs/catalog-sync-20261024-r25.json',
  'tests/fixtures/history-appendonly-baseline-20261024.json'
];
function run(label, mutate, shouldPass = false) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'x0x37-status-'));
  try {
    for (const name of required) {
      const target = join(dir, name);
      fs.mkdirSync(dirname(target), {recursive:true});
      fs.copyFileSync(join(root, name), target);
    }
    fs.writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
    mutate(dir);
    const r = spawnSync(process.execPath, [join(dir, required[0])], {cwd: dir, encoding:'utf8', timeout:15000});
    assert.equal(r.error, undefined, label + ' spawned');
    if (shouldPass) assert.equal(r.status, 0, label + ': ' + r.stderr);
    else assert.notEqual(r.status, 0, label + ' was wrongly accepted');
    console.log('PASS ' + label);
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
}
const edit = fn => dir => {
  const j = JSON.parse(fs.readFileSync(join(dir,'build-status.json'),'utf8'));
  fn(j);
  const s = JSON.stringify(j, null, 2) + '\n';
  fs.writeFileSync(join(dir,'build-status.json'),s);
  fs.writeFileSync(join(dir,'docs/build-status.json'),s);
};
run('baseline',()=>{},true);
// R20 history integrity did NOT cover the 2 actual DEV-generation identities.
run('historic-elite-firmware-hash-forged-64hex',edit(j=>j.builds[0].models.elite.sha256='a'.repeat(64)));
run('historic-pro-firmware-hash-forged-64hex',edit(j=>j.builds[1].models.pro.sha256='b'.repeat(64)));
run('historic-elite-size-forged-positive',edit(j=>j.builds[0].models.elite.size=42));
run('historic-source-commit-forged-40hex',edit(j=>j.builds[0].source_commit='f'.repeat(40)));
run('historic-generation-deleted-with-adjusted-count',edit(j=>{
  j.builds.pop();j.counts.actual_build_generations=j.builds.length;
}));
run('historic-generations-reordered',edit(j=>j.builds.reverse()));
run('legitimate-new-DEV-generation-prepended',edit(j=>{
  const later=structuredClone(j.builds[0]);
  later.id='dev-future-synthetic-test-only';
  later.title='Synthetic future-only DEV identity';
  later.built_at='2026-10-25T00:00:00Z';
  later.source_commit='f'.repeat(40);
  j.builds[0].lifecycle='superseded';
  j.builds.unshift(later);
  j.counts.actual_build_generations=j.builds.length;
}),true);
run('legitimate-existing-DEV-lifecycle-progression',edit(j=>j.builds[0].lifecycle='superseded'),true);
// Simulated hashes and Git links are not verified device observations.
const fictionalOwnerReport = () => ({
  report_sha256:'f'.repeat(64),
  report_url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/commit/'+'e'.repeat(40),
  controller_sha256:'d'.repeat(64),
  owner_publication_approved:true
});
const forgeOwnerHardware = (j,models) => {
  const b=j.builds[0]; b.hardware_tested=true;
  for(const m of models){
    b.models[m].device_verified=true;
    b.models[m].physical_evidence=fictionalOwnerReport();
  }
};
run('forged-Elite-hardware-proof-is-not-owner-verification',
  edit(j=>forgeOwnerHardware(j,['elite'])));
run('forged-both-model-hardware-proofs-are-not-owner-verification',
  edit(j=>forgeOwnerHardware(j,['elite','pro'])));
run('forged-public-latest-and-both-models-are-not-owner-authorization',
  edit(j=>{forgeOwnerHardware(j,['elite','pro']);j.policy.public_device_proven_versions=[j.builds[0].id];j.policy.public_latest=j.builds[0].id;}));
for (const [name, fn] of [
  ['aggregate-device-flag',j=>j.builds[0].hardware_tested=true],
  ['forged-history-device-pass',j=>j.history[0].status='device-verified'],
  ['build-forged-device-status',j=>j.builds[0].status='device-verified'],
  ['build-forged-stable-status',j=>j.builds[0].status='stable'],
  ['build-forged-hardware-proven',j=>j.builds[0].status='hardware-proven'],
  ['empty-build-id',j=>j.builds[0].id=''],
  ['empty-history-id',j=>j.history[0].id=''],
  ['cross-build-history-duplicate-id',j=>j.history[0].id=j.builds[0].id],
  ['empty-build-models',j=>j.builds[0].models={}],
  ['script-URL',j=>j.history[0].url='javascript:alert(1)'],
  ['insecure-URL',j=>j.history[0].url='http://github.com/'],
  ['unsupported-model',j=>j.history[0].models=['FM1']],
  ['history-device-bool',j=>j.history[0].device_verified=true],
  ['history-installable',j=>j.history[0].installable=true],
  ['history-unknown-status',j=>j.history[0].status='stable'],
  ['history-bad-source-SHA',j=>j.history[0].source_commit='bad'],
  ['model-bad-hash',j=>j.builds[0].models.elite.sha256='bad'],
  ['build-unreviewed-qa-forgery',j=>j.history.find(x=>x.status==='build-succeeded-unreviewed').build_pipeline.qa='QA_PASSED'],
  ['build-unreviewed-http-forgery',j=>j.history.find(x=>x.status==='build-succeeded-unreviewed').build_pipeline.live_http='LIVE_HTTP_VERIFIED'],
  ['build-unreviewed-installable-forgery',j=>j.history.find(x=>x.status==='build-succeeded-unreviewed').build_pipeline.installability='READY_FOR_FLASH'],
  ['build-unreviewed-silenced-failure',j=>j.history.find(x=>x.status==='build-succeeded-unreviewed').build_pipeline.followup_native_checks_fail=[]],
  ['build-unreviewed-missing-pro',j=>delete j.history.find(x=>x.status==='build-succeeded-unreviewed').producer_reported_artifacts.pro],
  ['build-unreviewed-forged-rehash',j=>j.history.find(x=>x.status==='build-succeeded-unreviewed').artifact_bytes_independently_verified=true],
  ['firmware-link',j=>j.history[0].pkg='https://evil.example/evil.fwsc'],
  ['real-failed-build-relabel-source',j=>j.history.find(x=>x.id==='producer-pr93-20261023').status='source-only'],
  ['real-failed-build-relabel-evidence',j=>j.history.find(x=>x.id==='producer-pr93-20261023').status='evidence-only'],
  ['real-failed-build-remove-receipt',j=>delete j.history.find(x=>x.id==='producer-pr93-20261023').failed_build],
  ['real-failed-build-remove-receipt-and-relabel',j=>{const x=j.history.find(x=>x.id==='producer-pr93-20261023');delete x.failed_build;x.status='source-only';}],
  ['real-failed-build-forge-source-root',j=>j.history.find(x=>x.id==='producer-pr93-20261023').source_tree='a'.repeat(40)],
  ['real-failed-build-forge-valid-log-hash',j=>j.history.find(x=>x.id==='producer-pr93-20261023').failed_build.elite.log_sha256='a'.repeat(64)],
  ['real-failed-build-forge-pro-compiler-exit',j=>j.history.find(x=>x.id==='producer-pr93-20261023').failed_build.pro.exit_code=2],
  ['other-source-only-with-typed-failure',j=>{const f=j.history.find(x=>x.id==='producer-pr93-20261023').failed_build;j.history.find(x=>x.status==='source-only').failed_build=JSON.parse(JSON.stringify(f));}],
]) run(name,edit(fn));
run('nonempty-preview',dir=>{
  const p=join(dir,'preview-catalog.json');
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  j.versions=[{version:'unapproved'}];fs.writeFileSync(p,JSON.stringify(j));
});
run('source-docs-mismatch',dir=>{
  const p=join(dir,'docs/build-status.json');
  fs.appendFileSync(p,' ');
});

run('deleted-DEV-generations-and-entire-pinned-history-cannot-be-accepted',edit(j=>{
  j.history=[]; j.builds=[];
  j.counts.actual_build_generations=0;
  j.counts.source_or_historical_checkpoints=0;
  j.policy.public_latest=null; j.policy.public_device_proven_versions=[];
}));
run('standalone-catalog-check-rejects-tail-history-delete-even-with-updated-count',edit(j=>{
  j.history.pop();j.counts.source_or_historical_checkpoints=j.history.length;
}));
run('standalone-catalog-check-rejects-valid-40hex-pinned-history-source-forgery',edit(j=>{
  j.history[0].source_commit='f'.repeat(40);
}));
run('standalone-catalog-check-rejects-two-pinned-history-rows-swapped',edit(j=>{
  [j.history[0],j.history[1]]=[j.history[1],j.history[0]];
}));
run('standalone-catalog-check-accepts-truthful-future-noninstallable-history-append',edit(j=>{
  j.history.push({
    id:'catalog-future-noninstallable-positive',title:'Synthetic future SOURCE ONLY evidence',
    date:'2026-10-25',status:'source-only',models:[],source_commit:'f'.repeat(40),
    installable:false,device_verified:false
  });
  j.counts.source_or_historical_checkpoints=j.history.length;
}),true);
run('approved-GitHub-source-evidence-remains-allowed-on-append',edit(j=>{
  j.history.push({
    id:'future-approved-git-source-proof-test',title:'Synthetic future source navigation test',
    date:'2026-10-25',status:'source-only',models:[],source_commit:'f'.repeat(40),
    installable:false,device_verified:false,
    evidence_url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/commit/58b5b45a2dd90581de7a674c331ca5cbe8a67c7e'
  });
  j.counts.source_or_historical_checkpoints=j.history.length;
}),true);
for(const [label,mutation] of [
 ['nested-history-download-bin',j=>j.history[0].download_url='https://example.net/firmware.bin'],
 ['nested-history-picker',j=>j.history[0].picker_url='https://example.net/file'],
 ['nested-history-artifact-text',j=>j.history[0].artifact_url='https://example.net/readme.txt'],
 ['reported-check-forged-verified-object-no-link',j=>j.history.find(x=>x.reported_checks).reported_checks.result={status:'DEVICE_VERIFIED'}],
 ['history-description-forged-release-object-no-link',j=>j.history[0].description={stage:'RELEASE_APPROVED'}],
 ['history-title-forged-release-object-no-link',j=>j.history[0].title={stage:'DEV_VERIFIED'}],
 ['history-date-object-no-link',j=>j.history[0].date={day:'2026-10-24'}],
 ['history-source-ref-object-no-link',j=>j.history.find(x=>x.source_ref).source_ref={ref:'nightly'}],
 ['history-missing-gate-object-no-link',j=>j.history.find(x=>x.missing_gate).missing_gate={qa:'PASSED'}],
 ['reported-check-command-object-no-link',j=>j.history.find(x=>x.reported_checks).reported_checks.command={exit_code:0}],
 ['history-blank-title',j=>j.history[0].title='   '],
 ['nested-history-assets',j=>j.history[0].assets={url:'https://example.net/file'}],
 ['nested-reported-check-download',j=>j.history.find(x=>x.reported_checks).reported_checks.download_url='https://example.net/file'],
 ['nested-build-pipeline-release',j=>j.history.find(x=>x.build_pipeline).build_pipeline.release_url='https://example.net/file'],
 ['nested-failed-check-link',j=>j.history.find(x=>x.build_pipeline).build_pipeline.followup_native_checks_fail[0].download_url='https://example.net/file'],
 ['nested-reported-package-link',j=>j.history.find(x=>x.producer_reported_artifacts).producer_reported_artifacts.elite.download_url='https://example.net/file'],
 ['nested-controller-link',j=>j.history.find(x=>x.producer_reported_artifacts).producer_reported_artifacts.private_controller.download_url='https://example.net/file'],
 ['nested-offline-controller-link',j=>j.history.find(x=>x.reported_offline_artifacts).reported_offline_artifacts.controller.download_url='https://example.net/file'],
 ['nested-failed-native-build-link',j=>j.history.find(x=>x.failed_build).failed_build.elite.download_url='https://example.net/file'],
 ['nested-build-model-link',j=>j.builds[0].models.elite.picker_url='https://example.net/file'],
 ['top-level-binary-link',j=>j.download_url='https://example.net/file'],
 ['unrecognized-build-release-checked',j=>j.builds[0].status='release-checked'],
 ['unrecognized-build-lifecycle',j=>j.builds[0].lifecycle='live'],
 ['duplicate-history-ids',j=>j.history[1].id=j.history[0].id],
 ['unapproved-download-on-github',j=>j.history[0].url='https://github.com/gobbajogger/X0X37-for-Loopy-Pro/releases/download/v1/firmware.bin'],
 ['unapproved-binary-blob',j=>j.history[0].url='https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/firmware.bin'],
 ['forged-GitHub-host',j=>j.history[0].url='https://github.com.evil.invalid/gobbajogger/X0X37-for-Loopy-Pro/pull/1'],
 ['github-query-forced-download',j=>j.history[0].url='https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/1?download=1'],
 ['wrong-source-repository',j=>j.history.find(x=>x.source_repo).source_repo='https://example.net/sources'],
 ['unknown-source-download-field',j=>j.source.download_url='https://example.net/file'],
 ['versioning-picker-url',j=>j.versioning.picker_url='https://example.net/file'],
 ['unreviewed-controller-redistribution',j=>j.history.find(x=>x.producer_reported_artifacts).producer_reported_artifacts.private_controller.redistribution_permitted=true],
 ['failed-build-forged-artifact',j=>j.history.find(x=>x.failed_build).failed_build.elite.artifact_created=true]
]) run(label,edit(mutation));
run('synthetic-malicious-Release-does-not-become-an-installable-catalog',dir=>{
  const p=join(dir,'preview-catalog.json');
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  j.versions=[{model:'elite',source_commit:'f'.repeat(40),sha256:'f'.repeat(64),
    status:'DEVICE_VERIFIED',download_url:'https://evil.invalid/unapproved.bin'}];
  fs.writeFileSync(p,JSON.stringify(j));
});


 // Historical hardware observations and PRODUCTION permission are distinct.
 // These synthetic fixtures never add firmware or authorize installation.
const officialReport='https://github.com/gobbajogger/X0X37-for-Loopy-Pro/commit/'+'b'.repeat(40);
function setProof(j,{eliteApproved=false,proVerified=false,proApproved=false}={}){
  const b=j.builds[0];b.hardware_tested=true;
  for(const model of ['elite','pro']){
    if(model==='pro'&&!proVerified)continue;
    const m=b.models[model];m.device_verified=true;m.physical_evidence={
      report_sha256:'a'.repeat(64),report_url:officialReport,
      controller_sha256:'c'.repeat(64),owner_publication_approved:model==='elite'?eliteApproved:proApproved
    };
  }
}
run('synthetic-Elite-device-report-without-owner-attestation-REJECTED',edit(j=>setProof(j)));
run('synthetic-both-model-production-proof-shape-not-attestation-REJECTED',edit(j=>{
  setProof(j,{eliteApproved:true,proVerified:true,proApproved:true});
  j.policy.public_latest=j.builds[0].id;j.policy.public_device_proven_versions=[j.builds[0].id];
}));
for(const [label,mutate] of [
 ['hidden-description-download-any-extension',j=>j.history[0].description={download_url:'https://example.net/firmware.bin'}],
 ['hidden-policy-artifact',j=>j.policy.nightly={artifact_url:'https://example.net/file.txt'}],
 ['hidden-reported-check-picker',j=>j.history.find(x=>x.reported_checks).reported_checks.result={picker_url:'https://example.net/file'}],
 ['hidden-build-pipeline-Release',j=>j.history.find(x=>x.build_pipeline).build_pipeline.builder_selected_host_checks_pass={release_url:'https://example.net/file'}],
 ['hidden-generic-link',j=>j.history[0].description={notes:'https://example.net/file'}],
 ['hidden-blob-URI',j=>j.history[0].description={asset_uri:'blob:unapproved'}],
 ['mislabelled-Elite-build-model',j=>j.builds[0].models.elite.product='SMK-37 Pro_900'],
 ['public-single-model-cannot-imply-Pro',j=>{setProof(j,{eliteApproved:true});j.policy.public_latest=j.builds[0].id;j.policy.public_device_proven_versions=[j.builds[0].id]}],
 ['public-list-needs-each-model-approval',j=>{setProof(j,{eliteApproved:false,proVerified:true,proApproved:true});j.policy.public_latest=j.builds[0].id;j.policy.public_device_proven_versions=[j.builds[0].id]}]
])run(label,edit(mutate));

 // Evidence is SHA-pinned. Mutable routes are allowed ONLY for navigation, not proof.
run('mutable-history-navigation-is-not-a-proof-claim-on-future-append',edit(j=>{
  j.history.push({
    id:'future-mutable-navigation-test',title:'Synthetic future read-only history navigation',
    date:'2026-10-25',status:'source-only',models:[],source_commit:'f'.repeat(40),
    installable:false,device_verified:false,
    url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/tree/main'
  });
  j.counts.source_or_historical_checkpoints=j.history.length;
}),true);
run('new-future-DEV-model-may-reference-immutable-validation-record',edit(j=>{
  const later=structuredClone(j.builds[0]);
  later.id='dev-future-synthetic-immutable-validation-test';
  later.title='Synthetic future-only model validation';
  later.built_at='2026-10-25T00:00:00Z';
  later.source_commit='f'.repeat(40);
  later.models.elite.validation_record=
    'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/'+
    'e5cc2c720af5f815cbb6bf0774971a41594b9574'+'/docs/build-proof.json';
  j.builds.unshift(later);
  j.counts.actual_build_generations=j.builds.length;
}),true);
for (const [label,mutate] of [
  ['mutable-history-evidence-tree',j=>j.history[0].evidence_url=
    'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/tree/main'],
  ['mutable-model-validation-record',j=>j.builds[0].models.elite.validation_record=
    'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/tree/main'],
  ['mutable-physical-report',j=>{j.builds[0].models.elite.device_verified=true;
    j.builds[0].hardware_tested=true;
    j.builds[0].models.elite.physical_evidence={
      report_sha256:'a'.repeat(64),
      report_url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/tree/main',
      controller_sha256:'b'.repeat(64)};
  }],
  ['forged-physical-report-on-untested-model',j=>j.builds[0].models.elite.physical_evidence={
    report_sha256:'bogus',controller_sha256:'bogus',
    report_url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/tree/main',
    owner_publication_approved:'approved'}],
  ['nonbuilt-source-forges-QA-live-device-status',j=>{
    const base=j.history.find(x=>x.status==='build-succeeded-unreviewed').build_pipeline;
    j.history.find(x=>x.status==='source-only').build_pipeline={
      ...base,qa:'QA_PASSED',live_http:'LIVE_HTTP_VERIFIED',
      installability:'READY_FOR_FLASH',hardware:'DEVICE_VERIFIED'};
  }],
  ['source-only-cannot-borrow-even-truthful-unreviewed-build-pipeline',j=>
    j.history.find(x=>x.status==='source-only').build_pipeline=
      {...j.history.find(x=>x.status==='build-succeeded-unreviewed').build_pipeline}],
  ['unapproved-artifact-link-in-new-repaired-history',j=>
    j.history.find(x=>x.id==='producer-pr93-repaired-native-20261024').artifact_url=
      'https://example.net/unreviewed-image.dat']
])run(label,edit(mutate));


 // Permanent negative fixtures reproducing independent Main Merger's 9040bd1
 // eight exact-source fail-open data-integrity findings; no firmware download.
for(const [name,fn] of [
 ['top-source-commit-mutable',j=>j.source.commit='main'],
 ['top-source-commit-null',j=>j.source.commit=null],
 ['top-source-commit-number',j=>j.source.commit=18],
 ['history-firmware-subtree-mutable',j=>j.history.find(x=>x.firmware_subtree).firmware_subtree='main'],
 ['historical-model-package-sha-invalid',j=>j.history.find(x=>x.reported_package_sha256).reported_package_sha256.elite='not-a-SHA256'],
 ['failed-model-exit-status-string',j=>j.history.find(x=>x.failed_build).failed_build.elite.exit_code='1'],
 ['failed-controller-sha-invalid',j=>j.history.find(x=>x.failed_build).failed_build.controller.sha256='not-a-SHA256'],
 ['failed-controller-crc-invalid',j=>j.history.find(x=>x.failed_build).failed_build.controller.crc32='not-a-CRC'],
 ['failed-pool-accounting-corruption',j=>j.history.find(x=>x.failed_build).failed_build.pool_used_bytes+=1],
 ['offline-controller-crc-invalid',j=>j.history.find(x=>x.reported_offline_artifacts).reported_offline_artifacts.controller.crc32='not-a-CRC'],
 ['producer-Elite-hash-invalid',j=>j.history.find(x=>x.producer_reported_artifacts).producer_reported_artifacts.elite.sha256='not-a-SHA256'],
 ['producer-Pro-product-swapped',j=>j.history.find(x=>x.producer_reported_artifacts).producer_reported_artifacts.pro.product='SMK-37 Elite_900'],
 ['producer-private-controller-crc-invalid',j=>j.history.find(x=>x.producer_reported_artifacts).producer_reported_artifacts.private_controller.crc32='not-a-CRC'],
 ['PR103-download-hidden-any-extension',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').download_url='https://example.net/unapproved.bin'],
 ['PR103-firmware-subtree-not-a-SHA',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').firmware_subtree='main'],
 ['PR103-cross-history-duplicate',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').id=j.history[0].id],
]) run(name,edit(fn));
run('PR103-independent-build-receipt-stays-noninstallable',edit(j=>{
  const b=j.history.find(x=>x.id==='integration-pr103-model-builds-20261024');
  assert.ok(b,'source/evidence history must include the actual model builder receipt');
  assert.equal(b.status,'evidence-only');
  assert.equal(b.installable,false);
}),true);

// Newly consumed restore-skip QA stays read-only and cannot certify PR103 binaries.
run('PR96-new-current-source-stays-noninstallable',edit(j=>{
 const x=j.history.find(x=>x.id==='data-safety-pr96-restoration-status-20261024');
 assert.ok(x);
 assert.equal(x.source_commit,'577d24aebd51db42adb551d79315ac546f884e12');
 assert.equal(x.status,'source-only');
 assert.equal(x.installable,false);
}),true);
run('PR96-current-history-rejects-private-download',edit(j=>
 j.history.find(x=>x.id==='data-safety-pr96-restoration-status-20261024').download_url='https://invalid.example/firmware.v1'));
run('PR96-current-history-rejects-device-PASS',edit(j=>
 j.history.find(x=>x.id==='data-safety-pr96-restoration-status-20261024').device_verified=true));
run('PR103-private-rehash-does-not-make-installable',edit(j=>
 j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').installable=true));


run('PR103-real-private-byte-audit-stays-noninstallable',edit(j=>{
  const x=j.history.find(x=>x.id==='integration-pr103-model-builds-20261024');
  assert.equal(x.artifact_bytes_independently_verified,true);
  assert.equal(x.build_target_tests_independently_reexecuted,false);
  assert.equal(x.installable,false);
}),true);
for(const [name,change] of [
  ['PR64-no-distribution-approval',j=>j.history.find(x=>x.id==='native-build-probe-historical-pr64').artifact_distribution_approved=true],
  ['PR64-no-string-approval',j=>j.history.find(x=>x.id==='native-build-probe-historical-pr64').artifact_distribution_approved='true'],
  ['PR64-no-exact-remote-claim',j=>j.history.find(x=>x.id==='native-build-probe-historical-pr64').exact_remote_native_build=true],
  ['PR64-no-string-remote-claim',j=>j.history.find(x=>x.id==='native-build-probe-historical-pr64').exact_remote_native_build='true'],
  ['PR84-no-independent-QA-claim',j=>j.history.find(x=>x.id==='native-elite-pro-current-firmware-subtree-pr84').build_target_tests_independently_reexecuted=true],
  ['PR103-no-independent-QA-claim',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').build_target_tests_independently_reexecuted=true],
  ['PR103-byte-proof-not-string',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').artifact_bytes_independently_verified='true'],
  ['PR103-byte-proof-not-null',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').artifact_bytes_independently_verified=null],
  ['PR84-no-unattributed-byte-proof',j=>j.history.find(x=>x.id==='native-elite-pro-current-firmware-subtree-pr84').artifact_bytes_independently_verified=true],
  ['PR103-byte-hash-must-match-audit',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').producer_reported_artifacts.elite.sha256='f'.repeat(64)],
  ['PR103-source-identity-must-match-audit',j=>j.history.find(x=>x.id==='integration-pr103-model-builds-20261024').source_commit='f'.repeat(40)],
  ['new-history-no-unattributed-target-QA',j=>j.history[0].build_target_tests_independently_reexecuted=true]
])run(name,edit(change));
run('PR103-audit-exit-cannot-be-forged',dir=>{
  const p=join(dir,'docs/scheduler-handoffs/catalog-sync-20261024.json');
  const e=JSON.parse(fs.readFileSync(p,'utf8'));
  e.closed_loop_cycle_20261024_r4.catalog_private_zip.exit_code=1;
  fs.writeFileSync(p,JSON.stringify(e,null,2)+'\n');
});
run('PR103-audit-hash-must-match-receipt',dir=>{
  const p=join(dir,'docs/scheduler-handoffs/catalog-sync-20261024.json');
  const e=JSON.parse(fs.readFileSync(p,'utf8'));
  e.closed_loop_cycle_20261024_r4.catalog_private_zip.sha256.elite='f'.repeat(64);
  fs.writeFileSync(p,JSON.stringify(e,null,2)+'\n');
});
run('PR96-new-source-repair-stays-read-only',edit(j=>{
  const x=j.history.find(x=>x.id==='data-safety-pr96-restoration-repaired-20261024');
  assert.ok(x,'current source repair record required');
  assert.equal(x.status,'validation-evidence-only');
  assert.equal(x.installable,false);
  assert.equal(x.source_commit,'74f18fe19a95cb885280a373cb0dd9d53500c193');
}),true);
run('PR96-new-repair-no-hardware-PASS',edit(j=>
  j.history.find(x=>x.id==='data-safety-pr96-restoration-repaired-20261024').device_verified=true));
run('PR96-new-repair-no-download',edit(j=>
  j.history.find(x=>x.id==='data-safety-pr96-restoration-repaired-20261024').download_url='https://evil.invalid/download.fwsc'));


 // OTA-loader producer and combined current-source IDs stay evidence-only.
run('PR104-source-window-not-device',edit(j=>{
 const x=j.history.find(x=>x.id==='data-safety-pr104-loader-guard-20261024');
 assert.ok(x); assert.equal(x.status,'validation-evidence-only');
 assert.equal(x.installable,false); assert.equal(x.device_verified,false);
 assert.notEqual(x.source_tree,x.firmware_subtree);
}),true);
run('PR103-latest-combined-not-new-build',edit(j=>{
 const x=j.history.find(x=>x.id==='integration-pr103-303-data-safety-loader-20261024');
 assert.ok(x); assert.equal(x.status,'source-only'); assert.equal(x.installable,false);
 assert.notEqual(x.source_tree,x.firmware_subtree);
}),true);
for(const [name,mutate] of [
 ['PR104-hidden-download-any-extension',j=>j.history.find(x=>x.id==='data-safety-pr104-loader-guard-20261024').download_url='https://example.net/not-firmware.txt'],
 ['PR103-hidden-picker-any-extension',j=>j.history.find(x=>x.id==='integration-pr103-303-data-safety-loader-20261024').picker_url='https://example.net/archive.dat'],
 ['PR104-forged-device-PASS',j=>j.history.find(x=>x.id==='data-safety-pr104-loader-guard-20261024').device_verified=true],
 ['PR103-fake-independent-byte-claim',j=>j.history.find(x=>x.id==='integration-pr103-303-data-safety-loader-20261024').artifact_bytes_independently_verified=true],
 ['PR104-invalid-firmware-subtree',j=>j.history.find(x=>x.id==='data-safety-pr104-loader-guard-20261024').firmware_subtree='main'],
 ['PR103-unapproved-QA-promote',j=>j.history.find(x=>x.id==='integration-pr103-303-data-safety-loader-20261024').build_pipeline={
   build:'BUILD_SUCCEEDED_UNREVIEWED',qa:'QA_PASSED',installability:'READY_FOR_FLASH',
   live_http:'VERIFIED',hardware:'DEVICE_VERIFIED',source_scope:'FULL_ROOT'
 }]
])run(name,edit(mutate));
// Keep the source-only picker empty AND lock all approved top-level/provenance fields.
// Mutate both copies so source/generated equality alone cannot mask a forged catalog.
const editPickerCopies = mutate => dir => {
  const p = join(dir, 'preview-catalog.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  mutate(data);
  const same = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(p, same);
  fs.writeFileSync(join(dir, 'docs/versions.json'), same);
};
run('picker-canonical-empty-positive', editPickerCopies(()=>{}), true);
for (const [label, mutation] of [
  ['picker-hidden-downloads-array', p => p.downloads=[{model:'elite',url:'https://untrusted.invalid/fwsc'}]],
  ['picker-hidden-nested-package-link', p => p.package={download_url:'https://untrusted.invalid/firmware'}],
  ['picker-hidden-approval', p => p.distribution_approved=true],
  ['picker-forged-repository', p => p.repo='https://untrusted.invalid/owner'],
  ['picker-forged-pages-host', p => p.pages='https://untrusted.invalid/installer'],
  ['picker-unsupported-schema', p => p.schema=999],
  ['picker-extra-nonbinary-url', p => p.metadata_url='https://untrusted.invalid/readme.txt'],
  ['picker-forged-repo-non-url', p => p.repo='gobbajogger/X0X37-for-Loopy-Pro'],
]) run(label, editPickerCopies(mutation));
const r16id='integration-pr103-r10-native-elite-pro-20261024';
const r16mutate=fn=>edit(j=>{const rec=j.history.find(h=>h.id===r16id);assert.ok(rec);fn(rec);});
run('r16-valid-readonly-rehash-without-qa-or-host',edit(j=>{
  const r=j.history.find(h=>h.id===r16id);assert.ok(r);
  assert.equal(r.status,'build-succeeded-unreviewed');assert.equal(r.build_pipeline.qa,'QA_PENDING');
  assert.equal(r.build_pipeline.live_http,'NOT_VERIFIED');assert.equal(r.installable,false);
}),true);
for(const [name,fn] of [
  ['r16-elite-sha-forgery',r=>r.producer_reported_artifacts.elite.sha256='f'.repeat(64)],
  ['r16-pro-model-forgery',r=>r.producer_reported_artifacts.pro.product='SMK-37 Elite_900'],
  ['r16-source-root-forgery',r=>r.source_tree='f'.repeat(40)],
  ['r16-firmware-subtree-forgery',r=>r.firmware_subtree='f'.repeat(40)],
  ['r16-qa-forgery',r=>r.build_pipeline.qa='QA_PASSED'],
  ['r16-http-forgery',r=>r.build_pipeline.live_http='LIVE_HTTP_VERIFIED'],
  ['r16-controller-redistribution-forgery',r=>r.producer_reported_artifacts.private_controller.redistribution_permitted=true],
  ['r16-hidden-artifact-url',r=>r.download_url='https://invalid.example/bin'],
  ['r16-invented-test-failure',r=>r.build_pipeline.followup_native_checks_fail=[{name:'fake',exit_code:0}]],
]) run(name,r16mutate(fn));
for(const [name,fn] of [
  ['r16-archive-receipt-forgery',x=>x.private_zip_sha256='f'.repeat(64)],
  ['r16-controller-member-forgery',x=>x.controller.bytes_present_in_r10_zip=true],
  ['r16-negative-test-count-forgery',x=>x.negative_checks_pass=0],
]){
  run(name,dir=>{
    const p=join(dir,'docs/scheduler-handoffs/catalog-sync-20261024.json');
    const j=JSON.parse(fs.readFileSync(p,'utf8'));fn(j.closed_loop_cycle_20261024_r16.catalog_private_zip);
    fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
  });
}

run('r16-immutable-five-audit-proof-fields-positive',dir=>{
 const x=JSON.parse(fs.readFileSync(join(dir,'docs/scheduler-handoffs/catalog-sync-20261024.json'),'utf8')).closed_loop_cycle_20261024_r16.catalog_private_zip;
 assert.equal(x.checker_sha256,'76947801c5516442d44f4f345884faa1b5e595f116a33086207f23ec67aa4ac9');
 assert.equal(x.log_sha256,'c62a5451d68161bca3a73bfc622dd6bfce62399578492589d7b49800160f0fe7');
 assert.equal(x.results_sha256,'51a46a8b7b45647cdd2f1d7c305feff6f52b4c07038e3b79fb629267859aaff9');
 assert.equal(x.models.elite.crc32,'96808fe7');assert.equal(x.models.pro.crc32,'3cc9dfeb');
},true);
for(const [name,mutation] of [
 ['r16-forged-checker-digest',x=>x.checker_sha256='f'.repeat(64)],
 ['r16-forged-log-digest',x=>x.log_sha256='f'.repeat(64)],
 ['r16-forged-results-digest',x=>x.results_sha256='f'.repeat(64)],
 ['r16-forged-Elite-CRC32',x=>x.models.elite.crc32='00000000'],
 ['r16-forged-Pro-CRC32',x=>x.models.pro.crc32='00000000']
])run(name,dir=>{
 const p=join(dir,'docs/scheduler-handoffs/catalog-sync-20261024.json');
 const j=JSON.parse(fs.readFileSync(p,'utf8'));mutation(j.closed_loop_cycle_20261024_r16.catalog_private_zip);
 fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
});
const r14x='integration-pr103-r14-native-elite-pro-20261024';
const editR14=fn=>edit(j=>{const x=j.history.find(r=>r.id===r14x);assert.ok(x);fn(x);});
run('r14-genuine-build-only-history-positive',edit(j=>{
 const x=j.history.find(r=>r.id===r14x);assert.ok(x);assert.equal(x.status,'build-succeeded-unreviewed');
 assert.equal(x.installable,false);assert.equal(x.build_pipeline.qa,'QA_PENDING');
 assert.equal(x.build_pipeline.live_http,'NOT_VERIFIED');
}),true);
for(const [name,mutation] of [
 ['r14-invalid-Elite-SHA',x=>x.producer_reported_artifacts.elite.sha256='f'.repeat(64)],
 ['r14-invalid-Pro-SHA',x=>x.producer_reported_artifacts.pro.sha256='f'.repeat(64)],
 ['r14-invalid-Pro-bytes',x=>x.producer_reported_artifacts.pro.bytes++],
 ['r14-wrong-compiled-tree',x=>x.firmware_subtree='f'.repeat(40)],
 ['r14-wrong-full-root',x=>x.source_tree='f'.repeat(40)],
 ['r14-wrong-private-controller',x=>x.producer_reported_artifacts.private_controller.sha256='f'.repeat(64)],
 ['r14-wrong-immutable-proof',x=>x.build_pipeline.evidence_manifest_blob_sha='f'.repeat(40)],
 ['r14-fake-QA-PASS',x=>x.build_pipeline.qa='QA_PASSED'],
 ['r14-fake-external-HTTP',x=>x.build_pipeline.live_http='HTTP_VERIFIED'],
 ['r14-unapproved-download',x=>x.download_url='https://evil.example/unknown.dat']
])run(name,editR14(mutation));
run('r16-combined-source-noninstallable-positive',edit(j=>{
 const x=j.history.find(r=>r.id==='integration-pr103-r16-pr110-integrated-current-20261024');
 assert.ok(x);assert.equal(x.status,'source-only');assert.equal(x.installable,false);
}),true);
run('r16-wrong-merged-root',edit(j=>j.history.find(r=>r.id==='integration-pr103-r16-pr110-integrated-current-20261024').source_tree='f'.repeat(40)));

console.log('PASS: status-history allowlist and malicious-nesting fixtures; no firmware artifacts');

// Exact SMC79 real native private-byte receipt must remain QA_PENDING and non-installable.
const checkedNativeId='integration-pr103-smc79-native-build-20261024-r13';
const mutateNative=fn=>edit(j=>{const row=j.history.find(h=>h.id===checkedNativeId);assert.ok(row);fn(row);});
run('smc79-genuine-native-build-record',()=>{},true);
run('smc79-forged-elite-hash',mutateNative(r=>r.producer_reported_artifacts.elite.sha256='a'.repeat(64)));
run('smc79-forged-pro-size',mutateNative(r=>r.producer_reported_artifacts.pro.bytes++));
run('smc79-forged-ctl-hash',mutateNative(r=>r.producer_reported_artifacts.private_controller.sha256='b'.repeat(64)));
run('smc79-forged-complete-root',mutateNative(r=>r.source_tree='f'.repeat(40)));
run('smc79-forged-compiled-subtree',mutateNative(r=>r.firmware_subtree='e'.repeat(40)));
run('smc79-forged-immutable-proof',mutateNative(r=>r.build_pipeline.evidence_manifest_blob_sha='f'.repeat(40)));
run('smc79-fake-full-QA-PASS',mutateNative(r=>r.build_pipeline.qa='QA_PASS'));
run('smc79-fake-HTTP-PASS',mutateNative(r=>r.build_pipeline.live_http='HTTP_VERIFIED'));
run('smc79-false-audit-state',mutateNative(r=>r.artifact_bytes_independently_verified=false));
run('smc79-invented-historical-test-exit',mutateNative(r=>r.build_pipeline.followup_native_checks_fail[0].exit_code=1));
run('smc79-hidden-historical-test-failure',mutateNative(r=>r.build_pipeline.followup_native_checks_fail.pop()));


const auditedR25='producer-pr120-fresh-elite-pro-controller-20261024',sourceR25='integration-pr103-r22-current-smc-host-harness-20261024';
const editAuditedR25=fn=>edit(j=>{const x=j.history.find(r=>r.id===auditedR25);assert.ok(x);fn(x);});
run('r25-two-new-noninstallable-history-records-positive',edit(j=>{
  assert.equal(j.history[115].id,sourceR25);assert.equal(j.history[116].id,auditedR25);
  assert.ok(j.history.length>=117);assert.equal(j.builds.length,2);
  assert.equal(j.history[116].installable,false);
  assert.equal(j.history[116].build_pipeline.qa,'QA_PENDING');
  assert.equal(j.history[116].build_pipeline.live_http,'NOT_VERIFIED');
}),true);
run('r25-delete-real-PR120-receipt-adjust-count',edit(j=>{j.history.splice(116,1);j.counts.source_or_historical_checkpoints--;}));
run('r25-delete-both-old-tail-receipts-adjust-count',edit(j=>{j.history.splice(115,2);j.counts.source_or_historical_checkpoints-=2;}));
run('r25-swap-new-source-and-private-build-receipts',edit(j=>{
  [j.history[115],j.history[116]]=[j.history[116],j.history[115]];
}));
for(const [name,mutation] of [
 ['r25-forged-Elite-package-SHA-valid-shape',x=>x.producer_reported_artifacts.elite.sha256='f'.repeat(64)],
 ['r25-forged-Pro-package-SHA-valid-shape',x=>x.producer_reported_artifacts.pro.sha256='f'.repeat(64)],
 ['r25-forged-private-controller-SHA',x=>x.producer_reported_artifacts.private_controller.sha256='f'.repeat(64)],
 ['r25-forged-private-controller-CRC',x=>x.producer_reported_artifacts.private_controller.crc32='00000000'],
 ['r25-forged-package-model',x=>x.producer_reported_artifacts.elite.product='SMK-37 Pro_900'],
 ['r25-forged-root-SHA-valid-shape',x=>x.source_tree='f'.repeat(40)],
 ['r25-forged-firmware-tree-SHA-valid-shape',x=>x.firmware_subtree='f'.repeat(40)],
 ['r25-forged-QA-PASS',x=>x.build_pipeline.qa='QA_PASSED'],
 ['r25-forged-public-HTTP',x=>x.build_pipeline.live_http='LIVE_HTTP_VERIFIED'],
 ['r25-hidden-unapproved-download',x=>x.download_url='https://untrusted.invalid/package']
])run(name,editAuditedR25(mutation));
for(const [name,mutate] of [
 ['r25-audit-forged-ZIP-SHA',x=>x.archive_sha256='f'.repeat(64)],
 ['r25-audit-forged-controller-CRC',x=>x.artifacts.private_controller.crc32='00000000'],
 ['r25-audit-false-distribution',x=>x.distribution_approved=true],
 ['r25-audit-false-independent-QA',x=>x.independent_site_QA='PASSED']
])run(name,dir=>{
  const p=join(dir,'docs/scheduler-handoffs/catalog-sync-20261024-r25.json');
  const data=JSON.parse(fs.readFileSync(p,'utf8'));
  mutate(data.pr120_private_byte_audit);
  fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');
});

// Preserve Catalog R26's receipt-specific negatives across later append-only rows.
const smcR26='smc-pr122-r2-mmc-stop-project-reset-source-20261024';
const bfR26='bugfinder-bf020-pr123-legacy-bd-pan-motion-20261024';
const tamperR26=(id,mutation)=>edit(j=>{
  const row=j.history.find(h=>h.id===id);
  assert.ok(row);
  mutation(row);
});
run('r26-pinned-119-noninstallable-prefix-positive',edit(j=>{
  assert.ok(j.history.length>=119);
  assert.equal(j.history[117].id,smcR26);
  assert.equal(j.history[118].id,bfR26);
  assert.deepEqual(j.history.slice(117,119).map(h=>h.installable),[false,false]);
  assert.deepEqual(j.history.slice(117,119).map(h=>h.status),['source-only','source-only']);
  assert.equal(j.counts.actual_build_generations,2);
  assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
}),true);
run('r26-delete-SMC-PR122-receipt-adjust-count',edit(j=>{j.history.splice(117,1);j.counts.source_or_historical_checkpoints--;}));
run('r26-delete-BF020-PR123-receipt-adjust-count',edit(j=>{j.history.splice(118,1);j.counts.source_or_historical_checkpoints--;}));
run('r26-delete-both-new-real-receipts-adjust-count',edit(j=>{j.history.splice(117,2);j.counts.source_or_historical_checkpoints-=2;}));
run('r26-swap-new-real-receipts',edit(j=>{[j.history[117],j.history[118]]=[j.history[118],j.history[117]];}));
run('r26-forge-SMC-source-SHA-valid-shape',tamperR26(smcR26,x=>{x.source_commit='f'.repeat(40);}));
run('r26-forge-BF020-compiled-subtree-SHA-valid-shape',tamperR26(bfR26,x=>{x.firmware_subtree='e'.repeat(40);}));
run('r26-forge-SMC-nondevice-QA-PASS',tamperR26(smcR26,x=>{x.status='dev-checked';}));
run('r26-forge-BF020-device-proof',tamperR26(bfR26,x=>{x.device_verified=true;}));
run('r26-add-hidden-download-HREF',tamperR26(smcR26,x=>{x.download_url='https://evil.example/firmware';}));
run('r26-false-exact-native-compile',tamperR26(bfR26,x=>{x.exact_remote_native_build=true;}));

// Retain R5's explicit synthetic append helpers; do not clone an audited tail.
// The synthetic FUTURE append has an explicit immutable evidence URL; the current
// R25 tail is a different receipt and must not supply the positive test's pin.
const futureEvidenceSha='1'.repeat(40);
const appendEvidenceCommit=commit=>edit(j=>{
  j.history.push({
    id:'future-synthetic-evidence-commit-append-test',
    title:'Synthetic future source receipt',date:'2026-10-25',status:'source-only',models:['pro'],
    source_repo:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro',
    source_commit:futureEvidenceSha,source_tree:'2'.repeat(40),
    device_verified:false,installable:false,evidence_commit:commit,
    evidence_url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/commit/'+futureEvidenceSha,
    description:'Synthetic future noninstallable source evidence'
  });
  j.counts.source_or_historical_checkpoints=j.history.length;
});
run('future-evidence-commit-valid-pinned-append-PASS',appendEvidenceCommit(futureEvidenceSha),true);
run('future-evidence-commit-mutable-main-REJECTED',appendEvidenceCommit('main'));
run('future-evidence-commit-40hex-mismatched-url-REJECTED',appendEvidenceCommit('f'.repeat(40)));
run('future-evidence-commit-object-REJECTED',appendEvidenceCommit({ref:'main'}));


// R28: the pinned Git reference is the SHA after /blob/, /tree/ or /commit/.
// Never accept an evidence_commit that appears only in a later pathname.
const r28AppendEvidence=(route,gitRef,suffix,reportedCommit)=>edit(j=>{
  // Use an explicit future source-only row: R25's audit tail has its own
  // fixed attribution and must not become a synthetic route fixture.
  const next={
    id:'future-synthetic-r28-evidence-route-test',
    title:'Synthetic future source receipt',date:'2026-10-25',status:'source-only',models:['pro'],
    source_repo:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro',
    source_commit:futureEvidenceSha,source_tree:'2'.repeat(40),
    evidence_commit:reportedCommit,description:'Synthetic future noninstallable source evidence'
  };
  next.evidence_url='https://github.com/gobbajogger/X0X37-for-Loopy-Pro/'+route+'/'+gitRef+suffix;
  next.installable=false;
  next.device_verified=false;
  j.history.push(next);
  j.counts.source_or_historical_checkpoints=j.history.length;
});
const r28FalseRef='a'.repeat(40), r28Claim='f'.repeat(40);
run('r28-legitimate-pinned-blob-append-PASS',
  r28AppendEvidence('blob',r28Claim,'/docs/receipt.json',r28Claim),true);
run('r28-legitimate-pinned-tree-append-PASS',
  r28AppendEvidence('tree',r28Claim,'/docs/receipt.json',r28Claim),true);
run('r28-legitimate-pinned-commit-append-PASS',
  r28AppendEvidence('commit',r28Claim,'',r28Claim),true);
run('r28-blob-path-contains-claimed-SHA-but-Git-ref-differs-REJECTED',
  r28AppendEvidence('blob',r28FalseRef,'/docs/'+r28Claim+'/receipt.json',r28Claim));
run('r28-tree-path-contains-claimed-SHA-but-Git-ref-differs-REJECTED',
  r28AppendEvidence('tree',r28FalseRef,'/'+r28Claim+'/receipt.json',r28Claim));

run('r28-mutable-blob-ref-with-claimed-SHA-in-path-REJECTED',
  r28AppendEvidence('blob','main','/docs/'+r28Claim+'/receipt.json',r28Claim));


// The protected firmware NIGHTLY source merge is append-only history;
// it is not a new flashable build, a physical PASS, or distribution approval.
const r30Id='integration-pr103-firmware-nightly-merged-browser-route-20261024';
const editR30=fn=>edit(j=>{
  const row=j.history.find(entry=>entry.id===r30Id);
  assert.ok(row,'R30 merged source record must exist');
  fn(row,j);
});
run('r30-real-noninstallable-merged-source-history-positive',editR30((row,j)=>{
  assert.equal(j.history[122].id,r30Id);
  assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
  assert.equal(row.status,'validation-evidence-only');
  assert.equal(row.source_commit,'54f2ffbc3124f7449a69067dc8215a2d91a2e675');
  assert.equal(row.source_tree,'3b5cadafba33f4c1b116660bc9d19a27a892337c');
  assert.equal(row.firmware_subtree,'5c209609b770fd13949230aeb80956594fd6b741');
  assert.equal(row.installable,false);
  assert.equal(row.device_verified,false);
  assert.equal(row.artifact_distribution_approved,false);
}),true);
run('r30-delete-merge-receipt-and-adjust-count-REJECT',editR30((row,j)=>{
  j.history.splice(122,1);j.counts.source_or_historical_checkpoints--;
}));
run('r30-forge-merged-source-SHA-REJECT',editR30(row=>{row.source_commit='f'.repeat(40);}));
run('r30-forge-compiled-subtree-REJECT',editR30(row=>{row.firmware_subtree='f'.repeat(40);}));
run('r30-claim-downloadable-package-REJECT',editR30(row=>{row.installable=true;}));
run('r30-claim-hardware-PASS-REJECT',editR30(row=>{row.device_verified=true;}));
run('r30-claim-distribution-approved-REJECT',editR30(row=>{row.artifact_distribution_approved=true;}));
run('r30-claim-new-native-build-REJECT',editR30(row=>{row.status='dev-checked';}));

// R33: real shipping verifier must fail closed on falsely qualified Pages Git metadata.
const r33Id='nightly-pages-git-dev-candidate-54f2ffbc-20261024';
const editR33=fn=>edit(j=>{const row=j.history.find(x=>x.id===r33Id);assert.ok(row);fn(row,j);});
run('r33-pages-Git-declaration-nonflashable-positive',editR33((row,j)=>{
  assert.equal(j.history[123].id,r33Id);
  assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
  assert.equal(row.status,'validation-evidence-only');
  assert.equal(row.source_commit,'54f2ffbc3124f7449a69067dc8215a2d91a2e675');
  assert.equal(row.firmware_subtree,'5c209609b770fd13949230aeb80956594fd6b741');
  assert.equal(row.installable,false);
  assert.equal(row.device_verified,false);
  assert.equal(row.artifact_distribution_approved,false);
  assert.match(row.source_identity_note,/b7af05f00a91056ca732b21cbe1dc719edbcb585/);
}),true);
run('r33-delete-pages-evidence-REJECT',editR33((row,j)=>{j.history.splice(123,1);j.counts.source_or_historical_checkpoints--;}));
run('r33-pages-Git-SHA-forgery-REJECT',editR33(row=>{row.source_identity_note=row.source_identity_note.replace('b7af05f00a91056ca732b21cbe1dc719edbcb585','f'.repeat(40));}));
run('r33-unapproved-firmware-link-REJECT',editR33(row=>{row.download_url='https://evil.invalid/package';}));
run('r33-fake-source-download-admission-REJECT',editR33(row=>{row.installable=true;}));
run('r33-fake-device-PASS-REJECT',editR33(row=>{row.device_verified=true;}));
run('r33-fake-distribution-approval-REJECT',editR33(row=>{row.artifact_distribution_approved=true;}));



// R35: fail closed on native CLI failure disguised as firmware/browser eligibility.
const r35Id='data-safety-pr114-r18-native-extract-fdopen-needs-changes-20261025';
const editR35=fn=>edit(j=>{const row=j.history[124];assert.equal(row.id,r35Id);fn(row,j);});
run('r35-native-independent-qa-failure-safely-recorded',editR35((row,j)=>{
  assert.ok(j.counts.source_or_historical_checkpoints >= 125);
  assert.equal(row.status,'source-only');
  assert.equal(row.installable,false);
  assert.equal(row.device_verified,false);
  assert.equal(row.artifact_distribution_approved,false);
  assert.equal(row.exact_remote_native_build,false);
  assert.match(row.reported_checks.result,/NEEDS CHANGES/);
  assert.match(row.reported_checks.command,/exit 1, 5\/6/);
}),true);
run('r35-failed-native-test-concealed-REJECT',editR35(row=>row.reported_checks.result='PASS'));
run('r35-unqualified-download-REJECT',editR35(row=>row.installable=true));
run('r35-false-device-approval-REJECT',editR35(row=>row.device_verified=true));
run('r35-false-distribution-approval-REJECT',editR35(row=>row.artifact_distribution_approved=true));
run('r35-artifact-link-smuggling-REJECT',editR35(row=>row.pkg='https://invalid.example/fw.fwsc'));
run('r35-status-forged-success-REJECT',editR35(row=>row.status='dev-checked'));
run('r35-history-tail-deleted-REJECT',editR35((row,j)=>{j.history.splice(124,1);j.counts.source_or_historical_checkpoints--;}));

 
// R36: a reporter-characterized unsafe Pages Git catalog must remain nonflashable evidence.
const r36Id='nightly-pages-git-unqualified-dev-admission-20261025';
const editR36=fn=>edit(j=>{const row=j.history[125];assert.equal(row.id,r36Id);fn(row,j);});
run('r36-pages-unqualified-source-warning-retained',editR36((row,j)=>{
  assert.ok(j.counts.source_or_historical_checkpoints >= 126);
  assert.equal(row.status,'validation-evidence-only');
  assert.equal(row.source_commit,'b7af05f00a91056ca732b21cbe1dc719edbcb585');
  assert.equal(row.source_tree,'9e192c467973368c407cf148099e35c6280b2eae');
  assert.equal(row.installable,false);
  assert.equal(row.device_verified,false);
  assert.equal(row.artifact_distribution_approved,false);
  assert.equal(row.artifact_bytes_independently_verified,false);
  assert.match(row.reported_checks.result,/UNSAFE CATALOG ADMISSION OBSERVED/);
}),true);
run('r36-unsafe-admission-history-deleted-REJECT',editR36((row,j)=>{j.history.splice(125,1);j.counts.source_or_historical_checkpoints--;}));
run('r36-unsafe-admission-relabeled-to-PASS-REJECT',editR36(row=>{row.reported_checks.result='PASS';}));
run('r36-fake-download-grant-REJECT',editR36(row=>{row.installable=true;}));
run('r36-fake-device-PASS-REJECT',editR36(row=>{row.device_verified=true;}));
run('r36-fake-distribution-grant-REJECT',editR36(row=>{row.artifact_distribution_approved=true;}));
run('r36-fake-verified-package-bytes-REJECT',editR36(row=>{row.artifact_bytes_independently_verified=true;}));
run('r36-pages-commit-forged-REJECT',editR36(row=>{row.source_commit='f'.repeat(40);}));

// R37: source-only proposed catalog approval repair is not independent firmware/Pages acceptance.
const r37Id='nightly-browser-pr14-catalog-approval-denials-source-20261025';
const editR37=fn=>edit(j=>{const row=j.history[126];assert.equal(row.id,r37Id);fn(row,j);});
run('r37-source-only-proposed-repair',editR37((row,j)=>{
 assert.ok(j.counts.source_or_historical_checkpoints >= 127);
 assert.equal(row.source_commit,'7515d147e4817248dece608c73fd7fb171e996f2');
 assert.equal(row.source_tree,'7db90a3810f790d3b939b4cdc34a768ff6e9200a');
 assert.equal(row.status,'source-only');
 assert.equal(row.installable,false);
 assert.equal(row.device_verified,false);
 assert.equal(row.artifact_distribution_approved,false);
 assert.equal(row.artifact_bytes_independently_verified,false);
 assert.match(row.reported_checks.result,/INDEPENDENT WEBSITE QA PENDING/);
}),true);
run('r37-tail-deletion-REJECT',editR37((row,j)=>{j.history.splice(126,1);j.counts.source_or_historical_checkpoints--;}));
run('r37-forged-source-REJECT',editR37(row=>row.source_commit='f'.repeat(40)));
run('r37-forged-root-REJECT',editR37(row=>row.source_tree='f'.repeat(40)));
run('r37-fabricated-site-QA-PASS-REJECT',editR37(row=>row.reported_checks.result='INDEPENDENT WEBSITE QA PASS'));
run('r37-forged-download-REJECT',editR37(row=>row.installable=true));
run('r37-forged-hardware-PASS-REJECT',editR37(row=>row.device_verified=true));
run('r37-forged-rights-PASS-REJECT',editR37(row=>row.artifact_distribution_approved=true));
run('r37-forged-verified-bytes-REJECT',editR37(row=>row.artifact_bytes_independently_verified=true));

// R39: source-specific independent QA is not full-root installer or firmware approval.
const r39Id='nightly-browser-pr14-r2-hardware-facts-independent-scoped-review-20261025';
const editR39=fn=>edit(j=>{const row=j.history[127];assert.equal(row.id,r39Id);fn(row,j);});
run('r39-independent-scope-and-no-flash',editR39((row,j)=>{
 assert.ok(j.counts.source_or_historical_checkpoints>=128);
 assert.equal(row.source_commit,'593c0fc3c18200fd887373bff4602bfd322f0d54');
 assert.equal(row.source_tree,'e1255056dff9ebdcb2d1836e6e139dfa506f8995');
 assert.equal(row.status,'validation-evidence-only');
 assert.deepEqual(row.models,['elite','pro']);
 assert.equal(row.installable,false);assert.equal(row.device_verified,false);
 assert.equal(row.artifact_distribution_approved,false);assert.equal(row.artifact_bytes_independently_verified,false);
 assert.match(row.reported_checks.result,/INDEPENDENT QA SCOPED REVIEWED/);
 assert.ok(row.reported_checks.result.includes('FULL WEBSITE/BROWSER QA INCOMPLETE'));
}),true);
run('r39-history-deleted-REJECT',editR39((row,j)=>{j.history.splice(127,1);j.counts.source_or_historical_checkpoints--;}));
run('r39-false-full-QA-REJECT',editR39(row=>{row.reported_checks.result='FULL WEBSITE PASS';}));
run('r39-forged-source-REJECT',editR39(row=>{row.source_commit='f'.repeat(40);}));
run('r39-forged-root-REJECT',editR39(row=>{row.source_tree='f'.repeat(40);}));
run('r39-false-download-REJECT',editR39(row=>{row.installable=true;}));
run('r39-false-device-PASS-REJECT',editR39(row=>{row.device_verified=true;}));
run('r39-false-rights-PASS-REJECT',editR39(row=>{row.artifact_distribution_approved=true;}));
run('r39-false-served-bytes-REJECT',editR39(row=>{row.artifact_bytes_independently_verified=true;}));


// R40: source-only musical-sequencer BF031 progress is never a selectable firmware version.
const r40Id='bugfinder-bf031-pr140-tb3po-logical-bars-source-20261025';
const editR40=fn=>edit(j=>{const row=j.history[128];assert.equal(row.id,r40Id);fn(row,j);});
run('r40-BF031-source-only-and-no-flash',editR40((row,j)=>{
 assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
 assert.equal(row.source_commit,'a964401ec29028ab488a7586d8b54d0e24ea58ce');
 assert.equal(row.source_tree,'2a3c78247b6164d43f995e640d98b71aae933498');
 assert.equal(row.firmware_subtree,'7f35a88270c7a4c0e782d7711cfd7110fc162a23');
 assert.equal(row.status,'source-only');assert.deepEqual(row.models,[]);
 assert.equal(row.installable,false);assert.equal(row.device_verified,false);
 assert.equal(row.artifact_distribution_approved,false);assert.equal(row.exact_remote_native_build,false);
 assert.match(row.reported_checks.result,/INDEPENDENT FIRMWARE QA PENDING/);
}),true);
run('r40-delete-source-history-REJECT',editR40((row,j)=>{j.history.splice(128,1);j.counts.source_or_historical_checkpoints--;}));
run('r40-forged-source-root-REJECT',editR40(row=>row.source_tree='f'.repeat(40)));
run('r40-forged-source-commit-REJECT',editR40(row=>row.source_commit='f'.repeat(40)));
run('r40-fabricated-build-REJECT',editR40(row=>row.exact_remote_native_build=true));
run('r40-fabricated-hardware-REJECT',editR40(row=>row.device_verified=true));
run('r40-fabricated-download-REJECT',editR40(row=>row.installable=true));
run('r40-fabricated-rights-REJECT',editR40(row=>row.artifact_distribution_approved=true));


// R41: truthful status does not make either upstream event installable.
const editR41Swing=fn=>edit(j=>{const r=j.history[129];assert.equal(r.id,'bugfinder-bf031-pr140-r2-random-temporal-swing-source-20261025');fn(r,j);});
const editR41Policy=fn=>edit(j=>{const r=j.history[130];assert.equal(r.id,'nightly-pr15-qualification-gate-removal-policy-hold-20261025');fn(r,j);});
run('r41-two-events-nonflashable-PASS',edit(j=>{
 assert.ok(j.history.length>=131);assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
 assert.equal(j.builds.length,2);assert.equal(j.installable,false);
 for(const r of j.history.slice(129)){assert.equal(r.installable,false);assert.equal(r.device_verified,false);assert.equal(r.artifact_distribution_approved,false);assert.equal(r.exact_remote_native_build,false);}
}),true);
run('r41-swing-delete-REJECT',editR41Swing((r,j)=>{j.history.splice(129,1);j.counts.source_or_historical_checkpoints--;}));
run('r41-swing-source-SHA-forgery-REJECT',editR41Swing(r=>r.source_commit='f'.repeat(40)));
run('r41-swing-target-build-forgery-REJECT',editR41Swing(r=>r.exact_remote_native_build=true));
run('r41-swing-download-forgery-REJECT',editR41Swing(r=>r.installable=true));
run('r41-safety-HOLD-delete-REJECT',editR41Policy((r,j)=>{j.history.splice(130,1);j.counts.source_or_historical_checkpoints--;}));
run('r41-safety-HOLD-relabel-REJECT',editR41Policy(r=>r.reported_checks.result='FULL PASS'));
run('r41-safety-HOLD-distribution-forgery-REJECT',editR41Policy(r=>r.artifact_distribution_approved=true));
run('r41-safety-HOLD-download-forgery-REJECT',editR41Policy(r=>r.installable=true));


// R42 real source-only receipts fail closed against deleted records or forged installability.
const r42Ids=['bugfinder-bf031-pr140-r3-random-clock-handoff-source-20261025','nightly-pr142-bundled-controller-source-in-firmware-nightly-20261025','nightly-pr15-r2-upstream-proof-policy-clarification-pending-20261025'];
const editR42=(n,fn)=>edit(j=>{let r=j.history[131+n];assert.equal(r.id,r42Ids[n]);fn(r,j);});
run('r42-noninstallable-three-source-receipts-PASS',edit(j=>{
 assert.ok(j.history.length>=134);assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
 assert.equal(j.builds.length,2);assert.equal(j.installable,false);
 for(let i=0;i<3;i++){const r=j.history[131+i];assert.equal(r.id,r42Ids[i]);
 assert.deepEqual(r.models,[]);assert.equal(r.installable,false);assert.equal(r.device_verified,false);
 assert.equal(r.artifact_distribution_approved,false);assert.equal(r.exact_remote_native_build,false);}
}),true);
for(let i=0;i<3;i++){
 run('r42-deleted-'+i+'-REJECT',editR42(i,(r,j)=>{j.history.splice(131+i,1);j.counts.source_or_historical_checkpoints--;}));
 run('r42-forged-source-'+i+'-REJECT',editR42(i,r=>r.source_commit='f'.repeat(40)));
 run('r42-false-install-'+i+'-REJECT',editR42(i,r=>r.installable=true));
 run('r42-false-rights-'+i+'-REJECT',editR42(i,r=>r.artifact_distribution_approved=true));
}
run('r42-forged-compiler-REJECT',editR42(0,r=>r.firmware_subtree='f'.repeat(40)));
run('r42-forged-upstream-PASS-REJECT',editR42(2,r=>r.reported_checks.result='FULL INDEPENDENT QA PASS'));


// R43: the new proposals may never become flashable merely through history metadata.
const r43Ids=["bugfinder-bf032-pr152-tb3po-accent-preservation-source-20261025","nightly-installer-pr16-bundled-bluetooth-verifier-draft-20261025","nightly-workspace-pr17-firmware-samples-unified-draft-20261025"];
const editR43=(n,fn)=>edit(j=>{let r=j.history[134+n];assert.equal(r.id,r43Ids[n]);fn(r,j);});
run('r43-safe-noninstallable-history-PASS',edit(j=>{
 assert.ok(j.history.length>=137);assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
 assert.equal(j.builds.length,2);assert.equal(j.installable,false);
 for(let n=0;n<3;n++){let r=j.history[134+n];assert.equal(r.id,r43Ids[n]);
 assert.equal(r.installable,false);assert.equal(r.device_verified,false);assert.equal(r.artifact_distribution_approved,false);assert.equal(r.exact_remote_native_build,false);}
}),true);
for(let n=0;n<3;n++){
 run('r43-delete-'+n+'-REJECT',editR43(n,(r,j)=>{j.history.splice(134+n,1);j.counts.source_or_historical_checkpoints--;}));
 run('r43-forged-source-'+n+'-REJECT',editR43(n,r=>r.source_commit='f'.repeat(40)));
 run('r43-false-download-'+n+'-REJECT',editR43(n,r=>r.installable=true));
 run('r43-false-rights-'+n+'-REJECT',editR43(n,r=>r.artifact_distribution_approved=true));
}
run('r43-forged-compiler-REJECT',editR43(0,r=>r.firmware_subtree='f'.repeat(40)));
run('r43-forged-models-REJECT',editR43(1,r=>r.models=['pro','elite']));
run('r43-false-QA-REJECT',editR43(2,r=>r.reported_checks.result='FULL INDEPENDENT QA PASS'));


// R44 source integrations and firmware host QA never qualify firmware packages.
const r44NegativeIds=["bugfinder-bf033-pr159-random-tie-independent-host-20261025","website-main-pr14-pr16-pr17-merged-source-only-20261025"];
const editR44=(n,fn)=>edit(j=>{const i=137+n,r=j.history[i];assert.equal(r.id,r44NegativeIds[n]);fn(r,j);});
run('r44-source-only-PASS',edit(j=>{
 assert.ok(j.history.length>=139);assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);
 assert.equal(j.builds.length,2);assert.equal(j.installable,false);
 for(let n=0;n<2;n++){const r=j.history[137+n];assert.equal(r.id,r44NegativeIds[n]);
 assert.equal(r.installable,false);assert.equal(r.device_verified,false);assert.equal(r.artifact_distribution_approved,false);}
}),true);
for(let n=0;n<2;n++){
 run('r44-deleted-'+n+'-REJECT',editR44(n,(r,j)=>{j.history.splice(137+n,1);j.counts.source_or_historical_checkpoints--;}));
 run('r44-forged-source-'+n+'-REJECT',editR44(n,r=>r.source_commit='f'.repeat(40)));
 run('r44-false-install-'+n+'-REJECT',editR44(n,r=>r.installable=true));
 run('r44-false-rights-'+n+'-REJECT',editR44(n,r=>r.artifact_distribution_approved=true));
}
run('r44-forged-compiler-REJECT',editR44(0,r=>r.firmware_subtree='f'.repeat(40)));

// R46: R44 evidence remains valid when the append-only history grows.
const r46SafeIds=["firmware-f03-pr178-elite-pro-dev-checked-source-evidence-20261025","nightly-f03-pages-git-bundled-dev-test-candidate-20261025",...["firmware-f04-pr190-bf001-selection-host-dev-checked-20261025","nightly-f04-pages-git-repaired-installer-source-only-20261025"]];
const r46Mutate=(n,fn)=>edit(j=>{let i=139+n,r=j.history[i];assert.equal(r.id,r46SafeIds[n]);fn(r,j);});
run('r46-source-history-PASS',edit(j=>{assert.ok(j.history.length>=143);assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);assert.equal(j.builds.length,2);assert.equal(j.installable,false);for(let n=0;n<4;n++){let r=j.history[139+n];assert.equal(r.id,r46SafeIds[n]);assert.equal(r.installable,false);assert.equal(r.device_verified,false);assert.equal(r.artifact_distribution_approved,false);}}),true);
for(let n=0;n<4;n++){
 run('r46-remove-'+n+'-REJECT',r46Mutate(n,(r,j)=>{j.history.splice(139+n,1);j.counts.source_or_historical_checkpoints--;}));
 run('r46-forged-rights-'+n+'-REJECT',r46Mutate(n,r=>r.artifact_distribution_approved=true));
 run('r46-forged-package-'+n+'-REJECT',r46Mutate(n,r=>r.reported_package_sha256.elite='a'.repeat(64)));
}

// R47 F05: evidence-only history must reject deletions, forged source and false download/device/rights grants.
const r47SafeIds=["firmware-f05-pr198-bf002-project-quickcheck-dev-checked-20261025","nightly-f05-pages-git-bf002-device-not-tested-20261025"];
const r47Mutate=(n,fn)=>edit(j=>{const i=143+n,r=j.history[i];assert.equal(r.id,r47SafeIds[n]);fn(r,j);});
run('r47-source-history-PASS',edit(j=>{assert.ok(j.history.length>=145, 'R47 sealed prefix survives later append-only rows');assert.equal(j.counts.source_or_historical_checkpoints,j.history.length);assert.equal(j.builds.length,2);assert.equal(j.installable,false);for(let n=0;n<2;n++){const r=j.history[143+n];assert.equal(r.id,r47SafeIds[n]);for(const k of ['installable','device_verified','artifact_distribution_approved'])assert.equal(r[k],false);}}),true);
for(let n=0;n<2;n++){
 run('r47-remove-'+n+'-REJECT',r47Mutate(n,(r,j)=>{j.history.splice(143+n,1);j.counts.source_or_historical_checkpoints--;}));
 run('r47-false-install-'+n+'-REJECT',r47Mutate(n,r=>r.installable=true));
 run('r47-false-device-'+n+'-REJECT',r47Mutate(n,r=>r.device_verified=true));
 run('r47-false-rights-'+n+'-REJECT',r47Mutate(n,r=>r.artifact_distribution_approved=true));
 run('r47-forged-source-'+n+'-REJECT',r47Mutate(n,r=>r.source_commit='f'.repeat(40)));
 run('r47-forged-package-'+n+'-REJECT',r47Mutate(n,r=>r.reported_package_sha256.elite='f'.repeat(64)));
}

// R48 current Git development receipts must reject false download/device/rights claims.
const r48NegativeIds=["nightly-pages-wbl1-0e77d923-dev-git-observation-20261027","nightly-pages-ec015-occupied-slot-guard-source-20261027","firmware-pr646-break-generator-host-errors-feature-merged-20261027"];
const r48Mutate=(n,fn)=>edit(j=>{const i=145+n,r=j.history[i];assert.equal(r.id,r48NegativeIds[n]);fn(r,j);});
run('r48-real-noninstallable-history-positive',edit(j=>{
 assert.ok(j.history.length>=148);assert.equal(j.history.length,j.counts.source_or_historical_checkpoints);
 assert.equal(j.builds.length,2);assert.equal(j.installable,false);
 for(let n=0;n<3;n++){const r=j.history[145+n];assert.equal(r.id,r48NegativeIds[n]);for(const k of ['installable','device_verified','artifact_distribution_approved','artifact_bytes_independently_verified','exact_remote_native_build'])assert.equal(r[k],false);}
}),true);
for(let n=0;n<3;n++){
 run('r48-row-deletion-'+n,r48Mutate(n,(r,j)=>{j.history.splice(145+n,1);j.counts.source_or_historical_checkpoints--}));
 run('r48-forged-source-'+n,r48Mutate(n,r=>{r.source_commit='f'.repeat(40)}));
 run('r48-false-download-'+n,r48Mutate(n,r=>{r.installable=true}));
 run('r48-false-device-'+n,r48Mutate(n,r=>{r.device_verified=true}));
 run('r48-false-rights-'+n,r48Mutate(n,r=>{r.artifact_distribution_approved=true}));
}
run('r48-WBL1-forged-Pro-package',r48Mutate(0,r=>{r.reported_package_sha256.pro='f'.repeat(64)}));
run('r48-WBL1-forged-controller',r48Mutate(0,r=>{r.reported_controller_sha256='f'.repeat(64)}));
run('r48-unapproved-firmware-download-HREF',r48Mutate(0,r=>{r.download_url='https://evil.invalid/unapproved.fwsc'}));
