#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Convert production draw traces to smooth SVG with original Barlow outlines.
Usage: vectorize.py TRACE FONT_DIRECTORY OUTPUT_DIRECTORY
Requires fontTools and Pillow; does not trace or enlarge raster images.
"""
import sys, math, html
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import ImageFont
trace, fonts, out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
roles={k:(f,p) for k,f,p in [('T','SemiBold',10),('XS','SemiBold',12),('S','Medium',15),('B','Bold',15),('M','SemiBold',23),('L','Bold',31)]}
cache={}
def color(c):
 c=int(c);return '#%02x%02x%02x'%(((c>>11)*255)//31,(((c>>5)&63)*255)//63,((c&31)*255)//31)
def glyph(role,ch):
 key=(role,ch)
 if key in cache:return cache[key]
 face,size=roles[role];path=fonts/f'BarlowSemiCondensed-{face}.ttf'
 f=TTFont(path);gs=f.getGlyphSet();name=f.getBestCmap()[ch]
 # gen_font.py folds uncommon lowercase letters into their uppercase glyphs.
 if role in ('XS','S','B') and 97<=ch<=122 and chr(ch) not in 'abdkmprstxz':name=f.getBestCmap()[ch-32]
 if 48<=ch<=57:
  for rec in f['GSUB'].table.FeatureList.FeatureRecord:
   if rec.FeatureTag=='tnum':
    for idx in rec.Feature.LookupListIndex:
     for sub in f['GSUB'].table.LookupList.Lookup[idx].SubTable:
      name=getattr(sub,'mapping',{}).get(name,name)
 pen=SVGPathPen(gs);gs[name].draw(pen)
 pil=ImageFont.truetype(str(path),size);asc,_=pil.getmetrics()
 top=max(0,pil.getbbox('A8|(')[1]-1)
 cache[key]=(pen.getCommands(),size/f['head'].unitsPerEm,asc-top)
 return cache[key]
canvas=[];screen=[];defs=[];serial=0;w=h=240
def clipped(shape,lo,hi):
 global serial
 serial+=1;ident=f'c{serial}';defs.append(f'<clipPath id="{ident}"><rect width="{w}" y="{lo}" height="{float(hi)-float(lo)}"/></clipPath>')
 return f'<g clip-path="url(#{ident})">{shape}</g>'
def arcpath(cx,cy,r,lo,hi):
 def pt(t):a=2*math.pi*(.375+.75*t);return cx+r*math.cos(a),cy+r*math.sin(a)
 a,b=pt(lo),pt(hi)
 return f'M{a[0]:.6f},{a[1]:.6f} A{r},{r} 0 {int((hi-lo)*.75>.5)} 1 {b[0]:.6f},{b[1]:.6f}'
for line in trace.read_text().splitlines():
 if not line.startswith('V '):continue
 a=line.split();op=a[1];v=a[2:]
 if op=='BEGIN':
  w,h,c=map(int,v);canvas=[f'<rect width="{w}" height="{h}" fill="{color(c)}"/>'];continue
 if op=='FILL':
  x,y,ww,hh,c=v
  if x=='0' and y=='0' and ww=='240' and hh=='240':screen=[]
  screen.append(f'<rect x="{x}" y="{y}" width="{ww}" height="{hh}" fill="{color(c)}"/>');continue
 if op=='BLIT':
  x,y=v;screen.append(f'<g transform="translate({x} {y})">'+''.join(canvas)+'</g>');continue
 if op=='SHOT':
  name=Path(v[0]).stem
  svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="'+html.escape(name)+' firmware screen"><defs>'+''.join(defs)+'</defs><rect width="240" height="240" fill="#000"/>'+''.join(screen)+'</svg>\n'
  (out/(name+'.svg')).write_text(svg);continue
 if op=='TEXT':
  x,y,role,c,lo,hi=v[:6];x=float(x);y=float(y);shapes=[]
  for item in v[6:]:
   ch,adv=map(int,item.split(':'));d,scale,base=glyph(role,ch)
   shapes.append(f'<path d="{d}" transform="translate({x:g} {y+base:g}) scale({scale:g} {-scale:g})"/>');x+=adv
  shape=f'<g fill="{color(c)}">'+''.join(shapes)+'</g>'
 else:
  lo,hi=v[-2:];n=list(map(float,v[:-2]))
  if op in ('RECT','RBOX','RFRAME'):
   x,y,ww,hh=n[:4];c=n[-1];r=min(n[4],ww/2,hh/2,8) if op!='RECT' else 0
   if op=='RFRAME':x+=.5;y+=.5;ww-=1;hh-=1;r=max(0,r-.5)
   shape=f'<rect x="{x:g}" y="{y:g}" width="{ww:g}" height="{hh:g}" rx="{r:g}" '+(f'fill="none" stroke="{color(c)}"' if op=='RFRAME' else f'fill="{color(c)}"')+'/>'
  elif op=='LINE':
   x,y,xx,yy,c=n;shape=f'<path d="M{x+.5},{y+.5}L{xx+.5},{yy+.5}" fill="none" stroke="{color(c)}" stroke-linecap="square"/>'
  elif op=='DISC':
   x,y,r,c=n;shape=f'<circle cx="{x:g}" cy="{y:g}" r="{r:g}" fill="{color(c)}"/>'
  elif op=='ARC':
   x,y,r,value,track,fill,bipolar=n;rr=r-1.7
   low=min(value,.5) if bipolar else 0;high=max(value,.5) if bipolar else value
   shape=f'<path d="{arcpath(x+.5,y+.5,rr,0,1)}" fill="none" stroke="{color(track)}" stroke-width="3.4" stroke-linecap="round"/>'
   if high>low:shape+=f'<path d="{arcpath(x+.5,y+.5,rr,low,high)}" fill="none" stroke="{color(fill)}" stroke-width="3.4" stroke-linecap="round"/>'
   angle=2*math.pi*(.375+.75*value);cx=x+rr*math.cos(angle);cy=y+rr*math.sin(angle)
   shape+=f'<circle cx="{cx:g}" cy="{cy:g}" r="3" fill="#000"/><circle cx="{cx:g}" cy="{cy:g}" r="2.3" fill="#fff"/>'
  else:raise ValueError(op)
 canvas.append(clipped(shape,lo,hi))
