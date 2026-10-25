#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Instrument an ISOLATED production-source copy for vector draw-command capture.
Never run against the firmware checkout. This is host-only evidence tooling.
Usage: trace-renderer.py ISOLATED_COPY
Then run its existing renderer_capture.sh or catalog_capture.sh and retain stdout.
Drawing interception leaves layout/state/metrics intact, but substitutes output;
the unmodified native PNG captures remain the independent visual reference.
"""
import re, sys
from pathlib import Path
r=Path(sys.argv[1])
def intercept(path,name,code):
 s=path.read_text()
 pat=r'(static\s+(?:inline\s+)?(?:void|int32_t)\s+'+name+r'\([^;]*?\)\s*\{)'
 s,n=re.subn(pat,lambda m:m[0]+'\n'+code+'\n',s,count=1)
 assert n==1,name
 path.write_text(s)
g=r/'firmware/src/gfx.c';u=r/'firmware/src/app/ui.c';h=r/'host/x0x_host.c'
intercept(g,'cv_begin','printf("V BEGIN %u %u %u\\n",w,h,bg);')
intercept(g,'cv_blit','printf("V BLIT %u %u\\n",x,y);')
intercept(g,'cv_rect','printf("V RECT %d %d %d %d %u %d %d\\n",x,y+cv_oy,w,h,c,cv_y0,cv_y1); return;')
intercept(g,'cv_line','printf("V LINE %d %d %d %d %u %d %d\\n",x0,y0+cv_oy,x1,y1+cv_oy,c,cv_y0,cv_y1); return;')
intercept(g,'cv_text',r'''
const char *role=f==&FONT_T?"T":f==&FONT_XS?"XS":f==&FONT_S?"S":f==&FONT_B?"B":f==&FONT_M?"M":"L";
printf("V TEXT %d %d %s %u %d %d",x,y+cv_oy,role,c,cv_y0,cv_y1);
int32_t end=x;
for(const char *t=s;*t;t++){unsigned gi=glyph(f,(uint8_t)*t); printf(" %u:%u",gi+f->first,f->adv[gi]);end+=f->adv[gi];}
puts(""); return end;
''')
intercept(u,'rbox','printf("V RBOX %d %d %d %d %d %u %d %d\\n",x,y+cv_oy,w,h,r,c,cv_y0,cv_y1); return;')
intercept(u,'rframe','printf("V RFRAME %d %d %d %d %d %u %d %d\\n",x,y+cv_oy,w,h,r,c,cv_y0,cv_y1); return;')
intercept(u,'disc','printf("V DISC %f %f %f %u %d %d\\n",cx,cy+cv_oy,r,c,cv_y0,cv_y1); return;')
intercept(u,'arc','printf("V ARC %d %d %d %f %u %u %d %d %d\\n",cx,cy+cv_oy,r,v,track,fill,bipolar,cv_y0,cv_y1); return;')
intercept(h,'lcd_fill','printf("V FILL %u %u %u %u %u\\n",x,y,w,h,c);')
intercept(h,'png_write','printf("V SHOT %s\\n",path);')

for name in ("cv_commit","cv_commit_rect"):
 intercept(u,name,'printf("V BLIT %u %u\\n",x,y); return;')
