import {OriginalPresetWorkingFile,downloadOriginalPreset} from './working-file.mjs';
export function mount(root,{read=file=>file.arrayBuffer(),download}={}){
 const working=new OriginalPresetWorkingFile();
 let disposed=false,paused=false,keptWarnings=[];
 const cleanups=[],q=id=>root.querySelector('#'+id),status=t=>q('status').textContent=t;
 const text=(id,value)=>{const node=q(id);if(node)node.textContent=value;};
 const reset=()=>{working.clearPreview();for(const id of ['keep','edit','original','preset','name'])q(id).disabled=true;q('preset').replaceChildren();q('name').value='';text('file-status','No file open.');text('format-notes',keptWarnings.join(' '));};
 const on=(id,type,fn)=>{const node=q(id),guarded=async(...args)=>{if(!disposed&&!paused)return fn(...args);};node.addEventListener(type,guarded);cleanups.push(()=>node.removeEventListener?.(type,guarded));};
 on('file','change',async()=>{
  reset();const file=q('file').files[0],profile=q('profile').value;if(!file)return;status('Opening '+file.name+'…');
  try{
   const doc=await working.open(file,profile,read);
   if(!doc||doc!==working.document||disposed||paused)return;
   const select=q('preset');doc.names.forEach((name,i)=>{const option=(root.ownerDocument??root).createElement('option');option.value=String(i);option.textContent=name;select.append(option);});
   select.value='0';q('name').value=doc.names[0]??'';
   q('keep').disabled=false;q('edit').disabled=!doc.count;q('name').disabled=!doc.count;q('preset').disabled=!doc.count;q('original').disabled=false;
   text('file-status',`${file.name} · ${doc.count} ${doc.count===1?'preset':'presets'}`);text('format-notes',doc.warnings.join(' '));
   status(doc.count?'File open. Rename a preset if you like, then keep this version.':'Bank open. There are no presets to rename; you can keep or download the original file.');
  }catch{if(!disposed&&!paused)status('Not imported. Choose a valid file for the selected format, up to 8 MiB.'+(working.hasKept?' Your kept copy is unchanged.':''));}
 });
 on('profile','change',()=>{reset();q('file').value='';status('Open a file for the selected format.');});
 on('preset','change',()=>{q('name').value=working.document?.names[Number(q('preset').value)]??'';});
 on('edit','click',()=>{
  try{working.rename(Number(q('preset').value),q('name').value);const doc=working.document;const options=q('preset').options??q('preset').children;for(let i=0;i<options.length;i++)options[i].textContent=doc.names[i];status('Name changed in this open file. Keep this version when ready.');}
  catch{status('Choose an existing preset and a valid name.');}
 });
 on('keep','click',()=>{const doc=working.document;if(!doc)return;working.keep();keptWarnings=[...doc.warnings];q('export').disabled=false;text('kept-status','Ready to download: '+working.keptName);status('Version kept in this tab. Download your copy to save it outside this page.');});
 on('cancel','click',()=>{reset();q('file').value='';status(working.hasKept?'Open file closed. Your kept copy is still ready to download.':'Open file closed. Choose another file when ready.');});
 on('original','click',()=>{working.download('original',download);});
 on('export','click',()=>{working.download('kept',download);});
 reset();
 return {canApply:false,suspend(){if(disposed)return;paused=true;reset();q('export').disabled=true;},resume(){if(disposed)return;paused=false;q('export').disabled=!working.hasKept;},destroy(){if(disposed)return;disposed=true;working.clear();keptWarnings=[];reset();q('export').disabled=true;for(const off of cleanups)off();}};
}
if(typeof document!=='undefined'){
 const app=mount(document,{download:downloadOriginalPreset});
 window.addEventListener('pagehide',event=>event.persisted?app.suspend():app.destroy());window.addEventListener('pageshow',event=>{if(event.persisted)app.resume();});
}
