// SPDX-License-Identifier: GPL-3.0-only
// Read-only frame observations from a caller-admitted owning session. Native time
// is deliberately ignored: it is not an admitted musical position or clock.
export function createRuntimePlayingState({onState=()=>{},now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let owner=null,state='unavailable',received=null,timer=null,serial=0;
 const publish=next=>{if(next!==state){state=next;onState(state);}};
 function invalidate(){++serial;if(timer!==null)clearTimer(timer);timer=null;received=null;publish('unavailable');}
 function close(){owner=null;invalidate();}
 function bind(port,pin){close();if(!port||!pin||typeof port!=='object'||typeof pin!=='object')throw Error('Owning runtime endpoint required');owner={port,pin};}
 function receive(message,port,pin){
  if(!owner||owner.port!==port||owner.pin!==pin||message?.type!=='frame')return;
  if((message.playing!==0&&message.playing!==1)||!(message.framebuffer instanceof Uint16Array)||message.framebuffer.length!==240*240){invalidate();return;}
  if(timer!==null)clearTimer(timer);const mine=++serial;received=now();publish(message.playing===1?'playing':'stopped');
  timer=setTimer(()=>{if(mine===serial&&owner)invalidate();},1000);
 }
 function snapshot(){if(received!==null&&now()-received>=1000)invalidate();return state;}
 return{bind,receive,close,snapshot};
}
