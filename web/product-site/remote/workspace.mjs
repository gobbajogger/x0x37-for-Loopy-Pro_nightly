export const PARTS=Object.freeze(['909','808','Bass A','Bass B','BREAK']);
export const DESTINATIONS=Object.freeze([['Projects','../projects/'],['Samples','../breaks/'],['Presets','../presets/'],['MIDI exchange','../projects/#project-exchange-root']]);
export class LaunchSelection{
 constructor(){this.targets=Array(5).fill(null);}
 choose(part,pattern){if(!Number.isInteger(part)||part<0||part>=5||!Number.isInteger(pattern)||pattern<0||pattern>=32)throw Error('Invalid launch target');this.targets[part]=pattern;return this.state(part);}
 state(part){return{part:PARTS[part],selected:this.targets[part],loaded:false,playing:false,pending:false};}
}
// Capture on the stable viewport before any callback can replace a note node.
export function bindRollPointers(viewport,{gesture,mode,point,paint,getScale,setScale,remove,admit=()=>true,inCapture=()=>true,barZoom=true}){
 const pointers=new Map();let navigation=null,blocked=false,tap=null,lastTap=null;
 const boundedScale=v=>Math.max(1,Math.min(4,Math.round(v*4)/4));
 const xy=e=>({x:e.clientX,y:e.clientY});
 const pair=()=>{const[a,b]=[...pointers.values()];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
 const release=e=>{pointers.delete(e.pointerId);if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);if(!pointers.size){blocked=false;navigation=null;}};
 const handlers={
  pointerdown(e){
   if(e.button!==0||!admit(e))return;viewport.setPointerCapture(e.pointerId);pointers.set(e.pointerId,xy(e));
   if(getScale&&pointers.size>1){gesture.cancel();tap=lastTap=null;blocked=true;if(pointers.size===2){const p=pair(),r=viewport.getBoundingClientRect();navigation={...p,left:r.left,top:r.top,scrollX:viewport.scrollLeft,scrollY:viewport.scrollTop,scale:getScale()};}else navigation=null;e.preventDefault();return;}
   if(blocked)return;
   if(!inCapture(e)){tap=lastTap=null;e.preventDefault();return;}
   const id=e.target.closest('[data-note]')?.dataset.note,edge=e.target.closest('[data-edge]')?.dataset.edge;
   tap=remove&&id?{id,...xy(e),time:e.timeStamp,moved:false}:null;
   gesture.down(e,{mode:edge?'length':mode(),edge,id,point:point(e),scroll:{x:viewport.scrollLeft,y:viewport.scrollTop}});e.preventDefault();paint();
  },
  pointermove(e){
   if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,xy(e));
   if(blocked){if(navigation&&pointers.size===2){const p=pair(),n=navigation,ratio=p.d/n.d;
    // Small distance fluctuations while panning must retain even an imported fractional zoom.
    if(Math.abs(Math.log2(ratio))>=0.5)n.pinching=true;
    const desired=n.scale*ratio;
    const scale=!n.pinching?n.scale:barZoom?2**Math.max(-3,Math.min(0,Math.round(Math.log2(desired)))):boundedScale(desired);
    if(getScale()!==scale)setScale(scale);
    viewport.scrollLeft=(n.scrollX+n.x-n.left)*scale/n.scale-(p.x-n.left);
    viewport.scrollTop=n.scrollY+n.y-p.y;}return;}
   if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>6)tap.moved=true;
   const p=gesture.move(e,point(e));if(p){viewport.scrollLeft=p.x;viewport.scrollTop=p.y;}
  },
  pointerup(e){
   if(!blocked){
    const t=tap;tap=null;
    if(t&&!t.moved&&e.timeStamp-t.time<300){
     gesture.cancel();
     if(lastTap&&lastTap.id===t.id&&e.timeStamp-lastTap.time<350&&Math.hypot(t.x-lastTap.x,t.y-lastTap.y)<12){remove(t.id);lastTap=null;paint();}
     else lastTap={...t,time:e.timeStamp};
    }else{lastTap=null;gesture.up(e);}
   }
   release(e);
  },
  pointercancel(e){tap=lastTap=null;navigation=null;blocked=true;gesture.cancelPointer(e);release(e);},
  lostpointercapture(e){if(pointers.has(e.pointerId)){tap=lastTap=null;navigation=null;blocked=true;gesture.cancelPointer(e);pointers.delete(e.pointerId);if(!pointers.size)blocked=false;}},
  wheel(e){
   if(!getScale)return;
   gesture.cancel();tap=lastTap=null;e.preventDefault();
   if(e.ctrlKey||e.metaKey){
    const x=e.clientX-viewport.getBoundingClientRect().left,before=getScale();
    const direction=Math.sign(e.deltaY);
    const after=before<1?Math.min(1,Math.max(1/8,before*2**(-direction))):boundedScale(before-direction*.25);
    const anchor=(viewport.scrollLeft+x)/before;
    setScale(after);viewport.scrollLeft=anchor*after-x;
   }else if(e.shiftKey){
    // Some browsers already remap the shifted wheel to deltaX.
    viewport.scrollLeft+=e.deltaX||e.deltaY;
   }else{
    viewport.scrollLeft+=e.deltaX;viewport.scrollTop+=e.deltaY;
   }
  }
 };
 for(const[k,fn]of Object.entries(handlers))viewport.addEventListener(k,fn,k==='wheel'?{passive:false}:undefined);
 const cancel=()=>{gesture.cancel();tap=lastTap=null;navigation=null;blocked=false;const ids=[...pointers.keys()];pointers.clear();for(const id of ids)if(viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);};
 const cleanup=()=>{cancel();for(const[k,fn]of Object.entries(handlers))viewport.removeEventListener(k,fn);};cleanup.cancel=cancel;cleanup.active=()=>pointers.size>0;return cleanup;
}
