// SPDX-License-Identifier: GPL-3.0-only
// Ensure NIGHTLY status history stays noninstallable and matches generated docs.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const text = read('build-status.json');
assert.equal(read('docs/build-status.json'), text, 'source and docs build status mismatch');
const catalog = JSON.parse(text);
const preview = JSON.parse(read('preview-catalog.json'));
const published = JSON.parse(read('docs/versions.json'));
// The empty source-only picker is an exact schema, not an extensible download surface.
// Both source and generated picker files must use the approved provenance values.
const approvedPickerKeys = ['schema', 'repo', 'pages', 'latest', 'versions', 'history'];
assert.deepEqual(Object.keys(preview).sort(), approvedPickerKeys.sort(),
  'unapproved NIGHTLY picker field (including hidden download/approval metadata)');
assert.equal(preview.schema, 1, 'unsupported NIGHTLY picker schema');
assert.equal(preview.repo, 'https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly',
  'NIGHTLY picker must identify the correct public browser-source repository');
assert.equal(preview.pages, '', 'NIGHTLY picker must not advertise an unapproved hosting target');
assert.equal(catalog.schema, 1);
assert.equal(catalog.kind, 'nightly-read-only-build-history');
assert.equal(catalog.installable, false);
assert.ok(Array.isArray(catalog.policy.public_device_proven_versions), 'public-proven list is required');
const publicProven = new Set(catalog.policy.public_device_proven_versions);
// No model has attributable, independently verified owner hardware evidence
// in this read-only status snapshot. SHA/URL-shaped strings alone are not
// proof. Genuine later model-specific device feedback needs a separately
// reviewed admission of exact owner report + same firmware/controller bytes.
assert.deepEqual(catalog.policy.public_device_proven_versions, [],
  'unauthenticated public-proven hardware versions forbidden');
assert.equal(catalog.policy.public_latest, null,
  'no approved public latest without independently verified same-byte owner proof');
assert.equal(publicProven.size, catalog.policy.public_device_proven_versions.length, 'duplicate public eligibility');
assert.equal(catalog.policy.public_latest === null, publicProven.size === 0, 'missing or unexpected public latest');
if (catalog.policy.public_latest !== null) {
  assert.ok(publicProven.has(catalog.policy.public_latest), 'latest must have real physical evidence');
}
assert.match(catalog.source.versions_blob_sha, /^[a-f0-9]{40}$/);
assert.deepEqual(preview.versions, []);
assert.deepEqual(preview.history, []);
assert.equal(preview.latest, null);
assert.deepEqual(published, preview);
assert.equal(catalog.counts.actual_build_generations, catalog.builds.length);
assert.equal(catalog.counts.source_or_historical_checkpoints, catalog.history.length);

 // A history record may describe a build, but may not introduce any installer picker,
 // download, or artifact URL. Only explicitly reviewed source-evidence fields exist.
 const shape=(value,allowed,at)=>{
   assert.ok(value && typeof value==='object' && !Array.isArray(value),at+': object required');
   const names=new Set(allowed.split(' '));
   for(const key of Object.keys(value)) assert.ok(names.has(key),at+': forbidden field '+key);
 };
 const officialRepo='https://github.com/gobbajogger/X0X37-for-Loopy-Pro';
 // Navigational history may link to a moving PR/branch; actual evidence of
 // test, build or physical PASS must identify immutable Git source bytes.
 const navigationURL=(value,at)=>{
   assert.equal(typeof value,'string',at+': source URL must be a string');
   assert.ok(value.startsWith(officialRepo+'/'),at+': untrusted source');
   const tail=value.slice(officialRepo.length+1);
   const valid=(
     /^pull\/[0-9]+$/.test(tail) ||
     /^commit\/[a-f0-9]{40}$/.test(tail) ||
     /^tree\/[A-Za-z0-9._/-]+$/.test(tail) ||
     /^blob\/[A-Za-z0-9._/-]+\.(?:md|json)$/.test(tail)
   );
   assert.ok(valid,at+': unapproved source navigation route');
   assert.ok(!tail.split('/').includes('..') && !tail.includes('%') &&
      !tail.includes('?') && !tail.includes('#') && !tail.includes('\\'),at+': unsafe source path');
 };
 const evidenceURL=(value,at)=>{
   navigationURL(value,at);
   const tail=value.slice(officialRepo.length+1);
   assert.ok(
     /^commit\/[a-f0-9]{40}$/.test(tail) ||
     /^tree\/[a-f0-9]{40}(?:\/[A-Za-z0-9._/-]+)?$/.test(tail) ||
     /^blob\/[a-f0-9]{40}\/[A-Za-z0-9._/-]+\.(?:md|json)$/.test(tail),
     at+': immutable Git commit SHA is required for evidence');
 };

 // Read-only status cannot carry download/picker/Release links, even when an
 // ostensibly scalar status/diagnostic field is replaced with nested JSON.
 const evidenceKeys=new Set(['url','evidence_url','handoff_source','validation_record','report_url']);
 const repoKeys=new Set(['repo','source_repo']);
 const checkNestedLinks=(value,at='catalog')=>{
   if(Array.isArray(value)){value.forEach((entry,i)=>checkNestedLinks(entry,at+'['+i+']'));return;}
   if(!value||typeof value!=='object')return;
   for(const [key,child] of Object.entries(value)){
     const path=at+'.'+key;
     if(/(?:url|uri|href|link)$/i.test(key) ||
        /^(?:download|downloads|pkg|picker|assets?|release_assets|firmware_file|binary_file)$/i.test(key)){
       assert.ok(evidenceKeys.has(key),path+': forbidden artifact/download/picker link field');
       if(child!=null)(key==='url'?navigationURL:evidenceURL)(child,path);
       else assert.ok(['url','evidence_url','handoff_source'].includes(key),path+': missing evidence');
     }
     if(typeof child==='string'&&/https?:\/\//i.test(child)){
       assert.ok(evidenceKeys.has(key)||repoKeys.has(key),path+': unapproved URL value');
       if(repoKeys.has(key))assert.equal(child,officialRepo,path+': unapproved source repo');
       else (key==='url'?navigationURL:evidenceURL)(child,path);
     }
     checkNestedLinks(child,path);
   }
 };
 checkNestedLinks(catalog);
 assert.equal(typeof catalog.policy.nightly,'string','nightly policy must be text');
 assert.equal(typeof catalog.policy.public,'string','public policy must be text');

 shape(catalog,'schema kind installable source builds history policy counts versioning','manifest');
 shape(catalog.source,'repo ref commit versions_blob_sha','source');
 assert.equal(catalog.source.repo,officialRepo,'source repo');
 assert.equal(catalog.source.ref,'gh-pages','source ref');
