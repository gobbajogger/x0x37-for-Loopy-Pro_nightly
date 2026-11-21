"""Compile the public native KIT glyph branch and capture its slot geometry."""
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

COMMIT='9dd6f2df020340f7a82ab241ef07c6ec16195ebc'
SOURCE='firmware/src/app/ui_drum_voice.inc'
SHA256='9fed48b3c5546014970ba7360f6b8ebb0ebca11a45dd7b379c0e7fd040256894'
HEADER=r'''
#include <stdio.h>
#include <stdint.h>
#include <string.h>
enum {DG_ACCENT=1,T_808=1,PART_808=1,D8_CP=6,GR_KIT=2};
#define DV_ACTIVE_SINGLE_SCALE 1.8f
static struct {int sel[2];} ui;
static struct {int n;int group[1];} pg={1,{GR_KIT}};
static int cur_page(void){return 0;}
static int name_is(const char *name,const char *expected){return !strcmp(name,expected);}
static void cv_line_aa(float x0,float y0,float x1,float y1,uint16_t col){
 (void)col;printf(" %.8f %.8f %.8f %.8f",x0,y0,x1,y1);
}
static void dg_accent(int x,int y,int w,int h,float q,int live,float e,uint16_t col){
 (void)x;(void)y;(void)w;(void)h;(void)q;(void)live;(void)e;(void)col;printf(" PEAKS");
}
static void capture(int kit,int voice,float scale,int raw) {
 struct {int a;} r={kit};
 const char *d=kit==T_808?"Accent":"Veloc";
 int role=DG_ACCENT,i,live=0;float q=(float)raw/127.f,ox=0,oy=0,sx=scale,sy=scale,e=0;
 uint16_t col=0;
 ui.sel[PART_808]=voice;
'''
MAIN=r'''
}
int main(void){
 for(int kit=0;kit<2;kit++)for(int raw=0;raw<=127;raw++){
  printf("%d %d",kit,raw);capture(kit,0,1.f,raw);putchar(10);
 }
 printf("selected808");capture(1,0,1.8f,127);putchar(10);
 printf("selected808clap");capture(1,D8_CP,1.8f,127);putchar(10);
}
'''
source=Path(sys.argv[1])
data=source.read_bytes() if source.is_file() else subprocess.check_output(['git','-C',str(source),'show',COMMIT+':'+SOURCE])
assert hashlib.sha256(data).hexdigest()==SHA256
text=data.decode()
start=text.index('    if (role == DG_ACCENT) {',text.index('static UI_DRAW void dv_glyph('))
end=text.index('    if (role == DG_SNAPPY',start)
with tempfile.TemporaryDirectory() as work:
    inp=Path(work)/'kit.c';binary=Path(work)/'kit'
    inp.write_text(HEADER+text[start:end]+MAIN)
    subprocess.run(['cc','-std=c11','-O2','-Wall','-Werror',str(inp),'-o',str(binary)],check=True)
    output=subprocess.check_output([binary]).decode().splitlines()
    assert output[-2]=='selected808 PEAKS'
    assert output[-1].startswith('selected808clap ') and len(output[-1].split())==17
    Path(sys.argv[2]).write_text('\n'.join(output)+'\n')
