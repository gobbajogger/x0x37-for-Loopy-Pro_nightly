// Local arrangement references only; no playback, cue or native Song transaction.
import {MAX_SONG_ROWS} from './sequence.mjs';
import {PARTS} from './workspace.mjs';
function partCell(row,index,part,pattern){
 const label=`Song row ${index+1} ${PARTS[part]}`,on=!((row.muteMask??0)&(1<<part));
 const options=Array.from({length:32},(_,n)=>`<option value="${n}"${n===pattern?' selected':''}>P${String(n+1).padStart(2,'0')}</option>`).join('');
 return `<td><div class="song-part-cell"><select data-song-pattern="${index}" data-song-part="${part}" aria-label="${label} pattern">${options}</select><button type="button" role="switch" aria-checked="${on}" aria-label="${label} on" data-song-on="${index}" data-song-part="${part}">${on?'On':'Off'}</button></div></td>`;
}
export function renderSong(rows,selected){
 const valid=Number.isInteger(selected)&&selected>=0&&selected<rows.length;
 const button=(id,label,disabled=false)=>`<button type="button" id="${id}"${disabled?' disabled':''}>${label}</button>`;
 return '<h2>Song · Draft</h2><div class="song-actions">'+button('song-add','Add launch selection',rows.length>=MAX_SONG_ROWS)+button('song-up','Move row up',!valid||selected===0)+button('song-down','Move row down',!valid||selected===rows.length-1)+button('song-remove','Remove selected row',!valid)+button('song-review','Review draft')+button('song-undo','Undo')+button('song-redo','Redo')+'</div><div class="song-scroll" tabindex="0" aria-label="Song row controls"><table class="song-table" aria-label="Draft song rows"><thead><tr><th scope="col">Row</th>'+PARTS.map(p=>'<th scope="col">'+p+'</th>').join('')+'<th scope="col">Repeats</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr><th scope="row"><label class="song-row-choice"><input type="radio" name="song-selected" data-song-select="'+i+'" aria-label="Select song row '+(i+1)+'"'+(selected===i?' checked':'')+'><span>'+(i+1)+'</span></label></th>'+row.patterns.map((pattern,part)=>partCell(row,i,part,pattern)).join('')+'<td><input type="number" data-song-row="'+i+'" aria-label="Song row '+(i+1)+' repeats" min="1" max="8" value="'+row.repeats+'"></td></tr>').join('')+'</tbody></table></div>';
}
