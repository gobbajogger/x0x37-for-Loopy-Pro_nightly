// SPDX-License-Identifier: GPL-3.0-only
import test from'node:test';import{execFileSync}from'node:child_process';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync,linkSync,unlinkSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';import{buildProductSite}from'../scripts/build-product-site.mjs';
import {runFifoOperation} from './fixtures/fifo-operation.mjs';
function fixture(){const root=mkdtempSync(join(tmpdir(),'dnbox-product-source-')),src=join(root,'web/product-site');mkdirSync(src,{recursive:true});writeFileSync(join(src,'index.html'),'<h1>DnBOX</h1>');const m={schema:'dnbox-product-site-source/1',publicationQualified:false,files:[{path:'index.html',bytes:14,sha256:createHash('sha256').update('<h1>DnBOX</h1>').digest('hex')}]};writeFileSync(join(src,'SOURCE-MANIFEST.json'),JSON.stringify(m));return{root,src,m,save(){writeFileSync(join(src,'SOURCE-MANIFEST.json'),JSON.stringify(m))}}}
test('normal deterministic source build/check never changes Pages/catalog/source',()=>{const f=fixture();mkdirSync(join(f.root,'docs'));writeFileSync(join(f.root,'docs/versions.json'),'protected');const r=buildProductSite({repoRoot:f.root});assert.equal(r.files,1);assert.equal(r.published,false);assert.equal(readFileSync(join(f.root,'docs/versions.json'),'utf8'),'protected');assert.equal(buildProductSite({repoRoot:f.root,check:true}).files,1)});
test('unsafe destinations and malformed paths fail closed',()=>{for(const dest of['docs','docs/sub','web','web/sub','.git','']){const f=fixture();assert.throws(()=>buildProductSite({repoRoot:f.root,output:join(f.root,dest)}),/Unsafe|cannot/)}for(const p of['../bad','/bad','a/../b','a\\b','a//b']){const f=fixture();f.m.files[0].path=p;f.save();assert.throws(()=>buildProductSite({repoRoot:f.root}),/path/);}});
test('private/binary assets, duplicate inputs and symlinks are refused',()=>{for(const ext of['wav','fwsc','fsmp','elf','bin']){const f=fixture();f.m.files[0].path='secret.'+ext;writeFileSync(join(f.src,'secret.'+ext),'<h1>DnBOX</h1>');f.save();assert.throws(()=>buildProductSite({repoRoot:f.root}),/private/);}const f=fixture();f.m.files.push(f.m.files[0]);f.save();assert.throws(()=>buildProductSite({repoRoot:f.root}),/duplicate/);const g=fixture();symlinkSync('/etc/hosts',join(g.src,'other'));g.m.files[0].path='other';g.save();assert.throws(()=>buildProductSite({repoRoot:g.root}),/symlink/)});
test('source ancestor symlink and output symlink never escape the scoped build tree',()=>{const f=fixture(),outside=mkdtempSync(join(tmpdir(),'dnbox-build-outside-'));writeFileSync(join(outside,'index.html'),'<h1>DnBOX</h1>');symlinkSync(outside,join(f.src,'linked'));f.m.files[0].path='linked/index.html';f.save();assert.throws(()=>buildProductSite({repoRoot:f.root}),/symlink/);const g=fixture();mkdirSync(join(g.root,'.output'));symlinkSync(outside,join(g.root,'.output/product-site'));assert.throws(()=>buildProductSite({repoRoot:g.root}),/symlink/);assert.throws(()=>buildProductSite({repoRoot:g.root,output:outside}),/scoped/)});
test('a stale unrelated output is not silently carried into a later publisher input',()=>{const f=fixture(),out=join(f.root,'.output/product-site');mkdirSync(out,{recursive:true});writeFileSync(join(out,'unrelated-private.wav'),'private');assert.throws(()=>buildProductSite({repoRoot:f.root}),/unexpected output/);assert.equal(existsSync(join(out,'index.html')),false);assert.equal(readFileSync(join(out,'unrelated-private.wav'),'utf8'),'private')});
test('recognized output hardlink cannot overwrite a protected synthetic catalog',()=>{const f=fixture(),out=join(f.root,'.output/product-site');mkdirSync(out,{recursive:true});mkdirSync(join(f.root,'docs'));const catalog=join(f.root,'docs/versions.json');writeFileSync(catalog,'protected');linkSync(catalog,join(out,'index.html'));assert.throws(()=>buildProductSite({repoRoot:f.root}),/hardlink/);assert.equal(readFileSync(catalog,'utf8'),'protected')});

test('recognized output special files refuse without opening or blocking',()=>{const f=fixture(),out=join(f.root,'.output/product-site');mkdirSync(out,{recursive:true});execFileSync('mkfifo',[join(out,'index.html')]);assert.throws(()=>buildProductSite({repoRoot:f.root}),/Regular output/);});