assert.match(catalog.source.commit,/^[a-f0-9]{40}$/,'source commit requires pinned SHA');
 shape(catalog.policy,'nightly public public_device_proven_versions public_latest','policy');
 shape(catalog.counts,'actual_build_generations source_or_historical_checkpoints','counts');
 shape(catalog.versioning,'firmware_product_version build_id channel_rules web_preview_package_version web_preview_package_version_is_firmware_version','versioning');
 shape(catalog.versioning.firmware_product_version,'format monotonic historical_assignment prerelease_iteration','firmware version');
 shape(catalog.versioning.build_id,'legacy_format legacy_ids_are_firmware_product_versions model_artifact_identity_requires','build-id');
 shape(catalog.versioning.channel_rules,'nightly production','channel rules');
 assert.equal(catalog.versioning.web_preview_package_version_is_firmware_version,false);
 for(const build of catalog.builds){
   shape(build,'id title built_at source_commit status lifecycle hardware_tested installable_from_nightly_status models','build');
   assert.equal(build.status,'dev-checked','unreviewed or unsupported build status');
   assert.ok(['current','superseded'].includes(build.lifecycle),'unknown build lifecycle');
   for(const model of Object.values(build.models||{})){
     shape(model,'product size sha256 validation_record device_verified physical_evidence','build model');
     evidenceURL(model.validation_record,'model validation record');
     if(model.physical_evidence!==undefined){
       assert.equal(model.device_verified,true,'unverified model cannot attach physical PASS evidence');
       shape(model.physical_evidence,'report_sha256 report_url controller_sha256 owner_publication_approved','hardware evidence');
       evidenceURL(model.physical_evidence.report_url,'hardware report');
     }
   }
 }
 const approvedHistoryFields='id title source_repo source_ref source_commit source_tree source_time date status models firmware_product_version build_id installable device_verified reported_checks description missing_gate url evidence_commit evidence_url handoff_source source_identity_note reported_package_sha256 reported_offline_artifacts offline_source exact_remote_native_build artifact_distribution_approved firmware_subtree producer_reported_artifacts artifact_bytes_independently_verified build_target_tests_independently_reexecuted build_pipeline failed_build';
 for(const item of catalog.history){
   shape(item,approvedHistoryFields,'history');
   // Authentic separately byte-audited R14 native models: BUILD_ONLY, not QA/hosting.
   if(item.id==='integration-pr103-r14-native-elite-pro-20261024'){
     assert.equal(item.status,'build-succeeded-unreviewed');
     assert.equal(item.source_commit,'32fc37fdaacbdd2e9791723ee0da9a22193cd947');
     assert.equal(item.source_tree,'89027dddcc55680d5a218b83e04f0e392ed01283');
     assert.equal(item.firmware_subtree,'5c209609b770fd13949230aeb80956594fd6b741');
     assert.equal(item.source_ref,'lane/safe-merge-303-first-nightly-20261024-0138');
     for(const [model,pin] of Object.entries({
       elite:{bytes:651396,sha256:'d14877d6592e6dc158460e960ac5aefd1b2b775588b9f896d3c83f672d61c86c'},
       pro:{bytes:651392,sha256:'cde289d422b61ee8b1f0a9f04ca92d244f07856667c85d757b9563e0479d3f3c'}
     })){
       assert.equal(item.producer_reported_artifacts?.[model]?.bytes,pin.bytes,model+': verified R14 byte length');
       assert.equal(item.producer_reported_artifacts?.[model]?.sha256,pin.sha256,model+': verified R14 SHA256');
     }
     const ctl=item.producer_reported_artifacts?.private_controller;
     assert.equal(ctl?.bytes,65492);
     assert.equal(ctl?.sha256,'956e3e214658aeaa06a8c122809399ef3e430c7192291f4d918b7b1181ec2d0a');
     assert.equal(ctl?.crc32,'9c07ae67');
     assert.equal(ctl?.redistribution_permitted,false);
     assert.equal(item.artifact_bytes_independently_verified,true);
     assert.equal(item.artifact_distribution_approved,false);
     assert.equal(item.build_target_tests_independently_reexecuted,false);
     assert.equal(item.build_pipeline?.evidence_commit,item.source_commit);
     assert.equal(item.build_pipeline?.evidence_manifest_blob_sha,'ab6d37eaa3a9e6be8436cd40d2ceaffd42e09165');
     assert.equal(item.build_pipeline?.builder_selected_host_checks_pass,17);
     assert.equal(item.build_pipeline?.followup_native_checks_pass,0);
     assert.deepEqual(item.build_pipeline?.followup_native_checks_fail,[]);
     assert.equal(item.build_pipeline?.package_bytes_independently_received_and_rehashed,true);
   }
   if(item.id==='data-safety-pr110-r2-scoped-qa-20261024'){
     assert.equal(item.status,'validation-evidence-only');
     assert.equal(item.source_commit,'b5008faa87c2bb897a48f8a37df10b445bb26b77');
     assert.equal(item.source_tree,'457e75b7e711f978f100dc99995e90fdd59a628f');
     assert.equal(item.firmware_subtree,'a32c68ba72eb21f77bfeccb1f86954db8823b244');
   }
   if(item.id==='integration-pr103-r16-pr110-integrated-current-20261024'){
     assert.equal(item.status,'source-only');
     assert.equal(item.source_commit,'2ac7bfe0f538275ad45a6d9f75e802dcbccd35c7');
     assert.equal(item.source_tree,'a44bcbda32e831609faab3fbf9b361a8dc45e24e');
     assert.equal(item.firmware_subtree,'5c209609b770fd13949230aeb80956594fd6b741');
   }

   // Reject forged readiness objects hidden inside ostensibly textual fields.
   for(const field of ['id','title','date']){
     assert.ok(typeof item[field]==='string'&&item[field].trim().length>0,
       'history '+field+' must be nonempty text');
   }
   assert.match(item.date,/^20\d{2}-\d{2}-\d{2}$/,'history date requires YYYY-MM-DD');
   for(const field of ['description','missing_gate','source_ref','source_time','source_identity_note']){
     if(item[field]!=null)assert.ok(typeof item[field]==='string'&&item[field].trim().length>0,
       'history '+field+' must be nonempty text');
   }

   if(item.source_repo!==undefined)assert.equal(item.source_repo,officialRepo,'historical source repo');

    // Metadata booleans never grant distribution, exact-source build or full QA.
    for (const flag of ['artifact_distribution_approved','exact_remote_native_build',
      'artifact_bytes_independently_verified','build_target_tests_independently_reexecuted']) {
      if (Object.prototype.hasOwnProperty.call(item,flag))
        assert.equal(typeof item[flag],'boolean','history '+item.id+': '+flag+' must be boolean');
    }
    if(item.artifact_distribution_approved!==undefined)
      assert.equal(item.artifact_distribution_approved,false,'read-only history cannot approve distribution');
    if(item.exact_remote_native_build!==undefined)
      assert.equal(item.exact_remote_native_build,false,'no independent exact-full-root compiler attestation');
    if(item.build_target_tests_independently_reexecuted!==undefined)
      assert.equal(item.build_target_tests_independently_reexecuted,false,'no independent full-root QA receipt');
    if(item.artifact_bytes_independently_verified===true){
      if(item.id==='integration-pr103-model-builds-20261024'){
      // Preserve the one REAL private byte rehash, tied to the prior committed
      // 23/23 audit and exact source/model/controller SHA, never to installability.
      const r4=JSON.parse(read('docs/scheduler-handoffs/catalog-sync-20261024.json')).closed_loop_cycle_20261024_r4;
      const proof=r4?.catalog_private_zip;
      const source=r4?.consumed_firmware?.[0];
      assert.equal(item.id,'integration-pr103-model-builds-20261024','unattributed independent-byte claim');
      assert.equal(item.status,'evidence-only','independent byte audit remains noninstallable evidence');
      assert.equal(source?.sha,item.source_commit,'private audit source commit mismatch');
      assert.equal(source?.root_tree,item.source_tree,'private audit full root mismatch');
      assert.equal(source?.firmware_subtree,item.firmware_subtree,'private audit firmware subtree mismatch');
      assert.equal(proof?.scoped,'CATALOG_PRIVATE_BYTE_REHASH_ONLY__NO_NATIVE_COMPILER_OR_FIRMWARE_CRC_PARSER_QA');
      assert.equal(proof?.exit_code,0,'private-byte audit must exit zero');
      assert.equal(proof?.checks_pass,23,'private-byte audit pass count');
      assert.equal(proof?.total_checks,23,'private-byte audit total count');
      assert.match(proof?.producer_manifest_sha256,/^[a-f0-9]{64}$/,'private-byte audit manifest SHA256');
      assert.equal(proof?.controller_redistribution_cleared,false,'controller redistribution remains unapproved');
      for(const model of ['elite','pro','private_controller']){
        assert.equal(item.producer_reported_artifacts?.[model]?.sha256,proof?.sha256?.[model],
          model+': private-byte audit SHA256 mismatch');
        assert.equal(item.producer_reported_artifacts?.[model]?.bytes,proof?.bytes?.[model],
          model+': private-byte audit byte length mismatch');
      }

      } else if(item.id==='integration-pr103-smc79-native-build-20261024-r13'){
        // Real private bytes, not full-root QA, lawful hosting or device verification.
        const r13=JSON.parse(read('docs/scheduler-handoffs/catalog-sync-20261024.json')).closed_loop_cycle_20261024_r13?.catalog_private_zip;
        assert.equal(r13?.scoped,'CATALOG_PRIVATE_BYTE_REHASH_27_PASS__NO_FULL_ROOT_QA');
        assert.equal(r13?.exit,0);assert.equal(r13?.checks_pass,27);
        assert.equal(r13?.zip_sha256,'2b4ead6559dc003b0394edd99633ce2aa46b838dea9a2635c16261a9fe2913ee');
        assert.equal(r13?.results_sha256,'72aa5b6b115a8121aa4989a6f4f26c05679e7d8b6116a3ef5d99ad4b2d704acb');
        assert.equal(r13?.compiled_source,'56c5d971b6d1c1864cd0f6153f4399950c223c2d');
        assert.equal(r13?.current_source,item.source_commit);
        assert.equal(r13?.current_root,item.source_tree);
        assert.equal(r13?.firmware_subtree,item.firmware_subtree);
        assert.equal(r13?.receipt_blob_sha,'f4f865e770ace19af2d484ccc4a5b56699140ae4');
        assert.equal(r13?.receipt_blob_sha,item.build_pipeline?.evidence_manifest_blob_sha);
        assert.equal(r13?.full_root_QA,false);
        assert.equal(r13?.controller_redistribution_cleared,false);
        for(const model of ['elite','pro','private_controller']){
          assert.equal(item.producer_reported_artifacts?.[model]?.sha256,r13?.artifacts?.[model]?.sha256,model+' hash');
          assert.equal(item.producer_reported_artifacts?.[model]?.bytes,r13?.artifacts?.[model]?.bytes,model+' size');
        }
        assert.equal(item.artifact_distribution_approved,false);
        assert.equal(item.build_target_tests_independently_reexecuted,false);
      } else if(item.id==='integration-pr103-r10-native-elite-pro-20261024'){
        const proof=JSON.parse(read('docs/scheduler-handoffs/catalog-sync-20261024.json')).closed_loop_cycle_20261024_r16?.catalog_private_zip;
        assert.equal(item.status,'build-succeeded-unreviewed');
        assert.equal(proof?.scope,'READ_ONLY_ELITE_PRO_PACKAGE_HASH_CRC_MODEL_SLOT_NEGATIVES; CONTROLLER_BYTES_NOT_RECEIVED; FULL_ROOT_QA_NOT_RUN');
        assert.equal(item.source_commit,proof?.source_commit);
        assert.equal(item.source_tree,proof?.source_root);
        assert.equal(item.firmware_subtree,proof?.firmware_subtree);
        assert.equal(proof?.private_zip_sha256,'0b88e2dce13560a94db06d79170d9ba3c4453b4258a1196e91120ea8a4345cdc');
        assert.equal(proof?.native_evidence_zip_sha256,'e50377effe0b95a9d54d63dbf0cc40e23313e115e297cc9035a4b5db07de6b3d');
        assert.equal(proof?.builder_manifest_sha256,'2954170dca3e2129458b0d5926a09007ddb8deb37d7664ea86a04a2159faaaa1');
        assert.equal(proof?.source_evidence_blob_sha,item.build_pipeline?.evidence_manifest_blob_sha);
        assert.equal(proof?.native_exit_code,0);
        assert.equal(proof?.checks_pass,48);
        // R10 private checker/log/results SHA256 pinned to independently observed immutable receipts.
        assert.equal(proof?.checker_sha256,'76947801c5516442d44f4f345884faa1b5e595f116a33086207f23ec67aa4ac9','R10 checker SHA256 proof');
        assert.equal(proof?.log_sha256,'c62a5451d68161bca3a73bfc622dd6bfce62399578492589d7b49800160f0fe7','R10 log SHA256 proof');
        assert.equal(proof?.results_sha256,'51a46a8b7b45647cdd2f1d7c305feff6f52b4c07038e3b79fb629267859aaff9','R10 results SHA256 proof');
        assert.equal(proof?.negative_checks_pass,12);
        assert.equal(proof?.controller?.bytes_present_in_r10_zip,false);
        assert.equal(proof?.controller?.redistribution_cleared,false);
        assert.equal(proof?.controller?.reported_sha256,item.producer_reported_artifacts?.private_controller?.sha256);
        assert.equal(proof?.qa,'QA_PENDING');
        assert.equal(proof?.installability,'NOT_INSTALLABLE');
        assert.equal(proof?.live_http,'NOT_VERIFIED');
        for(const model of ['elite','pro']){
          assert.equal(item.producer_reported_artifacts?.[model]?.sha256,proof?.models?.[model]?.sha256,model+' private hash');
          assert.equal(item.producer_reported_artifacts?.[model]?.bytes,proof?.models?.[model]?.bytes,model+' private size');
          assert.equal(proof?.models?.[model]?.controller_blank,true,model+' controller blank');
          assert.match(proof?.models?.[model]?.crc32,/^[a-f0-9]{8}$/);
          assert.equal(proof.models[model].crc32,model==='elite'?'96808fe7':'3cc9dfeb',
            model+': immutable actual R10 model package CRC32');
          assert.equal(proof?.models?.[model]?.slot_map_crc32,'0d69aa83');
        }
        assert.equal(item.artifact_distribution_approved,false);
        assert.equal(item.build_target_tests_independently_reexecuted,false);
      } else if(item.id==='integration-pr103-r14-native-elite-pro-20261024'){
        assert.equal(item.source_commit,'32fc37fdaacbdd2e9791723ee0da9a22193cd947');
        assert.equal(item.artifact_distribution_approved,false);
        assert.equal(item.build_target_tests_independently_reexecuted,false);
      } else if(item.id==='producer-pr120-fresh-elite-pro-controller-20261024'){
        // Actual private byte audit verified all three members and archive in
        // the main Library; distinct from a compiler run or full-root QA.
        const proof=JSON.parse(read('docs/scheduler-handoffs/catalog-sync-20261024-r25.json')).pr120_private_byte_audit;
        assert.equal(item.status,'build-succeeded-unreviewed');
        assert.equal(item.source_commit,'2d5742ee7c271168b6e78fc24100f9bae79e334d');
        assert.equal(item.source_tree,'20b4d99b62473c57a13f1facfde6b214360fff45');
        assert.equal(item.firmware_subtree,'5fe09b05151ebff1af5e5a176374bc1a96cdea58');
        assert.equal(proof.source_commit,item.source_commit);
        assert.equal(proof.source_root_tree,item.source_tree);
        assert.equal(proof.firmware_subtree,item.firmware_subtree);
        assert.equal(proof.source_git_manifest_blob_sha,'0d5404a3aad27e1bda1fe68b6d26fc7e19db8da0');
        assert.equal(proof.archive_bytes,1227915);
        assert.equal(proof.archive_sha256,'5870b4e40002058e79239bb4db12e9409c56e59541e10d06bb777d17daf40fc9');
        assert.equal(proof.provenance_bytes,4287);
        assert.equal(proof.provenance_sha256,'df40d7e035f451904c28ad53ee9fe09e60623ad6690d9e6ec0552db628bb6f8f');
        for(const [model,pin] of Object.entries({
          elite:{product:'SMK-37 Elite_900',bytes:651396,sha256:'1a12ecebc5b93efd6e5c0f3cf31a242f9ff8a29a4aa695e3236b74b4c92c55bf',crc32:'df3c31c5'},
          pro:{product:'SMK-37 Pro_900',bytes:651392,sha256:'fc6f13a50baee5cd09b69f2dcf0ac282afa76735ef2b01a8c68c07f9f27a1a7d',crc32:'772d61ed'},
          private_controller:{bytes:65492,sha256:'956e3e214658aeaa06a8c122809399ef3e430c7192291f4d918b7b1181ec2d0a',crc32:'9c07ae67'}
        })){
          const reported=item.producer_reported_artifacts?.[model];
          const inspected=proof.artifacts?.[model];
          assert.equal(reported?.bytes,pin.bytes,model+': reported bytes');
          assert.equal(reported?.sha256,pin.sha256,model+': reported hash');
          assert.equal(inspected?.bytes,pin.bytes,model+': audited bytes');
          assert.equal(inspected?.sha256,pin.sha256,model+': audited SHA256');
          assert.equal(inspected?.crc32,pin.crc32,model+': audited CRC32');
          if(model!=='private_controller')assert.equal(reported?.product,pin.product,model+': model');
        }
        assert.equal(item.producer_reported_artifacts.private_controller.redistribution_permitted,false);
        assert.equal(proof.private_library_only,true);
        assert.equal(proof.distribution_approved,false);
        assert.equal(proof.independent_site_QA,'PENDING');
        assert.equal(proof.independent_firmware_root_QA,'PENDING');
        assert.equal(proof.owner_device,'NOT_TESTED');
        assert.equal(item.build_pipeline?.evidence_commit,item.source_commit);
        assert.equal(item.build_pipeline?.evidence_manifest_blob_sha,proof.source_git_manifest_blob_sha);
        assert.equal(item.build_pipeline?.followup_native_checks_pass,0);
        assert.deepEqual(item.build_pipeline?.followup_native_checks_fail,[]);
        assert.equal(item.artifact_distribution_approved,false);
        assert.equal(item.exact_remote_native_build,false);
        assert.equal(item.build_target_tests_independently_reexecuted,false);
      } else assert.ok(false,'unattributed private-byte audit');
    }

   for(const key of ['url','evidence_url','handoff_source'])if(item[key]!=null)(key==='url'?navigationURL:evidenceURL)(item[key],'history.'+key);
   assert.equal(item.models.length,new Set(item.models).size,'duplicate historical model');
   if(item.reported_checks!==undefined){
     shape(item.reported_checks,'origin command result','reported_checks');
     for(const field of ['origin','result'])
       assert.ok(typeof item.reported_checks[field]==='string'&&
         item.reported_checks[field].trim().length>0,'reported_checks.'+field+' must be nonempty text');
     assert.ok(item.reported_checks.command===null||
       (typeof item.reported_checks.command==='string'&&item.reported_checks.command.trim().length>0),
       'reported_checks.command must be text or null');
   }
   if(item.reported_package_sha256!==undefined){
     shape(item.reported_package_sha256,'elite pro','reported hashes');
     for(const [model,sha] of Object.entries(item.reported_package_sha256))
       assert.match(sha,/^[a-f0-9]{64}$/,model+': reported historical package SHA256');
   }
   if(item.offline_source!==undefined){
     shape(item.offline_source,'synthetic_commit synthetic_tree firmware_nightly_tree identical_to_firmware_nightly','offline projection');
     assert.equal(item.offline_source.identical_to_firmware_nightly,false,'unverified source equality');
     for(const key of ['synthetic_commit','synthetic_tree','firmware_nightly_tree'])
       assert.match(item.offline_source[key],/^[a-f0-9]{40}$/,'offline '+key);
   }
   if(item.reported_offline_artifacts!==undefined){
     shape(item.reported_offline_artifacts,'elite pro controller','offline artifacts');
     for(const [model,artifact] of Object.entries(item.reported_offline_artifacts)){
       shape(artifact,model==='controller'?'size sha256 crc32':'size sha256','offline artifact');
       assert.ok(Number.isInteger(artifact.size)&&artifact.size>0,'offline artifact size must be positive integer');
       assert.match(artifact.sha256,/^[a-f0-9]{64}$/,'offline artifact SHA256');
       if(model==='controller')assert.match(artifact.crc32,/^[a-f0-9]{8}$/,'offline controller CRC32');
     }
   }
   if(item.producer_reported_artifacts!==undefined){
     shape(item.producer_reported_artifacts,'elite pro private_controller','reported artifacts');
     for(const [model,artifact] of Object.entries(item.producer_reported_artifacts)){
       shape(artifact,model==='private_controller'?'bytes sha256 crc32 redistribution_permitted':'product bytes sha256','reported artifact');
       assert.ok(Number.isInteger(artifact.bytes)&&artifact.bytes>0,'producer artifact byte count');
       assert.match(artifact.sha256,/^[a-f0-9]{64}$/,'producer artifact SHA256');
       if(model==='private_controller'){
         assert.match(artifact.crc32,/^[a-f0-9]{8}$/,'private controller CRC32');
         assert.equal(artifact.redistribution_permitted,false,'controller redistribution not cleared');
       } else {
         assert.equal(artifact.product,model==='elite'?'SMK-37 Elite_900':'SMK-37 Pro_900','producer model/product mismatch');
       }
     }
   }
   if(item.build_pipeline!==undefined){
     assert.equal(item.status,'build-succeeded-unreviewed','non-build status cannot claim QA, live HTTP or firmware build pipeline');
     shape(item.build_pipeline,'build qa installability live_http hardware source_scope builder_selected_host_checks_pass followup_native_checks_pass followup_native_checks_fail evidence_commit evidence_manifest_blob_sha package_bytes_independently_received_and_rehashed','reported build pipeline');
     for(const failure of item.build_pipeline.followup_native_checks_fail)shape(failure,'name exit_code','reported host check');
   }
   if(item.failed_build!==undefined){
     assert.equal(item.status,'failed','typed compiler-failure receipt may not be relabeled');
     shape(item.failed_build,'scope firmware_subtree pool_used_bytes pool_capacity_bytes pool_free_bytes pool_minimum_bytes elite pro controller','failed build');
     assert.ok(item.failed_build.pool_free_bytes<item.failed_build.pool_minimum_bytes,'unexpected pool eligibility');
     for(const key of ['pool_used_bytes','pool_capacity_bytes','pool_free_bytes','pool_minimum_bytes'])
       assert.ok(Number.isInteger(item.failed_build[key])&&item.failed_build[key]>=0,'invalid pool '+key);
     assert.equal(item.failed_build.pool_capacity_bytes-item.failed_build.pool_used_bytes,item.failed_build.pool_free_bytes,'failed source pool accounting mismatch');
     assert.match(item.failed_build.firmware_subtree,/^[a-f0-9]{40}$/,'failed build firmware subtree');
     for(const model of ['elite','pro']){
       shape(item.failed_build[model],'exit_code artifact_created log_sha256','failed '+model);
       assert.equal(item.failed_build[model].artifact_created,false,'failed build cannot claim package');
       assert.ok(Number.isInteger(item.failed_build[model].exit_code)&&item.failed_build[model].exit_code!==0,'failed model exit must be a nonzero integer');
       assert.match(item.failed_build[model].log_sha256,/^[a-f0-9]{64}$/,'failed model log SHA256');
     }
     shape(item.failed_build.controller,'exit_code size_bytes sha256 crc32 redistribution_allowed','failed controller');
     assert.equal(item.failed_build.controller.redistribution_allowed,false);
     assert.ok(Number.isInteger(item.failed_build.controller.exit_code),'failed-source controller exit must be integer');
     assert.ok(Number.isInteger(item.failed_build.controller.size_bytes)&&item.failed_build.controller.size_bytes>0,'failed-source controller size');
     assert.match(item.failed_build.controller.sha256,/^[a-f0-9]{64}$/,'failed-source controller SHA256');
     assert.match(item.failed_build.controller.crc32,/^[a-f0-9]{8}$/,'failed-source controller CRC32');
   }
   // Bind the original real PR93 native failed-build receipt to immutable Git
   // source and compiler logs; older 'failed' non-build evidence remains legal.
   if(item.id==='producer-pr93-20261023'){
     assert.equal(item.status,'failed','PR93 compiler failure cannot be hidden by relabeling');
     assert.ok(item.failed_build,'PR93 historical compiler-failure receipt is required');
     assert.equal(item.source_commit,'74389d4bb4abc2f8a36b91bc16d1822b63264986','PR93 failed source commit');
     assert.equal(item.source_tree,'aeacf2c81bd19a33dd50ba0bf3a6e72b1131271a','PR93 failed full root tree');
     assert.equal(item.failed_build.firmware_subtree,'3fe98ec515b3abafd50a62280632839c2910dd80','PR93 failed firmware subtree');
     assert.equal(item.failed_build.elite.exit_code,1,'PR93 Elite compiler failed');
     assert.equal(item.failed_build.pro.exit_code,1,'PR93 Pro compiler failed');
     assert.equal(item.failed_build.elite.log_sha256,'9bdf740b6aeac19d6cb9264fb5143fee986296b49913fca9165eb81b341213db','PR93 Elite failure log');
     assert.equal(item.failed_build.pro.log_sha256,'0bfc208e37a7d72390ac6b740a94524f53ba4eb1f13ffec702b7dbc0ea17d17b','PR93 Pro failure log');
     assert.equal(item.failed_build.controller.exit_code,0,'PR93 private controller succeeded separately');
   }
 }

