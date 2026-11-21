#include <assert.h>
#include <stdio.h>
#include "motion.h"
static int last=-1, target, voice, index;
static int base(void *ctx,int t,int v,int i){return t==3?127:32;}
static void apply(void *ctx,int t,int v,int i,int val){last=val;target=t;voice=v;index=i;}
int main(void){
    static lane_t lanes[NLANE];static motion_t m;
    motion_init(&m,lanes);m.base=base;m.apply=apply;
    for(int part=2;part<5;++part)for(int pat=0;pat<32;++pat){
        const int t=part==4?3:2,v=part==4?0:part-2,i=part==4?0:2;
        int k=motion_alloc(lanes,pat,part,t,v,i);
        assert(k>=0 && motion_find(lanes,pat,part,t,v,i)==k);
        for(unsigned n=0;n<64;++n)assert(lanes[k].val[n]==MOT_NONE);
        for(int s=0;s<16;s++)for(int raw=0;raw<=127;raw++){
            lanes[k].val[s]=(uint8_t)raw;motion_step(&m,part,pat,s,(s+1)%16,16);
            assert(last==raw && target==t && voice==v && index==i);
            lanes[k].val[s]=MOT_NONE;motion_step(&m,part,pat,s,(s+1)%16,16);
            assert(last==base(NULL,t,v,i));
        }
    }
    assert(motion_count(lanes)==96);
    puts("PASS 96 unique part/pattern/catalog addresses, 196608 applied value points and 196608 cell clears restoring the base, 64 source steps per lane (16 exposed).");
}
