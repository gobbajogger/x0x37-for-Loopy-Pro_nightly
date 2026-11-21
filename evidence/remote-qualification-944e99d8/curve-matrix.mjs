import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const [repo,out] = process.argv.slice(2);
const root=resolve(repo,'web/product-site/remote');
const lib=await import(pathToFileURL(join(root,'drum-strip.mjs')));
const records=JSON.parse(readFileSync(join(root,'components.json'))).screens.filter(s=>s.successor?.recomposedDrum);
const catalog=JSON.parse(readFileSync(join(root,'catalog.json'))).controls;
const hash=s=>createHash('sha256').update(s).digest('hex');
const results=[];
for(const screen of records) {
 const trees=[...screen.body_svg.matchAll(/<g\b[^>]*data-glyph-semantic="[^"]+"[^>]*>(?:<path\b[^>]*\/>)+<\/g>/g)].map(m=>m[0]);
 if(trees.length!==screen.controls.length) throw new Error(screen.path);
 for(const [i,control] of screen.controls.entries()) {
  const [,target,voice,parameter]=control.identity.split(':').map(Number);
  const descriptor=catalog.find(c=>c.target===target&&c.voice===voice&&c.parameter===parameter&&c.kind!=='HELD');
  if(!descriptor)throw Error(control.identity);
  const raw=[descriptor.min,descriptor.max], shapes=[],values=[];
  const extractedPath=trees[i].match(/<path\b[^>]*\bd="([^"]*)"/)?.[1];
  if(!extractedPath)throw Error('Source path missing '+control.identity);
  for(const value of raw) {
   let path=extractedPath;
   const glyph={setAttribute(){},querySelector:()=>({setAttribute(k,v){if(k==='d')path=v;}})};
   lib.paintDrumGlyph?.({querySelectorAll:()=>[glyph]},control,value,descriptor.max);
   shapes.push(hash(path));values.push(lib.drumValueText(control,value));
  }
  results.push({path:screen.path,identity:control.identity,label:control.context.name,range:raw,values,shapeHashes:shapes,changed:shapes[0]!==shapes[1]});
 }
}
const summary={commit:execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),input:'Exact production renderer in Node over source subtrees and catalogue limits. First source path measured. Static artwork retained if this revision has no value-paint operation.',screens:records.length,readouts:results.filter(r=>r.values[0]!==r.values[1]).length,total:results.length,changed:results.filter(r=>r.changed).length};
writeFileSync(out,JSON.stringify({summary,results},null,2)+'\n');console.log(summary);
