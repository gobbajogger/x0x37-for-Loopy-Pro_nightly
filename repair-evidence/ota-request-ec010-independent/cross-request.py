import importlib.util,json,sys,subprocess,random
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(root/'ota-request-firmware/tools'))
import fm1_install as I
spec=importlib.util.spec_from_file_location('primary','/Users/mac/Documents/smk37 firmware reverse-engineered/analysis/scripts/sinco_packet.py')
P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)
def frame(fl=0,addr=0,n=8):return P.sysex_encode(P.sinco_update_request(fl,addr,n))
cases=[]
def add(label,p,want):
 assert I.parse_request(p)==(tuple(want.values()) if want is not None else None),label
 cases.append(dict(label=label,frame=list(p),expected=want))
rng=random.Random(1010)
for j in range(100):
 fl,addr,n=rng.randrange(256),rng.randrange(2**32),rng.randrange(2**24)
 add(f'valid full-width fields {j}',frame(fl,addr,n),dict(fl=fl,addr=addr,len=n))
for fl,addr,n in [(0,0,8),(255,2,4),(0,0xe0000000,0),(0,0xf0000000,0),(255,0xffffffff,0xffffff)]:add('valid boundary',frame(fl,addr,n),dict(fl=fl,addr=addr,len=n))
for label,g in [('data',frame()),('finish',frame(addr=I.FINISH_WRITE,n=0))]:
 for i in range(len(g)):
  for bit in range(8):
   p=bytearray(g);p[i]^=1<<bit;add(f'{label} byte{i} bit{bit}',p,None)
 for end in range(len(g)):add(f'{label} truncation {end}',g[:end],None)
 for i in range(1,len(g)):
  add(f'{label} inserted zero {i}',g[:i]+b'\0'+g[i:],None)
for n in [0,7,9,0x108,0x10008,0xffffff]+[8^(1<<b) for b in range(24)]:
 u=bytearray(P.sinco_update_request(0,0,8));u[3:6]=n.to_bytes(3,'little');add(f'declared length {n}',P.sysex_encode(u),None)
neg=[c['frame'] for c in cases if c['expected'] is None]
class Link:
 lost=False
 def __init__(self,ps):self.ps=list(ps);self.sent=[]
 def read(self,_timeout):return self.ps.pop(0) if self.ps else None
 def send(self,p):self.sent.append(list(p));return True
l=Link(neg+[frame(addr=I.FINISH_WRITE,n=0)])
progress=[]
assert I.Updater(None).serve(l,bytes(range(16)),I.FINISH_WRITE,1,lambda *a:progress.append(a))==(0,True,False)
assert not progress and len(l.sent)==1
l=Link([frame(0x81,1,4),frame(0x7f,8,8),frame(addr=I.FINISH_WRITE,n=0)])
assert I.Updater(None).serve(l,bytes(range(16)),I.FINISH_WRITE,1,lambda *a:None)==(2,True,False)
for packet,fl,addr,n in zip(l.sent[:2],(0x81,0x7f),(1,8),(4,8)):
 u=P.sysex_decode(bytes(packet));assert u[6]==fl and int.from_bytes(u[7:11],'little')==addr and u[14:-1]==bytes(range(addr,addr+n))
r=subprocess.run(['node',str(root/'ota-request-review/cross-request.mjs'),str(root/'ota-request-site/web/fm1ota.js'),str(root/'ota-request-firmware/web/fm1ota.js')],input=json.dumps(dict(cases=cases,replies=l.sent)),text=True,capture_output=True)
print(r.stdout,end='');print(r.stderr,end='');assert r.returncode==0
print(f'PASS Python actual parser: {len(cases)} primary-encoder cases ({len(cases)-len(neg)} valid/{len(neg)} refused); actual serve refuses entire malformed batch before any data; canonical two-chunk field/data fidelity and finish PASS')
