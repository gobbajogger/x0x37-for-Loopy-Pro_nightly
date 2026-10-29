import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareLoopImport,userSlotRaw,parseHeader,RATE } from '../../sample-oldschool-site/web/x0x_breaks.js';
const rows=[];
for(const factor of [1,1.5,2,3,4]){
 for(let variant=0;variant<2;variant++){
  const x=Float32Array.from({length:176400},(_,n)=>{
   const j=Math.floor(n/11025),t=(n-j*11025)/RATE,len=.25,hz=(variant?250:300)*2**(j/8);
   let env=Math.exp(-t/.12);if(t<.001)env*=Math.sin(.5*Math.PI*t/.001)**2;
   if(len-t<.003)env*=(len-t)/.003;return(20000/32768)*env*Math.sin(2*Math.PI*hz*t);
  });
  const loop=prepareLoopImport(x,RATE,{bars:false,gritFactor:factor}),{hdr,data}=userSlotRaw('HOST',[loop],122880);
  const img=new Uint8Array(512+data.length).fill(255);img.set(hdr);img.set(data,512);
  const file=new URL(`factor-${factor}-${variant}.bin`,import.meta.url);writeFileSync(file,img);
  const h=parseHeader(img);rows.push({factor,variant,n:h.zones[0].n,rate:h.zones[0].rate,payload:data.length,sha256:createHash('sha256').update(img).digest('hex'),file:file.pathname});
 }
}
writeFileSync(new URL('banks.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