function manifestOperation(module, repoRoot, options={}) {
 return runFifoOperation(
  `const {buildProductSite}=await import(${JSON.stringify(module)});`,
  `buildProductSite({repoRoot:${JSON.stringify(repoRoot)}})`,
  {operationMs:500, ...options},
 );
}
function fifoManifest(){const f=fixture(),manifest=join(f.src,'SOURCE-MANIFEST.json');unlinkSync(manifest);execFileSync('mkfifo',[manifest]);return f;}
// The actual manifest must be checked before readFileSync, not just its assets.
test('FIFO manifest rejects after import-ready without blocking the operation',async t=>{
 const f=fifoManifest(),module=new URL('../scripts/build-product-site.mjs',import.meta.url).href,run=await manifestOperation(module,f.root);
 t.diagnostic(JSON.stringify(run));assert.equal(run.ready,true,JSON.stringify(run));assert.equal(run.operationStarted,true,JSON.stringify(run));assert.equal(run.timedOut,null,JSON.stringify(run));assert.equal(run.code,0,JSON.stringify(run));assert.equal(run.result?.outcome,'threw');assert.match(run.result?.message,/Regular source manifest/);assert.equal(existsSync(join(f.root,'.output')),false);
});
test('slow child startup does not consume the500ms FIFO operation watchdog',async t=>{
 const f=fifoManifest(),module=new URL('../scripts/build-product-site.mjs',import.meta.url).href,run=await manifestOperation(module,f.root,{startupDelayMs:650});
 t.diagnostic(JSON.stringify(run));assert.ok(run.startupElapsedMs>=650,JSON.stringify(run));assert.equal(run.timedOut,null,JSON.stringify(run));assert.match(run.result?.message,/Regular source manifest/);assert.equal(existsSync(join(f.root,'.output')),false);
});
test('symlink manifest refuses without reading an outside manifest',()=>{
 const f=fixture(),manifest=join(f.src,'SOURCE-MANIFEST.json'),outside=join(f.root,'outside.json');writeFileSync(outside,JSON.stringify(f.m));unlinkSync(manifest);symlinkSync(outside,manifest);
 assert.throws(()=>buildProductSite({repoRoot:f.root}),/symlink/);assert.equal(existsSync(join(f.root,'.output')),false);
});


test('build uses current editable source and check detects stale output', () => {
 const f=fixture(),path=join(f.src,'index.html');
 for(const text of ['<h1>Other</h1>','<h1>A longer musician-facing page</h1>']){
  writeFileSync(path,text);
  const {output}=buildProductSite({repoRoot:f.root});
  assert.equal(readFileSync(join(output,'index.html'),'utf8'),text);
  buildProductSite({repoRoot:f.root,check:true});
 }
 writeFileSync(path,'<h1>A newer page</h1>');
 assert.throws(()=>buildProductSite({repoRoot:f.root,check:true}),/Product output differs: index.html/);
});

test('built catalog renames only legacy transport fields and preserves pinned package metadata',()=>{
 const f=fixture();
 const legacyRoot='https://gobbajogger.github.io/x0x37-for-Loopy-Pro_nightly';
 const source={
  repo:'https://github.com/gobbajogger/x0x37-for-Loopy-Pro_nightly',
  pages:legacyRoot+'/',
  latest:'eligible',
  versions:[
   {version:'eligible',status:'dev-checked',evidence_url:'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/pull/869',models:{
    elite:{pkg:legacyRoot+'/artifacts/elite.fwsc',sha256:'a'.repeat(64),size:651732},
    pro:{pkg:legacyRoot+'-another/artifacts/pro.fwsc',sha256:'b'.repeat(64),size:651712},
   }},
   {version:'historical',models:{elite:{pkg:'https://raw.githubusercontent.com/gobbajogger/X0X37-for-Loopy-Pro/abc/file.fwsc'}},notes:legacyRoot+'/historical',evidence_url:'https://api.github.com/repos/gobbajogger/x0x37-for-Loopy-Pro_nightly/pulls/10/reviews/5638858728'},
  ],
 };
 const bytes=JSON.stringify(source,null,2)+'\n';
 writeFileSync(join(f.src,'versions.json'),bytes);
 f.m.files.push({path:'versions.json',bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')});f.save();
 const {output}=buildProductSite({repoRoot:f.root});
 const expected=structuredClone(source);
 expected.repo='https://github.com/gobbajogger/DnBOX-nightly';
 expected.pages='https://gobbajogger.github.io/DnBOX-nightly/';
 expected.versions[0].evidence_url='https://github.com/gobbajogger/DnBOX/pull/869';
 expected.versions[0].models.elite.pkg=expected.pages+'artifacts/elite.fwsc';
 expected.versions[1].models.elite.pkg='https://raw.githubusercontent.com/gobbajogger/DnBOX/abc/file.fwsc';
 expected.versions[1].evidence_url='https://api.github.com/repos/gobbajogger/DnBOX-nightly/pulls/10/reviews/5638858728';
 assert.deepEqual(JSON.parse(readFileSync(join(output,'versions.json'),'utf8')),expected);
 assert.equal(readFileSync(join(f.src,'versions.json'),'utf8'),bytes);
 buildProductSite({repoRoot:f.root,check:true});
});
