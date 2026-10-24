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
  assert.equal(j.history.length,119);assert.equal(j.builds.length,2);
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


// R26: lock two NEW real source receipts without erasing R25's native-private audit.
const smcR26='smc-pr122-r2-mmc-stop-project-reset-source-20261024';
const bfR26='bugfinder-bf020-pr123-legacy-bd-pan-motion-20261024';
const tamperR26=(id,mutation)=>edit(j=>{
  const row=j.history.find(h=>h.id===id);
  assert.ok(row);
  mutation(row);
});
run('r26-current-119-noninstallable-row-positive',edit(j=>{
  assert.equal(j.history.length,119);
  assert.equal(j.history[117].id,smcR26);
  assert.equal(j.history[118].id,bfR26);
  assert.deepEqual(j.history.slice(-2).map(h=>h.installable),[false,false]);
  assert.deepEqual(j.history.slice(-2).map(h=>h.status),['source-only','source-only']);
  assert.equal(j.counts.actual_build_generations,2);
  assert.equal(j.counts.source_or_historical_checkpoints,119);
}),true);
run('r26-delete-SMC-PR122-receipt-adjust-count',edit(j=>{j.history.splice(117,1);j.counts.source_or_historical_checkpoints--;}));
run('r26-delete-BF020-PR123-trailing-receipt-adjust-count',edit(j=>{j.history.pop();j.counts.source_or_historical_checkpoints--;}));
run('r26-delete-both-new-real-receipts-adjust-count',edit(j=>{j.history.splice(117,2);j.counts.source_or_historical_checkpoints-=2;}));
run('r26-swap-new-real-receipts',edit(j=>{[j.history[117],j.history[118]]=[j.history[118],j.history[117]];}));
run('r26-forge-SMC-source-SHA-valid-shape',tamperR26(smcR26,x=>{x.source_commit='f'.repeat(40);}));
run('r26-forge-BF020-compiled-subtree-SHA-valid-shape',tamperR26(bfR26,x=>{x.firmware_subtree='e'.repeat(40);}));
run('r26-forge-SMC-nondevice-QA-PASS',tamperR26(smcR26,x=>{x.status='dev-checked';}));
run('r26-forge-BF020-device-proof',tamperR26(bfR26,x=>{x.device_verified=true;}));
run('r26-add-hidden-download-HREF',tamperR26(smcR26,x=>{x.download_url='https://evil.example/firmware';}));
run('r26-false-exact-native-compile',tamperR26(bfR26,x=>{x.exact_remote_native_build=true;}));
