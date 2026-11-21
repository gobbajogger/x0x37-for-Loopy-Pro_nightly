// Browser file UI, distinct from codec/model acceptance. Actual download/dialog QA remains required.
import{installWorkspaceDraft,hasDraftChanges,checkDraftFileSize}from'./draft-file.mjs';
export function bindDraftFiles({document,window,codec,state,getContext,restoreContext,cancel,render,status,download}){
 const $=id=>document.getElementById(id);let pending=null,serial=0,active=true;
 const clear=()=>{pending=null;$('draft-replace').disabled=true;};
 const dialog=$('draft-dialog');
 clear();
 // Escape cancels synchronously. The close event may arrive after a new file read starts.
 dialog.oncancel=()=>{serial++;clear();};
 dialog.onclose=()=>{if(!dialog.open)clear();};
 $('draft-save').onclick=()=>{if(!active)return;try{cancel();const text=codec.encode(codec.capture(state,getContext()));if(download)download(text);else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='DnBOX-local-draft-v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}status('Download requested. Keep the local draft file and reopen it to verify. Not a native project; not applied.');}catch(e){status(e.message);}};
 $('draft-file').onchange=async e=>{const own=++serial;clear();const f=e.target.files?.[0];e.target.value='';if(!f||!active)return;try{checkDraftFileSize(f.size);const text=await f.text();if(own!==serial||!active)return;const doc=codec.decode(text);pending=doc;$('draft-preview').textContent=`${doc.notes.length} notes · ${doc.parameters.length} parameter entries · ${doc.motion.values.filter(v=>v!==null).length} Motion points · ${doc.song.length} song rows. Exact source identity matches. Replace current local draft? Undo/Redo and clipboard will reset; original source stays separate. Save current work first. No native apply, playback or connected state.`;$('draft-replace').disabled=false;if(!$('draft-dialog').open)$('draft-dialog').showModal();}catch(error){if(own!==serial||!active)return;clear();$('draft-preview').textContent=error.message;if(!$('draft-dialog').open)$('draft-dialog').showModal();status(error.message);}};
 $('draft-cancel').onclick=()=>{serial++;clear();$('draft-dialog').close();};
 $('draft-replace').onclick=()=>{if(!pending||!active)return;try{cancel();const context=installWorkspaceDraft(state,codec,pending);restoreContext(context);serial++;clear();$('draft-dialog').close();render();status('Opened local draft. Undo/Redo and clipboard reset. Not connected or applied; keep your draft file.');}catch(e){status(e.message);}};
 window.addEventListener('pagehide',()=>{active=false;serial++;clear();$('draft-file').value='';if($('draft-dialog').open)$('draft-dialog').close();});
 window.addEventListener('pageshow',()=>{active=true;});
 window.addEventListener('beforeunload',event=>{if(hasDraftChanges(state,codec)){event.preventDefault();event.returnValue='';}});
}
