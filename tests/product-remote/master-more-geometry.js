// SPDX-License-Identifier: GPL-3.0-only
// Measurement only; assertions and artifacts live in the actual browser fixture.
(element) => {
 const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
 const intersect=(a,b,x=true,y=true)=>{const left=x?Math.max(a.left,b.left):a.left,right=x?Math.min(a.right,b.right):a.right,top=y?Math.max(a.top,b.top):a.top,bottom=y?Math.min(a.bottom,b.bottom):a.bottom;return{left,top,right,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)}};
 function measure(el){
  if(!el)return null;
  const full=rect(el.getBoundingClientRect());let effective=intersect(full,{left:0,top:0,right:innerWidth,bottom:innerHeight});const clips=[],unsupported=[];
  for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect(),sx=p.offsetWidth?r.width/p.offsetWidth:1,sy=p.offsetHeight?r.height/p.offsetHeight:1;
   const x=/^(hidden|clip|scroll|auto)$/.test(s.overflowX)||s.contain.split(' ').includes('paint'),y=/^(hidden|clip|scroll|auto)$/.test(s.overflowY)||s.contain.split(' ').includes('paint');
   if(s.clipPath!=='none'||s.clip!=='auto')unsupported.push({tag:p.tagName,id:p.id,clip:s.clip,clipPath:s.clipPath});
   if(x||y){const clip={left:r.left+p.clientLeft*sx,top:r.top+p.clientTop*sy,right:r.left+(p.clientLeft+p.clientWidth)*sx,bottom:r.top+(p.clientTop+p.clientHeight)*sy};effective=intersect(effective,clip,x,y);clips.push({tag:p.tagName,id:p.id,className:p.className,x,y,clip,scrollLeft:p.scrollLeft,scrollTop:p.scrollTop});}
  }
  const style=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);const texts=Array.from(range.getClientRects()).map(rect);const visible=style.visibility==='visible'&&style.display!=='none'&&Number(style.opacity)>0;
  return{full,effective,clips,unsupported,visible,fontSize:parseFloat(style.fontSize),text:el.textContent?.trim(),texts,overflow:el.scrollWidth>el.clientWidth+1};
 }
 const unit=measure(element),r=unit.effective;
 const inset=Math.min(8,r.width/4,r.height/4),points=[[r.left+inset,r.top+inset],[r.right-inset,r.top+inset],[r.left+inset,r.bottom-inset],[r.right-inset,r.bottom-inset],[(r.left+r.right)/2,(r.top+r.bottom)/2]];
 const hits=points.map(([x,y])=>{const at=document.elementFromPoint(x,y);return{x,y,owned:!!at&&(at===element||element.contains(at)),tag:at?.tagName,id:at?.id,className:at?.className}});
 const isField=element.tagName==='INPUT',label=isField?element.closest('label')?.querySelector('span'):element.querySelector('span:last-child'),value=isField?element.closest('label')?.querySelector('output'):element.querySelector('output'),glyph=isField?null:element.querySelector('.glyph canvas,.glyph svg');
 const s=getComputedStyle(element);
 return{identity:element.dataset.masterControl??element.id,unit,parts:{label:measure(label),value:measure(value),glyph:measure(glyph)},hits,focused:document.activeElement===element,focusVisible:element.matches(':focus-visible'),outline:{style:s.outlineStyle,width:parseFloat(s.outlineWidth),offset:parseFloat(s.outlineOffset),color:s.outlineColor},field:{value:element.value,min:element.min,max:element.max},viewport:{width:innerWidth,height:innerHeight}};
}