const seen = new Set();
const allowedBuildStatuses = new Set(['dev-checked']);
for (const build of catalog.builds) {
  assert.ok(typeof build.id === 'string' && build.id.trim().length > 0, 'blank build id');
  assert.equal(seen.has(build.id), false, 'duplicate build ' + build.id);
  seen.add(build.id);
  assert.ok(allowedBuildStatuses.has(build.status), 'unsupported build status ' + build.status);
  assert.match(build.source_commit, /^[a-f0-9]{40}$/);
  assert.equal(build.installable_from_nightly_status, false);
  assert.equal(typeof build.hardware_tested, 'boolean', 'hardware status must be explicit');
  assert.equal(build.hardware_tested, false,
    'no authenticated historical build hardware results admitted');
  assert.ok(build.models && typeof build.models === 'object' && !Array.isArray(build.models) &&
    Object.keys(build.models).length > 0, 'firmware generation requires a model');
  assert.equal(build.hardware_tested,
    Object.values(build.models).some(m => m.device_verified === true),
    'aggregate hardware PASS requires attributable per-model PASS');
  for (const [model, data] of Object.entries(build.models)) {
    assert.ok(['elite', 'pro'].includes(model));
    assert.equal(data.product,model==='elite'?'SMK-37 Elite_900':'SMK-37 Pro_900','build model/product mismatch');
    assert.match(data.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(data.size) && data.size > 0);
    assert.ok(typeof data.device_verified === 'boolean', 'device verified must be explicit');
    assert.equal(data.device_verified, false,
      'model hardware PASS not independently verified against owner observation');
    assert.equal(data.physical_evidence, undefined,
      'unverified model must not carry apparent physical report');
    if (data.device_verified) {
      assert.equal(build.hardware_tested, true, 'device PASS cannot contradict version status');
      assert.equal(build.status, 'dev-checked', 'device PASS cannot upgrade a failed/unbuilt version');
      assert.ok(data.physical_evidence && /^[a-f0-9]{64}$/.test(data.physical_evidence.report_sha256), 'missing attributable hardware report digest');
      assert.ok(/^https:\/\//.test(data.physical_evidence.report_url), 'missing physical report link');
      assert.ok(/^[a-f0-9]{64}$/.test(data.physical_evidence.controller_sha256), 'missing controller digest');
      assert.ok(data.physical_evidence.owner_publication_approved === undefined || typeof data.physical_evidence.owner_publication_approved === 'boolean', 'recorded owner approval must be boolean if supplied');
    }
  }
  if (publicProven.has(build.id)) {
    for(const [model,data] of Object.entries(build.models)){
      assert.equal(data.device_verified,true,model+': public build needs same-model hardware proof');
      assert.equal(data.physical_evidence?.owner_publication_approved,true,model+': public model needs separate production approval');
    }
  }
}
for (const id of publicProven) assert.ok(seen.has(id), 'unknown public build ' + id);
// SHA256-lock the immutable identities of the TWO actual historical DEV builds.
// Do not freeze mutable lifecycle or independently authenticated future hardware;
// genuine newer generations can be prepended without rewriting either old model.
const immutableBuildIdentities = [
  ['dev-20261022-1638-e894804','1c4553362c36f725f50091fefb68416a3a95839b7b7806e9806e5cce2a0bf093'],
  ['dev-20261022-1629-116d903','1d59cd6c55087036cf02012d75bdc5a2aa42624cbfc7e8a5a618beef5e495c63'],
];
let lastHistoricBuildIndex = -1;
for (const [id, expected] of immutableBuildIdentities) {
  const index = catalog.builds.findIndex(b => b.id === id);
  assert.ok(index >= 0, 'historic DEV build generation deleted: ' + id);
  assert.ok(index > lastHistoricBuildIndex, 'historic DEV build generation reordered: ' + id);
  lastHistoricBuildIndex = index;
  const b = catalog.builds[index];
  const identity = {id:b.id,title:b.title,built_at:b.built_at,source_commit:b.source_commit,
    models:Object.entries(b.models).sort(([a],[b])=>a.localeCompare(b))
      .map(([model,pkg])=>({model,product:pkg.product,size:pkg.size,
        sha256:pkg.sha256,validation_record:pkg.validation_record}))};
  assert.equal(createHash('sha256').update(JSON.stringify(identity),'utf8').digest('hex'),
    expected, 'historic DEV firmware identity modified: ' + id);
}


 // Enforce THIS populated catalog's immutable 115-row baseline even in
 // standalone npm run catalog:check; schema-only empty catalogs are not this repo.
 const historicLock=JSON.parse(read('tests/fixtures/history-appendonly-baseline-20261024.json'));
 assert.equal(historicLock.schema,1,'history continuity fixture schema');
 assert.equal(historicLock.origin.digest,'SHA256(UTF8(JSON.stringify(parsed row)))');
 assert.ok(historicLock.rows.length>=115,'catalog may not weaken the baseline');
 assert.ok(catalog.history.length>=historicLock.rows.length,'historical rows deleted');
 for(let i=0;i<historicLock.rows.length;i++){
   const pinned=historicLock.rows[i];
   assert.equal(catalog.history[i].id,pinned.id,'historical row deleted or reordered at '+i);
   assert.equal(createHash('sha256').update(JSON.stringify(catalog.history[i]),'utf8').digest('hex'),pinned.sha256,
     'historical row tampered at '+i);
 }

const ids = new Set();
const historicalStatuses = new Set([
  'source-only', 'not-hosted', 'evidence-only', 'failed', 'reference',
  'validation-evidence-only', 'offline-projection-artifact-unattributed', 'build-succeeded-unreviewed'
]);
for (const item of catalog.history) {
  assert.ok(typeof item.id === 'string' && item.id.trim().length > 0, 'blank historical id');
  assert.equal(seen.has(item.id), false, 'duplicate build/history id ' + item.id);
  assert.equal(ids.has(item.id), false, 'duplicate historical item ' + item.id);
  ids.add(item.id);
  assert.ok(historicalStatuses.has(item.status), 'unverified or invalid history status ' + item.status);
  assert.match(item.source_commit, /^[a-f0-9]{40}$/, 'history requires immutable source SHA');
  if (item.source_tree !== undefined) assert.match(item.source_tree, /^[a-f0-9]{40}$/);
  if (item.firmware_subtree !== undefined) assert.match(item.firmware_subtree,/^[a-f0-9]{40}$/,'firmware subtree must be exact Git tree SHA');
  if (item.status === 'build-succeeded-unreviewed') {
    const x = item.build_pipeline;
    assert.ok(x && typeof x === 'object');
    assert.equal(x.build, 'BUILD_SUCCEEDED_UNREVIEWED');
    assert.equal(x.qa, 'QA_PENDING');
    assert.equal(x.installability, 'NOT_INSTALLABLE');
    assert.equal(x.live_http, 'NOT_VERIFIED');
    assert.equal(x.hardware, 'DEVICE_NOT_TESTED');
    assert.equal(x.source_scope, 'FIRMWARE_SUBTREE_MATCH_FULL_ROOT_NOT_ATTESTED');
    assert.match(x.evidence_commit, /^[a-f0-9]{40}$/);
    assert.match(x.evidence_manifest_blob_sha, /^[a-f0-9]{40}$/);
    assert.ok(Number.isInteger(x.builder_selected_host_checks_pass) && x.builder_selected_host_checks_pass > 0);
    assert.ok(Number.isInteger(x.followup_native_checks_pass) && x.followup_native_checks_pass >= 0);
    if(['integration-pr103-r10-native-elite-pro-20261024','integration-pr103-r14-native-elite-pro-20261024','producer-pr120-fresh-elite-pro-controller-20261024'].includes(item.id)) assert.deepEqual(x.followup_native_checks_fail,[],'no new full-root test failure recorded');
    else assert.ok(Array.isArray(x.followup_native_checks_fail) && x.followup_native_checks_fail.length > 0);
    if(item.id==='integration-pr103-smc79-native-build-20261024-r13') assert.deepEqual(x.followup_native_checks_fail.map(f=>f.name),["mixed-historical-seed:ble-midi-receive","mixed-historical-seed:smc-reachability","mixed-historical-seed:smc-mapping","mixed-historical-seed:smc-drum-mutes","mixed-historical-seed:smc-clip-visibility"]);
    for (const failure of x.followup_native_checks_fail) {
      assert.ok(typeof failure.name === 'string' && failure.name.length > 0);
      if(item.id==='integration-pr103-smc79-native-build-20261024-r13') assert.equal(failure.exit_code,null,'older mixed-test exits unrecorded');
      else assert.ok(Number.isInteger(failure.exit_code) && failure.exit_code !== 0);
    }
    assert.equal(x.package_bytes_independently_received_and_rehashed,item.artifact_bytes_independently_verified===true,'private bytes proof status');
    if(!['integration-pr103-smc79-native-build-20261024-r13','integration-pr103-r10-native-elite-pro-20261024','integration-pr103-r14-native-elite-pro-20261024','producer-pr120-fresh-elite-pro-controller-20261024'].includes(item.id)) assert.equal(item.artifact_bytes_independently_verified,false,'old native build lacked independent byte readback');
    assert.match(item.firmware_subtree, /^[a-f0-9]{40}$/);
    for (const model of ['elite','pro']) {
      const pkg = item.producer_reported_artifacts?.[model];
      assert.ok(pkg);
      assert.match(pkg.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isInteger(pkg.bytes) && pkg.bytes > 0);
    }
  }
  assert.ok(Array.isArray(item.models) && item.models.every(m => m === 'elite' || m === 'pro'),
    'history models must be Elite/Pro or empty');
  assert.equal(item.installable ?? false, false, 'history record cannot be flashable');
  assert.equal(item.device_verified ?? false, false, 'history item cannot assert unsupported physical PASS');
  assert.ok(item.url == null || (typeof item.url === 'string' &&
    /^https:\/\/github\.com\//.test(item.url)), 'history URL must be a trusted HTTPS GitHub link');
}
assert.doesNotMatch(text, /"pkg"\s*:|\.fwsc|ctl\.img|"download"\s*:/i);

const page = read('docs/builds/index.html');
const home = read('docs/index.html');
assert.match(home, /href="builds\/"/, 'nightly landing page must link build history');
assert.match(page, /fetch\('\.\.\/build-status\.json'/, 'read-only page must fetch the published status manifest');
assert.match(page, /role="status" aria-live="polite"/, 'history loading and errors need live status');
assert.match(page, /textContent/, 'history page must render JSON via textContent');
assert.doesNotMatch(page, /href=["'][^"']*\.fwsc/i, 'history must never link directly to firmware packages');
const js = page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(js, 'build history page must have its renderer');
new (await import('node:vm')).Script(js, {filename:'nightly-build-history.js'});

console.log('PASS: ' + catalog.builds.length + ' nightly builds + ' + catalog.history.length + ' history; no unapproved installer entries');
