// @ts-nocheck
// Minimi Town street renderer: one canvas, a 1280×800 stage scaled to fit.
// Ported from the design mockup: buildings, the penguin, themes, playtime
// tiers. Steam data comes in through setGames(); everything the street wants
// to do outside itself (sounds, launching, the HUD) goes out through `host`.
// Plain canvas code, typed loosely on purpose (it is drawing code).

export type TownStatus = "recent" | "new" | "dusty" | "closed" | "downloading" | "ready";
export interface TownGame {
  appid: number;
  name: string;
  status: TownStatus;
  progress: number;   // 0–100 while downloading
  hours: number;      // total playtime
  sign: string;       // short label for the neon sign
  art: string[];      // wide art candidates (header / wide capsule), first that loads wins
  capsule: string[];  // tall library capsule candidates
  icon?: string[];    // the game's square icon (on the back of the screen)
  info?: TownInfo;    // the icon info row on the shop's sign
}
export interface TownInfo {
  play: string;            // playtime ("" while unknown)
  last: string | null;     // last played ("2 days ago")
  ach: [number, number] | null; // achievements unlocked / total
  friends: string | null;  // friends in game right now
}
export interface TownHost {
  lang: "ko" | "en";
  tiers: string[];
  theme: "town" | "neon";
  sky: "auto" | "day" | "dusk" | "night";
  cardStyle: "wide" | "capsule";
  lampDim?: number;    // brightness of the lamps away from the picked shop (0–1)
  penguin?: boolean;   // false = no penguin on the street (Ⓐ opens the game's page straight away)
  mood: number;
  sound(kind: string): void;      // tick, door, boing, splat, poke, pet, angry, yawn, bang
  haptic(strength: number): void;
  saveMood(mood: number): void;
  onSelect(i: number): void;      // selection changed
  onInstall(i: number): void;     // Ⓐ on a game that isn't installed
  onEntered(i: number): void;     // the penguin went through the door
  onFrame?(box: any): void;       // every frame: the picked building's position (stage px)
}

export function createTown(cv: HTMLCanvasElement, host: TownHost) {
'use strict';
const W=1280,H=800,SIDE=628,FEET=666,SP=360,R=30; // street sits low: room for the title above
const view=cv.ownerDocument?.defaultView||window;
// Timestamps must come from the window that draws: Steam runs plugin code in a
// separate (SharedJSContext) window whose performance.now() has another origin.
const now=()=>view.performance.now();
const ctx=cv.getContext('2d');
const DISPLAY='"Jua","Motiva Sans","Noto Sans CJK KR","Noto Sans KR",sans-serif';
const HEAVY='"Black Han Sans","Motiva Sans","Noto Sans CJK KR",sans-serif';
let S=1,K=1;
function fit(w,h){
  if(!(w>50&&h>50))return;
  S=Math.min(w/W,h/H);
  const dpr=view.devicePixelRatio||1;K=Math.min(S*dpr,2);
  cv.style.width=Math.round(W*S)+'px';cv.style.height=Math.round(H*S)+'px';
  cv.style.left=Math.round((w-W*S)/2)+'px';cv.style.top=Math.round((h-H*S)/2)+'px';
  cv.width=Math.round(W*K);cv.height=Math.round(H*K);
  drawFrame();
}
const EN={'…하지 마.':'…Don\'t.','…쳇.':'…Tch.','…그만해라.':'…Knock it off.','…5초만이다.':'…Five seconds.','…나쁘진 않군.':'…Not bad.','…아무한테도 말하지 마.':'…Tell no one.','퍽!':'Splat!','콩!':'Bonk!','철퍼덕!':'Oof!','건드리지 마!':"Don't touch me!",'왜…':'What…','그만해라':'Stop it','내려줘!!':'Put me down!!','잠깐만…':'Hang on…','으아악!':'Aaargh!','화났어!!':"I'm mad!!",'진짜!!':'Seriously!!','비다! 우비 입어야지':'Rain! Raincoat time','순찰 시작.':'On patrol.','출동.':'Moving out.','흥… 가면 되잖아.':'Hmph… fine, I\'m going.','…알았어, 간다고.':'…okay, okay, going.','햇살 좋다!':'What a sunny day!','흥.':'Hmph.','흥. 안 가.':'Hmph. Not going.','헉… 헉…':'Huff… huff…','헉… 헉… 가자!':"Huff… let's go!",'하아아암~':'Yaaawn~','콜록… 들어가도 돼?':'Ahem… can I come in?','으앗?':'Whoa?','으아앗!':'Waaah!','으아아아':'Whoaaa','으… 기다려!':'Ugh… wait up!','어질어질…':'So dizzy…','안녕!':'Hi!','설치부터 할게!':"Let's install it!",'버텨…!':'Hold on…!','놓쳤다아':'Lost my grip','…헤헤':'…hehe','잠깐만~!':'Wait for me~!','같이 가아~!':'Coming~!','간다.':'Going in.','…들어간다.':'…going in.'};
const tx=s=>host.lang==='en'?(EN[s]??s):s;

const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t, rnd=(a,b)=>a+Math.random()*(b-a);
function srand(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function ell(c,x,y,rx,ry,rot=0){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot,0,Math.PI*2)}
// Storefront screen size follows the art: "wide" shows Steam's wide capsule
// (460×215) whole, "capsule" shows the tall library capsule (600×900) whole.
const CARD={wide:[260,121],capsule:[150,225]};
let cardStyle=host.cardStyle==='capsule'?'capsule':'wide';
let CW=CARD[cardStyle][0],CH=CARD[cardStyle][1];const BW=300;
let B=[];

/* ---------------- storefront screens (game art) ---------------- */
// Card canvases and facades are made lazily for buildings near the camera and
// dropped again far away, so a 1000-game library doesn't hold 1000 bitmaps.
function loadIcon(b){
  const list=b.game.icon||[];
  if(b.icon||b.iconLoading||(b.iconTried|0)>=list.length)return;
  const url=list[b.iconTried=(b.iconTried|0)+1,b.iconTried-1];
  const im=new view.Image();b.iconLoading=true;
  im.onload=()=>{b.iconLoading=false;if(im.naturalWidth>4)b.icon=im;else loadIcon(b)};
  im.onerror=()=>{b.iconLoading=false;loadIcon(b)};
  im.src=url;
}
// Spindeck's info icons (24×24 line art), drawn on the shop signs.
const ICON_SRC={clock:['M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0','M12 7v5l3 2'],recent:['M3 12a9 9 0 1 0 3-6.7','M3 4v5h5','M12 8v4l2.5 2.5'],
  trophy:['M8 4h8v5a4 4 0 0 1-8 0z','M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4','M12 13v4M9 20h6'],
  friends:['M12.2 9a3.2 3.2 0 1 1-6.4 0a3.2 3.2 0 1 1 6.4 0','M3.5 19a5.5 5.5 0 0 1 11 0','M19.6 10a2.6 2.6 0 1 1-5.2 0a2.6 2.6 0 1 1 5.2 0','M15.5 14.6A4.5 4.5 0 0 1 21 19']};
let ICONS=null;
function infoIcon(c,k,x,y,sz,col){
  if(!ICONS){const P=view.Path2D||Path2D;ICONS={};for(const n in ICON_SRC)ICONS[n]=ICON_SRC[n].map(d=>new P(d))}
  c.save();c.translate(x,y-sz/2);c.scale(sz/24,sz/24);c.strokeStyle=col;c.lineWidth=2.3;c.lineCap='round';c.lineJoin='round';ICONS[k].forEach(p=>c.stroke(p));c.restore();
}
const INFO_FONT='"Motiva Sans","Noto Sans CJK KR","Noto Sans KR",sans-serif';
/** The game's name on a shop sign: shrinks to fit, then ends in "…". */
function signName(c,t,cx,cy,maxW,size,font){
  let fs=size;c.font=fs+'px '+font;while(c.measureText(t).width>maxW&&fs>12){fs--;c.font=fs+'px '+font}
  if(c.measureText(t).width>maxW){while(t.length>1&&c.measureText(t+'…').width>maxW)t=t.slice(0,-1);t=t.trimEnd()+'…'}
  c.textAlign='center';c.textBaseline='middle';c.fillText(t,cx,cy+1);
}
function loadArt(b){
  const list=(cardStyle==='capsule'?b.game.capsule:b.game.art)||[];
  if(b.img||b.imgLoading||b.imgTried>=list.length)return;
  const url=list[b.imgTried++];
  const im=new view.Image();b.imgLoading=true;
  im.onload=()=>{b.imgLoading=false;if(im.naturalWidth>8){b.img=im;b.card=null}else loadArt(b)};
  im.onerror=()=>{b.imgLoading=false;loadArt(b)};
  im.src=url;
}
/** Words onto lines no wider than maxW; a single word too long for a line breaks between characters. */
function wrapText(c,t,maxW){
  const out=[];let line='';
  for(const w of t.split(/\s+/).filter(Boolean)){
    const tryL=line?line+' '+w:w;
    if(c.measureText(tryL).width<=maxW){line=tryL;continue}
    if(line)out.push(line);line='';
    if(c.measureText(w).width<=maxW){line=w;continue}
    for(const ch of w){if(c.measureText(line+ch).width>maxW&&line){out.push(line);line=''}line+=ch}
  }
  if(line)out.push(line);return out.length?out:[t];
}
/** The back of the storefront screen: the game's info, shown when you rest on a shop. */
function infoKey(b){const i=b.game.info;return i?[i.play,i.last,i.ach&&i.ach.join('/'),i.friends,!!b.icon,cardStyle,theme].join('|'):''}
function renderBack(b){
  const i=b.game.info,cc=view.document.createElement('canvas'),k=2;cc.width=CW*k;cc.height=CH*k;const c=cc.getContext('2d');c.scale(k,k);
  const ink=Z?'#e9fbff':'#3a3036',sub=Z?b.neon:shade(b.g.tr,-.2),acc=Z?b.neon:'#ffb938',fr=Z?'#4dff9a':'#3f8f2a';
  c.save();rr(c,0,0,CW,CH,10);c.clip();
  if(Z){c.fillStyle='#0d0b16';c.fillRect(0,0,CW,CH);const g=c.createRadialGradient(CW/2,CH/2,10,CW/2,CH/2,CW*.7);g.addColorStop(0,hexA(b.neon,.16));g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,CW,CH)}
  else{c.fillStyle='#fbf4e4';c.fillRect(0,0,CW,CH);c.fillStyle=hexA(b.g.tr,.12);c.fillRect(0,0,CW,4)}
  c.restore();
  if(!Z){c.strokeStyle=shade(b.g.tr,-.2);c.lineWidth=2;rr(c,4,4,CW-8,CH-8,8);c.stroke()}
  const wide=cardStyle!=='capsule',pad=wide?14:12,isz=wide?30:34;
  // header: icon + the whole name (shrinks, then wraps; never cut)
  let y=pad;const ix=wide?pad:(CW-isz)/2;
  if(b.icon){c.save();rr(c,ix,y,isz,isz,6);c.clip();c.drawImage(b.icon,ix,y,isz,isz);c.restore()}
  else{c.fillStyle=sub;rr(c,ix,y,isz,isz,6);c.fill()}
  const nx=wide?ix+isz+10:CW/2,nw=wide?CW-nx-pad:CW-2*pad,maxL=wide?2:3,maxH=wide?isz+6:50;
  let fs=wide?21:18,lines;
  for(;;fs--){c.font=`${fs}px ${DISPLAY}`;lines=wrapText(c,b.g.t,nw);if((lines.length<=maxL&&lines.length*fs*1.12<=maxH)||fs<=9)break}
  c.fillStyle=ink;c.textBaseline='middle';c.textAlign=wide?'left':'center';const lh=fs*1.12;
  const ly0=wide?y+isz/2-(lines.length-1)*lh/2:y+isz+6+lh/2;lines.forEach((t,k)=>c.fillText(t,nx,ly0+k*lh+1));
  y=wide?y+Math.max(isz,lines.length*lh)+8:y+isz+6+lines.length*lh+6;
  c.fillStyle=hexA(Z?b.neon:'#3a3036',.25);c.fillRect(pad,y,CW-2*pad,1.5);y+=6;
  // rows: one font size for all, as large as lets every item show in full
  const rows=[];if(i.play)rows.push(['clock',i.play,ink]);if(i.last)rows.push(['recent',i.last,ink]);if(i.ach){const at=achTier(b),mc=at?(Z?ACH_TIER[at].n:['','#b8692e','#7f8ba0','#c98f0a'][at]):ink;rows.push(['trophy',i.ach[0]+'/'+i.ach[1],mc,i.ach[0]/i.ach[1],at])}if(i.friends)rows.push(['friends',i.friends,fr]);
  const avail=CW-2*pad-4,room=CH-y-6;let fsz=wide?15:15,rh,ww,cols;
  for(;;fsz--){c.font=`700 ${fsz}px ${INFO_FONT}`;const barW=Math.round(fsz*2.2);ww=rows.map(([,t,,pr])=>fsz*1.2+5+c.measureText(t).width+(pr!==undefined?barW+6:0));rh=Math.round(fsz*1.62);
    if(wide){const c0=Math.max(ww[0]||0,ww[2]||0),c1=Math.max(ww[1]||0,ww[3]||0);cols=[c0,c1];if((c0+(c1?14+c1:0)<=avail&&Math.ceil(rows.length/2)*rh<=room)||fsz<=8)break}
    else if((Math.max(0,...ww)<=avail&&rows.length*rh<=room)||fsz<=8)break}
  const barW=Math.round(fsz*2.2),isz2=fsz*1.2;c.font=`700 ${fsz}px ${INFO_FONT}`;c.textAlign='left';
  const gapC=wide?Math.max(14,(avail-cols[0]-cols[1])/2):0;
  rows.forEach(([ic,t,col,pr],k)=>{const x=wide?pad+2+(k%2?cols[0]+gapC:0):pad+2,cy=y+rh/2+(wide?Math.floor(k/2):k)*rh;
    infoIcon(c,ic,x,cy,isz2,ic==='trophy'&&rows[k][4]?col:Z?sub:col===fr?fr:sub);c.fillStyle=col;c.fillText(t,x+isz2+5,cy+1);
    if(pr!==undefined){const bx=x+isz2+5+c.measureText(t).width+6;c.fillStyle=hexA(Z?'#ffffff':'#3a3036',.18);rr(c,bx,cy-2.5,barW,5,2.5);c.fill();c.fillStyle=rows[k][4]?col:acc;rr(c,bx,cy-2.5,Math.max(5,barW*pr),5,2.5);c.fill()}});
  if(!rows.length){c.fillStyle=sub;c.textAlign='center';c.fillText('—',CW/2,y+12)}
  b.back=cc;b.backKey=infoKey(b);
}
function renderCard(b){
  const g=b.g,cc=view.document.createElement('canvas'),k=2;cc.width=CW*k;cc.height=CH*k;const c=cc.getContext('2d');c.scale(k,k);
  c.save();rr(c,0,0,CW,CH,10);c.clip();
  if(b.img){ // the whole art: cover only trims the odd pixel when the art's shape is slightly off
    const iw=b.img.naturalWidth,ih=b.img.naturalHeight,sc=Math.max(CW/iw,CH/ih),dw=iw*sc,dh=ih*sc;c.fillStyle='#111';c.fillRect(0,0,CW,CH);c.drawImage(b.img,(CW-dw)/2,(CH-dh)/2,dw,dh)}
  else{ // no art (yet): a coloured placeholder with the name
    const gr=c.createLinearGradient(0,0,CW,CH);gr.addColorStop(0,shade(g.c,.15));gr.addColorStop(1,shade(g.tr,-.35));c.fillStyle=gr;c.fillRect(0,0,CW,CH);
    c.fillStyle='rgba(255,255,255,.08)';for(let i=0;i<6;i++){ell(c,(i*53+b.i*17)%CW,(i*37)%CH,40,40);c.fill()}
    // the name, wrapped onto a few lines for the tall screens
    let fs=cardStyle==='capsule'?20:24;c.font=`${fs}px ${DISPLAY}`;c.fillStyle='#fff';c.textBaseline='middle';c.textAlign='center';
    const words=String(g.t).split(/\s+/),lines=[];let ln='';for(const w of words){const t2=ln?ln+' '+w:w;if(c.measureText(t2).width>CW-20&&ln){lines.push(ln);ln=w}else ln=t2}if(ln)lines.push(ln);
    while(lines.some(l=>c.measureText(l).width>CW-16)&&fs>11){fs--;c.font=`${fs}px ${DISPLAY}`}
    const lh=fs*1.2;lines.slice(0,4).forEach((l,k)=>c.fillText(l,CW/2,CH/2+(k-(Math.min(4,lines.length)-1)/2)*lh))}
  c.restore();c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=2;rr(c,1,1,CW-2,CH-2,9);c.stroke();
  b.card=cc;
}

function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;const f=amt<0?0:255,t=Math.abs(amt);r=Math.round(lerp(r,f,t));g=Math.round(lerp(g,f,t));b=Math.round(lerp(b,f,t));return`rgb(${r},${g},${b})`}
const NEON=['#ff3fa4','#3ff0ff','#b26bff','#ffe14d','#4dff9a','#ff7a3f'];
let theme=host.theme==='neon'?'neon':'town';
let Z=theme==='neon';
function hexA(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`}
function flick(i){const v=Math.sin(T*23+i*7)*Math.sin(T*3.1+i*1.7);return v>.93?.15:1}
function renderFacadeNeon(b){
  const g=b.g,bw=BW,bh=b.bh,PAD=12,TOP=40,fc=view.document.createElement('canvas'),k=1.5;fc.width=(bw+PAD*2)*k;fc.height=(bh+TOP)*k;const c=fc.getContext('2d');c.scale(k,k);c.translate(PAD,TOP);
  const base=shade(g.c,-.7),edge='#0c0b12';
  c.fillStyle=edge;
  if(g.roof===1){c.fillRect(bw/2+40,-34,4,36);c.fillRect(bw/2+28,-22,28,3);c.fillRect(bw/2-90,-16,46,18)}
  if(g.roof===2){rr(c,bw/2-50,-30,56,28,6);c.fill();c.fillRect(bw/2-46,-4,4,6);c.fillRect(bw/2,-4,4,6)}
  if(g.roof===0){c.fillRect(30,-14,40,16);c.fillRect(bw-80,-12,34,14)}
  c.fillStyle=base;c.fillRect(0,0,bw,bh);
  c.strokeStyle='rgba(255,255,255,.05)';c.lineWidth=1;
  for(let x=50;x<bw;x+=50){c.beginPath();c.moveTo(x,0);c.lineTo(x,bh);c.stroke()}
  for(let y=40;y<bh;y+=60){c.beginPath();c.moveTo(0,y);c.lineTo(bw,y);c.stroke()}
  const r=srand(b.i*13+7);c.fillStyle='rgba(0,0,0,.2)';for(let q=0;q<14;q++)c.fillRect(r()*bw,r()*bh*.6,2,30+r()*80);
  c.fillStyle=edge;c.fillRect(-PAD,0,bw+PAD*2,12);c.fillRect(0,bh-16,bw,16);
  const L=b.L;c.fillStyle='rgba(0,0,0,.45)';rr(c,L.card.x+4,L.card.y+6,CW,CH,10);c.fill();
  c.fillStyle=edge;[[L.card.x+30,L.card.y-8],[L.card.x+CW-36,L.card.y-8]].forEach(([x,y])=>c.fillRect(x,y,6,10));
  const a=L.awn;rr(c,a.x,a.y-4,a.w,a.h+8,6);c.fill();
  const d=L.door;c.fillRect(d.x-6,d.y-6,d.w+12,d.h+6);
  L.wins.concat(L.up).forEach(w=>c.fillRect(w.x-4,w.y-4,w.w+8,w.h+8));
  c.fillStyle='#2a2836';c.fillRect(bw-12,14,5,bh-30);
  c.fillStyle='#2a2733';c.fillRect(d.x-10,bh-6,d.w+20,6);
  b.fac=fc;b.facPad=PAD;b.facTop=TOP;b.facK=k;
}
function renderFacade(b){
  if(Z){renderFacadeNeon(b);return}
  const g=b.g,bw=BW,bh=b.bh,PAD=12,TOP=26,fc=view.document.createElement('canvas'),k=1.5;fc.width=(bw+PAD*2)*k;fc.height=(bh+TOP)*k;const c=fc.getContext('2d');c.scale(k,k);c.translate(PAD,TOP);
  if(g.roof===1){c.fillStyle=g.tr;c.fillRect(bw/2-64,-22,128,24);c.fillStyle=shade(g.tr,-.2);c.fillRect(bw/2-70,-24,140,5)}
  if(g.roof===2){c.fillStyle=g.tr;c.beginPath();c.moveTo(bw/2-70,2);c.quadraticCurveTo(bw/2,-46,bw/2+70,2);c.fill()}
  c.fillStyle=g.c;c.fillRect(0,0,bw,bh);
  c.globalAlpha=.09;c.fillStyle='#000';
  if(b.i%3===0){for(let y=20;y<bh;y+=14)c.fillRect(0,y,bw,1.5)}else if(b.i%3===1){for(let y=18,row=0;y<bh;y+=12,row++){c.fillRect(0,y,bw,1);for(let x=(row%2)*16;x<bw;x+=32)c.fillRect(x,y-12,1,12)}}else{for(let x=24;x<bw;x+=24)c.fillRect(x,0,1.5,bh)}
  c.globalAlpha=1;
  c.fillStyle=g.tr;c.fillRect(-PAD,0,bw+PAD*2,14);c.fillStyle=shade(g.tr,-.25);c.fillRect(-PAD,12,bw+PAD*2,4);
  c.fillStyle=shade(g.tr,-.15);c.fillRect(0,bh-16,bw,16);
  // card mount: shadow + brackets
  const L=b.L;c.fillStyle='rgba(0,0,0,.22)';rr(c,L.card.x+4,L.card.y+6,CW,CH,10);c.fill();
  c.fillStyle=shade(g.tr,-.3);[[L.card.x+30,L.card.y-8],[L.card.x+CW-36,L.card.y-8]].forEach(([x,y])=>{c.fillRect(x,y,6,10)});
  // awning
  const a=L.awn;c.save();c.beginPath();c.moveTo(a.x,a.y);c.lineTo(a.x+a.w,a.y);c.lineTo(a.x+a.w+8,a.y+a.h);c.lineTo(a.x-8,a.y+a.h);c.closePath();c.clip();
  for(let x=a.x-10,i=0;x<a.x+a.w+10;x+=22,i++){c.fillStyle=i%2?shade(g.tr,.75):g.tr;c.fillRect(x,a.y,22,a.h)}c.restore();
  for(let x=a.x-8,i=0;x<a.x+a.w+8;x+=22,i++){c.fillStyle=i%2?shade(g.tr,.75):g.tr;c.beginPath();c.arc(x+11,a.y+a.h,11,0,Math.PI);c.fill()}
  // door frame & window frames
  const d=L.door;c.fillStyle=shade(g.tr,-.35);c.fillRect(d.x-6,d.y-6,d.w+12,d.h+6);
  L.wins.concat(L.up).forEach(w=>{c.fillStyle=shade(g.tr,-.3);c.fillRect(w.x-4,w.y-4,w.w+8,w.h+8);c.fillStyle=shade(g.c,.35);c.fillRect(w.x-6,w.y+w.h+2,w.w+12,5)});
  // step
  c.fillStyle='#9a938c';c.fillRect(d.x-10,bh-6,d.w+20,6);
  b.fac=fc;b.facPad=PAD;b.facTop=TOP;b.facK=k;
}

// Each building's look comes from the game's appid, so a game keeps its building.
const LOOKS=[['#5b6f9a','#3f4f73'],['#7f9a7c','#566f55'],['#6d8f96','#4b6a70'],['#b07a5a','#7d5238'],['#6a5b86','#4a3d63'],['#5d6660','#3e4641'],['#c29a4f','#8e6c2f'],['#4f6487','#364766'],['#b0605a','#7f3f3a'],['#c98c9b','#985f6d'],['#8e5a45','#653c2c'],['#4f8a83','#34625c']];
const HEIGHTS=[372,410,350,432,390,360,418,380,400,356,424,384];
function hash(n){n=(n^61)^(n>>>16);n=n+(n<<3);n=n^(n>>>4);n=Math.imul(n,0x27d4eb2d);n=n^(n>>>15);return n>>>0}
function makeBuilding(game,i){
  const gh=game.hours||0,extra=gh>=500?86:gh>=350?70:0; // 350h+: the building has grown a floor
  const h=hash(game.appid>>>0||i+1),look=LOOKS[h%LOOKS.length],bh=Math.max(HEIGHTS[(h>>>5)%HEIGHTS.length],CH+158+(cardStyle==='capsule'?52:40))+extra;
  const g={t:game.name,g:game.sign,c:look[0],tr:look[1],roof:(h>>>9)%3,bh};
  const b={i,g,game,appid:game.appid,bh,cx:i*SP,st:game.status,p:game.progress||0,door:0,doorTarget:0,light:0,playing:false,hours:game.hours||0,cele:0,neon:NEON[h%NEON.length],img:null,imgTried:0,card:null,fac:null};
  const cardY=bh-158-CH;
  b.L={card:{x:(BW-CW)/2,y:cardY},door:{x:BW/2-38,y:bh-114,w:76,h:114},awn:{x:18,y:bh-142,w:BW-36,h:22},
    wins:[{x:26,y:bh-102,w:64,h:58},{x:BW-90,y:bh-102,w:64,h:58}],up:[]};
  if(cardY>=104){const n=3,rows=Math.max(1,Math.floor((cardY-50)/70));for(let r=0;r<rows;r++)for(let k=0;k<n;k++)b.L.up.push({x:44+k*((BW-88-46)/(n-1)),y:34+r*70,w:46,h:Math.min(52,cardY-62-r*70)})}
  return b;
}
/** Keep bitmaps only near the camera. */
function trimCaches(){
  const keep=6;
  for(const b of B){const far=Math.abs(b.i-sel)>keep&&Math.abs(b.cx-camX)>keep*SP;if(far){b.fac=null;b.card=null;b.back=null;if(Math.abs(b.i-sel)>keep*3){b.img=null;b.imgTried=0;b.icon=null;b.iconTried=0}}}
}

let sel=0,camX=0,tiltDeg=0,tiltSensor=null,skyMode=host.sky||'auto',longPlay=false,mode='browse';
let mood=80,moodSaveT=null,lastBother=-99,navTimes=[],shakeT=0,playStart=0,hintGone=false,T=0;
mood=clamp(Number(host.mood)||80,0,100);
const m={x:-72,y:FEET,vx:0,vy:0,dir:1,state:'idle',t:0,phase:0,stamina:1,sprintT:0,tripCD:0,pantT:0,sleepyT:0,petT:0,blinkT:2,blink:0,
  react:null,bubble:null,rot:0,sx:1,sy:1,alpha:1,scale:1,behind:false,side:-1,lookUp:0,grab:null,sulkKind:null,sulkIdx:0,peek:0,hes:false,arrivedFromSprint:false,clingX:null};
const parts=[];

/* ---------------- sound / haptics (through the host) ---------------- */
function sfx(type){try{host.sound(type)}catch(e){}}
function buzz(ms){try{host.haptic(ms)}catch(e){}}

const cur=()=>B[sel];
let showP=host.penguin!==false;
function say(text,dur=1.6){if(!showP)return;m.bubble={text:tx(text),t:0,dur}}
function pop(text,x,y,size=44,col='#fff'){parts.push({k:'text',text:tx(text),x,y,vx:0,vy:-40,life:0,max:.9,size,col,rot:rnd(-.2,.2)})}
function dust(x,y,n=6,s=1){for(let i=0;i<n;i++)parts.push({k:'dust',x:x+rnd(-10,10),y:y-rnd(0,6),vx:rnd(-60,60)*s,vy:rnd(-60,-10)*s,life:0,max:rnd(.4,.8),r:rnd(5,10)*s})}
function hearts(x,y){parts.push({k:'heart',x:x+rnd(-14,14),y,vx:rnd(-20,20),vy:-70,life:0,max:1.1,r:rnd(7,10)})}
function steam(x,y){parts.push({k:'steam',x:x+rnd(-18,18),y,vx:rnd(-15,15),vy:-90,life:0,max:.7,r:rnd(5,8)})}
function bother(amt){mood=clamp(mood-amt,0,100);lastBother=T;saveMood()}
function saveMood(){clearTimeout(moodSaveT);moodSaveT=setTimeout(()=>{try{host.saveMood(Math.round(mood))}catch(e){}},1500)}
function setState(s){m.state=s;m.t=0}
function standX(b){return b.cx+72*m.side}
const GROUNDED=['idle','move','sit','sulk','cheer','goDoor','hesitate','react'];
const BUSY=['brace','shoot','held','air','splatW','splatG','recover','trip','getup','dizzy','collapse','roll','cling','enter','inside','exit','yawn'];
let rushNow=false;
function navRate(){const now=T;navTimes=navTimes.filter(t=>now-t<1.3);return navTimes.length}
function viewL(){return camX-camKick-640+34}function viewR(){return camX-camKick+640-34} // the screen edges in street coordinates (camKick shifts the picture)

/* ---------------- navigation / launch ---------------- */
let camKick=0;
function nav(d){
  if(mode!=='browse'||!B.length)return;m.queued=false;const n=clamp(sel+d,0,B.length-1);if(n===sel){camKick=d*26;return}
  sel=n;navTimes.push(T);sfx('tick');
  m.side=(B[sel].cx>m.x)?-1:1;
  if(['idle','sit','react','cheer'].includes(m.state))setState('move');
  if(m.state==='goDoor'||m.state==='hesitate'||m.state==='brace')setState('move');
  host.onSelect(sel);
}
function select(i){if(!B.length)return;i=clamp(i|0,0,B.length-1);if(i!==sel)nav(i-sel)}
function launch(){
  if(mode!=='browse'||!B.length)return;const b=cur();
  if(b.st==='closed'){say('설치부터 할게!');sfx('tick');host.onInstall(sel);return}
  if(b.st==='downloading'){say(host.lang==='en'?`Only ${Math.floor(b.p)}% so far…`:`아직 ${Math.floor(b.p)}%야…`);if(m.state==='idle')setState('sit');return}
  // no penguin on the street: the door opens and the page follows
  if(!showP){mode='launching';b.doorTarget=1;sfx('door');setTimeout(()=>{if(mode==='launching')enterDone()},380);return}
  // a bad mood or a tumble never cancels it: busy now → it goes as soon as it's back on its feet
  if(['enter','inside','exit'].includes(m.state))return;
  if(BUSY.includes(m.state)){m.queued=true;say(m.state==='held'?'내려줘!!':'잠깐만…',1);return}
  const grumpy=m.state==='sulk'||mood<35;m.queued=false;
  mode='launching';m.behind=false;m.y=FEET;m.hes=false;m.rush=false;setState('goDoor');
  if(grumpy)say(Math.random()<.5?'흥… 가면 되잖아.':'…알았어, 간다고.',1.4);
  // late arrival: off-screen → pop in just past the screen edge and sprint to the door
  const eL=b.cx-640,eR=b.cx+640;
  if(m.x<eL-20||m.x>eR+20){const side=m.x<b.cx?-1:1;m.x=b.cx+side*(640+40);m.y=FEET;m.rot=0;m.alpha=1;m.scale=1;
    m.dir=-side;m.vx=-side*700;m.rush=true;m.sprintT=0;m.stamina=1;say(Math.random()<.5?'잠깐만~!':'같이 가아~!',1.3);sfx('boing')}
}
function enterDone(){const b=cur();mode='playing';b.playing=true;playStart=now();host.onEntered(sel)}
/** The game ended (or never started): the penguin comes back out, sleepy if it was long. */
/** Back from the game's page: the penguin steps out of the door (no yawn). */
function emerge(){if(!B.length)return;const b=cur();mode='playing';b.playing=true;playStart=now();m.quick=true;goBack()}
function goBack(){
  if(mode!=='playing'&&mode!=='launching')return;
  if(mode==='launching'){cancelLaunch();return}
  const b=cur();longPlay=now()-playStart>45*60000;mode='exiting';b.playing=false;b.doorTarget=1;
  frozen=false;
  m.x=b.cx;m.y=SIDE+4;m.alpha=0;m.scale=.82;setState('exit');start();
}

/* ---------------- minimi update ---------------- */
function faceFrom(){
  // returns {eyes,mouth,brow,blush,red,extras}
  const f={eyes:'open',mouth:'smile',brow:null,blush:.5,red:0,sweat:0,steam:0,zzz:0,stars:0,tongue:0,lookY:0,lookX:null};
  const s=m.state,t=m.t;
  if(m.react){const r=m.react;if(r.type==='flinch'){f.eyes='squint';f.mouth='o';f.brow='worry'}else if(r.type==='annoy'){f.eyes='half';f.mouth='pout';f.brow='flat';f.blush=.9}else{f.eyes='angry';f.mouth='grit';f.brow='angry';f.red=.7;f.steam=1}}
  else if(m.petT>0){if(Z){f.eyes='half';f.mouth='pout';f.brow='angry';f.blush=1;f.sweat=1;f.lookX=(hand.a>.3&&hand.x>m.x?-1:1)*7}else{f.eyes='happy';f.mouth='open';f.blush=1}}
  else if(m.pantT>0){f.eyes='closedU';f.mouth='pant';f.tongue=1;f.sweat=1}
  else if(m.sleepyT>0){f.eyes='half';f.mouth='flat';f.zzz=1;f.blush=.3}
  else if(mood<35){f.eyes='half';f.mouth='frown';f.brow='flat'}
  if(s==='move'&&!m.react&&m.petT<=0){if(m.mode==='sprint'){f.eyes='squint';f.mouth='pant';f.tongue=1;f.sweat=1}}
  if(s==='sit'&&m.lookUp>.5&&!m.react&&f.eyes==='open'){f.lookY=-5;f.mouth='o2'}
  if(s==='held'){if(m.grab==='lift'){f.eyes='wide';f.mouth='o';f.sweat=1}else{f.eyes='wide';f.mouth='scream';f.brow='worry'}}
  if(s==='air'){f.eyes='x2';f.mouth='scream';f.brow='worry'}
  if(s==='splatW'||s==='splatG'){f.eyes='x';f.mouth='wavy';f.blush=0}
  if(s==='recover'){f.eyes=t<.3?'x':'squint';f.mouth='wavy';f.brow='flat';f.sweat=1}
  if(s==='trip'){f.eyes='x';f.mouth='wavy'}
  if(s==='getup'){f.eyes='tear';f.mouth='frown';f.brow='worry'}
  if(s==='dizzy'||s==='collapse'){f.eyes='spiral';f.mouth='wavy';f.stars=1}
  if(s==='roll'){f.eyes='x2';f.mouth='scream'}
  if(s==='cling'){f.eyes='squint';f.mouth='grit';f.brow='worry';f.sweat=1}
  if(s==='hesitate'){f.eyes='open';f.mouth='wavy';f.brow='worry';f.sweat=1}
  if(s==='yawn'){f.eyes='closedU';f.mouth=t<1.3?'yawn':'smile';f.blush=.6}
  if(s==='sulk'){f.eyes='half';f.mouth='pout';f.brow='angry';f.blush=.9}
  if(s==='cheer'){f.eyes='happy';f.mouth='open';f.blush=1}
  if(Z){ // neon city: a cop-movie penguin
    const chase=(s==='move'&&(m.mode==='run'||m.mode==='sprint'))||s==='goDoor';
    if(chase&&!m.react&&m.petT<=0){f.eyes='open';f.mouth='flat';f.brow='angry';f.sweat=0;f.tongue=0}
    if(s==='brace'){f.eyes='open';f.mouth='flat';f.brow='angry';f.blush=.2}
    if(s==='shoot'){f.eyes='squint';f.mouth='grit';f.brow='angry';f.red=.3;f.blush=0}
  }
  if(f.eyes==='open'&&m.blink>0&&!((m.pfE||0)>.03&&(m.pfE||0)<.97))f.eyes='blink'; // no random blink mid-turn
  return f;
}

function update(dt){
  if(!B.length){T+=dt;return}
  T+=dt;
  // camera
  restT=selSeen===sel?restT+dt:0;selSeen=sel;const rushing=navRate()>=2&&restT<.18;rushNow=navRate()>=2&&restT<.3; // while you flick, the penguin may fall behind off-screen (no clinging to the edge) // flicking through the street
  const tx=cur().cx;if(!isFinite(camX))camX=tx;if(!isFinite(m.x)||!isFinite(m.y)){m.x=standX(cur());m.y=FEET;m.vx=0;m.vy=0}
  camX+= (tx-camX)*(1-Math.exp(-dt*(rushing?11:6.5))); camKick*=Math.exp(-dt*10); // the camera keeps up when you rush, so the street does not smear
  if(shakeT>0)shakeT-=dt;
  const tilt=(tiltSensor!==null?tiltSensor:tiltDeg)*Math.PI/180;
  // doors ease open/closed; lights come on when you pick the building
  {const ci=Math.round(camX/SP),bi0=Math.max(0,ci-5),bi1=Math.min(B.length-1,ci+5);for(let i=bi0;i<=bi1;i++){const b=B[i];
   b.door+=(b.doorTarget-b.door)*(1-Math.exp(-dt*14));if(restT===0)flipPick=null;const ft=b.i===sel&&mode==='browse'&&!rushNow&&!!b.game.info&&flipPick===true?1:0;b.flip=(b.flip||0)+Math.sign(ft-(b.flip||0))*Math.min(Math.abs(ft-(b.flip||0)),dt/(ft?.6:.35));
   const lt=((b.i===sel&&!rushing)||b.playing)?1:0;b.light+=(lt-b.light)*(1-Math.exp(-dt*(lt?3:(rushing?12:2.5))));if(b.cele>0)b.cele-=dt}}
  // mood regen
  if(T-lastBother>5&&mood<70){mood=Math.min(70,mood+dt*1.1)}
  // timers
  m.t+=dt;m.tripCD-=dt;if(m.pantT>0)m.pantT-=dt;if(m.sleepyT>0)m.sleepyT-=dt;if(m.petT>0)m.petT-=dt;
  m.blinkT-=dt;if(m.blinkT<0){m.blink=.13;m.blinkT=rnd(2.2,4.8)}if(m.blink>0)m.blink-=dt;
  if(m.react){m.react.t+=dt;if(m.react.type==='angry'&&Math.random()<dt*10)steam(m.x,m.y-2*R-6);if(m.react.t>m.react.dur)m.react=null}
  if(m.bubble){m.bubble.t+=dt;if(m.bubble.t>m.bubble.dur)m.bubble=null}
  m.stamina=Math.min(1,m.stamina+dt*.25);
  m.rot*=1;let targetSx=1,targetSy=1;
  const b=cur();
  // tilt takes over on the ground
  const tiltAbs=Math.abs(tilt*180/Math.PI),dn=Math.sign(tilt);
  if(GROUNDED.includes(m.state)&&mode==='browse'){
    if(tiltAbs>=24){setState('roll');m.behind=false;m.y=FEET;m.vx=dn*60;say('으아아아',1)}
    else if(tiltAbs>=8){m.behind=false;m.y=FEET;setState('cling');m.vx=0;m.clingX=null}
  }
  const g=2300,s=m.state;
  if(s==='idle'||s==='move'||s==='sulk'||s==='goDoor'){
    let target=s==='goDoor'?b.cx:standX(b);
    if(s==='sulk'&&m.sulkIdx!==sel&&m.t>1.6){m.behind=false;m.y=FEET;setState('move')}
    if(s==='sulk'){ // sulk poses
      if(m.sulkKind==='hide'){const sb=B[m.sulkIdx];const ex=sb.cx+m.side*(BW/2+12); // tuck into the alley beside the wall, half still showing
        if(!m.behind){target=ex;if(Math.abs(m.x-ex)<6){m.behind=true;m.y=SIDE-4;dust(m.x,FEET,3,.6)}}
        else{target=m.x;m.peek=Math.max(0,Math.sin(T*.9))**6;m.dir=m.side}}
      else target=m.x;
    }
    const dist=target-m.x,ad=Math.abs(dist);
    if(ad>900&&!rushNow){m.x=target-Math.sign(dist)*900}
    const th=(s==='move'||s==='goDoor'||s==='sulk')?3:14; // idle needs a real gap before it sets off again
    if(ad>th){
      const nr=navRate();let mode2=(ad>420||nr>=3)?'sprint':(ad>160||nr>=2)?'run':'walk';
      if(mood<22||s==='sulk')mode2='walk';
      if(s==='goDoor')mode2=m.rush&&ad>90?'sprint':ad>160?'run':'walk';
      m.mode=mode2;const maxv={walk:210,run:500,sprint:880}[mode2];
      const want=Math.sign(dist)*Math.min(maxv,ad*6+30);
      if(ad<50&&Math.abs(m.vx)>Math.abs(want))m.vx=want; // brake into the spot, never overshoot
      else m.vx+=(want-m.vx)*(1-Math.exp(-dt*(mode2==='sprint'?8:11)));
      m.dir=Math.sign(dist)||m.dir;
      if(s==='idle')setState('move');
      if(mode2==='sprint'){m.sprintT+=dt;m.stamina-=dt*.45;if(!rushNow&&Math.random()<dt*9)dust(m.x-m.dir*16,FEET,1,.7)}else m.sprintT=Math.max(0,m.sprintT-dt*.5);
      const onScreen=m.x>viewL()-10&&m.x<viewR()+10;
      if(mode2==='sprint'&&s!=='goDoor'&&!rushNow&&m.tripCD<0&&onScreen&&((m.sprintT>1.25&&Math.random()<dt*1.8)||(m.stamina<.25&&ad>260))){setState('trip');m.tripCD=3.5;m.sprintT=0;m.stamina=.7;pop('철퍼덕!',m.x+m.dir*30,FEET-70,40);dust(m.x+m.dir*20,FEET,10,1.1);sfx('splat');buzz(25);return}
          }else{
      if(s==='move'||s==='goDoor'){m.x=target;m.vx=0}else{m.vx*=Math.exp(-dt*14);if(Math.abs(m.vx)<8)m.vx=0}
      if(s==='move'){
        if(m.sprintT>.35){m.pantT=1.8;say('헉… 헉…',1.6)}m.sprintT=0;
        m.dir=m.side<0?1:-1;setState('idle');
        if(mood<22){startSulk()}
      }
      if(s==='goDoor'){m.dir=1;if(m.rush){m.rush=false;m.pantT=1.4;say('헉… 헉… 가자!',1.2)}if(Z){setState('brace');say(Math.random()<.5?'간다.':'…들어간다.',1.1)}else if(b.st==='dusty'&&!m.hes){setState('hesitate');say('콜록… 들어가도 돼?',1.6)}else{setState('enter');b.doorTarget=1;sfx('door')}}
      if(s==='idle'&&m.t>3.5&&mode==='browse')setState('sit');
    }
    m.x+=m.vx*dt;m.phase+=Math.abs(m.vx)*dt*.055;
    // flicking faster than it can run: once it has dropped out of the frame it stays out (no peeking at the edge)
    if(rushNow&&(s==='move'||s==='idle')){const Lh=camX-640-60,Rh=camX+640+60;if(m.hidRush||m.x<Lh+30||m.x>Rh-30){m.hidRush=true;m.x=m.x<camX?Math.min(m.x,Lh):Math.max(m.x,Rh)}}else m.hidRush=false;
  }
  else if(s==='sit'){m.vx=0;m.lookUp=clamp((m.t-1.1)*2,0,1);if(Math.abs(standX(b)-m.x)>4)setState('move');if(m.t>12&&m.sleepyT<=0&&Math.random()<dt*.15)m.sleepyT=3}
  else if(s==='brace'){m.vx=0;m.dir=1;if(m.t>.6&&!m.braceOpen){m.braceOpen=true;b.doorTarget=1;sfx('door');shakeT=.12;buzz(25)}if(m.t>1.15){m.braceOpen=false;setState('enter')}}
  else if(s==='shoot'){m.vx=0;const at=[.5,.78,1.06];while((m.shots||0)<3&&m.t>at[m.shots||0]){fireShot();m.shots=(m.shots||0)+1}if(m.t>1.8){setState('recover');m.t=.45}}
  else if(s==='hesitate'){m.x+=Math.sin(m.t*40)*.6;if(m.t>1.5){m.hes=true;setState('enter');b.doorTarget=1;sfx('door')}}
  else if(s==='enter'){const k=clamp(m.t/0.62,0,1);m.x=lerp(m.x,b.cx,.28);m.y=lerp(FEET,SIDE+2,k);m.scale=lerp(1,.8,k);m.alpha=clamp(1-(m.t-.3)/.32,0,1);m.phase+=dt*11;
    if(m.t>.7){m.alpha=0;setState('inside');b.doorTarget=0;enterDone()}}
  else if(s==='inside'){if(m.t>.85&&mode==='playing')freeze()}
  else if(s==='exit'){const k=clamp((m.t-.25)/.6,0,1);m.alpha=k;m.scale=lerp(.82,1,k);m.y=lerp(SIDE+4,FEET,k);m.phase+=dt*8;if(m.t>.95){m.y=FEET;m.scale=1;m.alpha=1;b.doorTarget=0;if(m.quick){m.quick=false;m.dir=-1;m.side=-1;mode='browse';setState('idle');host.onSelect(sel)}else{setState('yawn');say('하아아암~',1.6);sfx('yawn')}}}
  else if(s==='yawn'){if(m.t>2){mode='browse';if(longPlay)m.sleepyT=6;setState('idle');host.onSelect(sel)}}
  else if(s==='held'){/* position set by pointer */ m.rot=clamp(-m.vx*.0009,-.6,.6)}
  else if(s==='air'){
    m.vy+=g*dt;m.vx*=Math.exp(-dt*.35);m.x+=m.vx*dt;m.y+=m.vy*dt;m.rot+=m.vx*dt*.012;
    const L=viewL(),Rr=viewR();
    if(m.x<L||m.x>Rr){const side=m.x<L?-1:1;m.x=side<0?L:Rr;
      if(Math.abs(m.vx)>620){splatWall(side)}else{m.vx*=-.45;sfx('boing')}}
    if(m.y-2*R<70&&m.vy<0){m.y=70+2*R;m.vy*=-.3;if(Math.abs(m.vy)>300){pop('콩!',m.x,90,30)}}
    if(m.y>=FEET){m.y=FEET;
      if(m.vy>950){splatGround()}
      else if(m.vy>260){m.vy*=-.38;m.vx*=.6;sfx('boing');dust(m.x,FEET,4,.7)}
      else{m.vy=0;m.rot=0;setState('recover');m.t=.35}}
  }
  else if(s==='splatW'){if(m.t>.55){m.y+=dt*110;if(m.y>=FEET){m.y=FEET;m.rot=0;setState('recover')}}}
  else if(s==='splatG'){if(m.t>.9){setState('recover')}}
  else if(s==='recover'){if(m.t>.9){m.rot=0;afterBother()}}
  else if(s==='trip'){m.vx*=Math.exp(-dt*5);m.x+=m.vx*dt;if(m.x<viewL()-40||m.x>viewR()+40){m.x=clamp(m.x,viewL(),viewR());m.vx=0;setState('move');m.rot=0}else if(m.t>.95)setState('getup')}
  else if(s==='getup'){m.vx=0;if(m.t>.55){setState('move');if(Math.random()<.5)say('으… 기다려!',1.2)}}
  else if(s==='dizzy'){m.vx=Math.sin(m.t*6.5)*130;m.x+=m.vx*dt;m.x=clamp(m.x,viewL(),viewR());m.dir=Math.sign(m.vx)||1;m.phase+=dt*7;if(m.t>2.3){setState('collapse');dust(m.x,FEET,6,.8);sfx('splat')}}
  else if(s==='collapse'){if(m.t>1.4)setState('getup')}
  else if(s==='roll'){
    m.vx+=g*.55*Math.sin(tilt)*dt;m.vx*=Math.exp(-dt*.5);m.x+=m.vx*dt;m.rot+=m.vx*dt/R;
    const L=viewL(),Rr=viewR();if(m.x<L||m.x>Rr){m.x=clamp(m.x,L,Rr);if(Math.abs(m.vx)>220){pop('콩!',m.x,FEET-60,30);sfx('boing');buzz(15)}m.vx*=-.35}
    bother(dt*1.2);
    if(tiltAbs<6&&Math.abs(m.vx)<90){m.rot=0;setState('dizzy');m.t=1.2}
  }
  else if(s==='cling'){
    if(tiltAbs>=24){setState('roll');say('놓쳤다아',1)}
    else if(tiltAbs<6){m.clingX=null;setState('recover');m.t=.4}
    else{
      if(m.clingX===null){ // nearest building corner downhill
        let best=null;B.forEach(bb=>{[bb.cx-BW/2,bb.cx+BW/2].forEach(e=>{const ex=e-dn*14;if((ex-m.x)*dn>=-2&&(best===null||Math.abs(ex-m.x)<Math.abs(best-m.x)))best=ex})});
        m.clingX=best===null?m.x:best;
      }
      const d=m.clingX-m.x;
      if(Math.abs(d)>3){m.vx+=g*.35*Math.sin(tilt)*dt;m.vx=clamp(m.vx,-420,420);m.x+=m.vx*dt;m.phase+=Math.abs(m.vx)*dt*.05;if((m.clingX-m.x)*dn<=0){m.x=m.clingX;m.vx=0;say('버텨…!',1.2);dust(m.x,FEET,3,.5)}}
      m.dir=dn;
    }
  }
  else if(s==='react'){if(m.t>.4)setState('idle')}
  else if(s==='cheer'){m.y=FEET-Math.abs(Math.sin(m.t*9))*22*(1-m.t/1.2);if(m.t>1.2){m.y=FEET;setState('idle')}}
  if(m.queued&&mode==='browse'&&GROUNDED.includes(m.state)&&m.state!=='goDoor'){m.queued=false;launch()}
  // left behind off-screen (you browsed faster than it can run): after a moment it pops in at the
  // edge already running, so it's never gone for more than a fraction of a second
  {const L=camX-640,Rr=camX+640,off=m.x<L-30||m.x>Rr+30,can=['idle','move','sit','sulk','react','cheer','goDoor','trip','getup'].includes(m.state)&&!m.behind;
   m.offT=off&&can&&!rushNow?(m.offT||0)+dt:0; // pops back in once you stop, not while you're still flicking
   if(m.offT>.3){const side=m.x<camX?-1:1;m.x=camX+side*(640+28);m.y=FEET;m.rot=0;m.alpha=1;m.scale=1;m.dir=-side;m.fdir=-side;m.vx=-side*760;m.sprintT=0;m.stamina=1;m.tripCD=Math.max(m.tripCD,2);m.offT=0;
     if(m.state==='sulk'||m.state==='sit'||m.state==='react'||m.state==='cheer'){m.y=FEET;setState('move')}}}
  // sulk check / unsulk
  if(m.state==='sulk'&&mood>=55){m.behind=false;m.y=FEET;setState('cheer');say('…헤헤',1.4);for(let i=0;i<5;i++)hearts(m.x,m.y-70)}
  if(m.pantT>0&&Math.random()<dt*3&&m.state==='idle')dust(m.x,FEET,1,.3);
  m.x=clamp(m.x,B[0].cx-640+34,B[B.length-1].cx+640-34);
  // particles
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life+=dt;if(p.life>p.max){parts.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.k==='dust'){p.vx*=.92;p.vy*=.92}if(p.k==='conf'){p.vy+=500*dt;p.rot+=dt*8}}
}
/* ---- neon city: the penguin shoots the screen (cracks in the glass, they fade) ---- */
const holes=[];let flashT=0,beamT=0;
function startShoot(){m.react=null;m.behind=false;m.y=FEET;m.rot=0;m.shots=0;m.prof=0;m.fdir=m.dir;m.targets=[0,1,2].map(()=>({x:640+rnd(-130,130),y:360+rnd(-90,50)}));setState('shoot');say('…',.6);sfx('angry')}
function fireShot(){
  const r=srand((Math.random()*1e9)|0);
  const tg=(m.targets||[])[m.shots||0]||{x:640+rnd(-120,120),y:380+rnd(-80,60)};
  holes.push({x:tg.x,y:tg.y,t:0,r,rot:rnd(0,6.28),n:7+((r()*4)|0)});
  if(holes.length>9)holes.shift();
  flashT=.07;beamT=.16;m.recoil=1;sfx('bang');buzz(45);shakeT=Math.max(shakeT,.16);
}
function updHoles(dt){if(flashT>0)flashT-=dt;if(beamT>0)beamT-=dt;if(m.recoil>0)m.recoil=Math.max(0,m.recoil-dt*8);for(let i=holes.length-1;i>=0;i--){holes[i].t+=dt;if(holes[i].t>7)holes.splice(i,1)}}
function drawHoles(){
  if(flashT>0){ctx.fillStyle=`rgba(255,63,164,${flashT*1.6})`;ctx.fillRect(0,0,W,H)}
  if(beamT>0){
    const h=holes[holes.length-1];if(h&&m.muzzle){ // the beam: a neon core with a wide glow
      const a=Math.min(1,beamT*8);ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
      [[16,'rgba(255,63,164,'+.25*a+')'],[7,'rgba(63,240,255,'+.55*a+')'],[2.5,'rgba(255,255,255,'+.95*a+')']].forEach(([w,c])=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(m.muzzle.x,m.muzzle.y);ctx.lineTo(h.x,h.y);ctx.stroke()});
      ctx.restore()}}
  // laser burns on the glass: white-hot, cooling through cyan to pink, then fading
  for(const h of holes){const life=h.t,a=life<5.5?1:Math.max(0,1-(life-5.5)/1.5),heat=Math.max(0,1-life/0.6);
    const g=srand(h.n*977+(h.x|0));ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.rot);ctx.globalAlpha=a;ctx.globalCompositeOperation='lighter';
    const pul=.85+.15*Math.sin(T*9+h.n);
    ctx.scale(1.5,1.5);let rg=ctx.createRadialGradient(0,0,0,0,0,46);rg.addColorStop(0,`rgba(255,63,164,${.6*pul})`);rg.addColorStop(.45,`rgba(255,63,164,${.2*pul})`);rg.addColorStop(1,'rgba(255,63,164,0)');ctx.fillStyle=rg;ctx.fillRect(-46,-46,92,92);
    // splash streaks
    ctx.lineCap='round';for(let k=0;k<h.n;k++){const ang=k/h.n*6.28+g()*.6,len=10+g()*22;ctx.strokeStyle=`rgba(63,240,255,${.75*pul})`;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(Math.cos(ang)*7,Math.sin(ang)*7);ctx.lineTo(Math.cos(ang)*len,Math.sin(ang)*len);ctx.stroke()}
    // scorch ring and the glowing core
    ctx.strokeStyle=`rgba(255,120,200,${.85*pul})`;ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,8.5,0,6.28);ctx.stroke();
    rg=ctx.createRadialGradient(0,0,0,0,0,7);rg.addColorStop(0,`rgba(255,255,255,${.6+.4*heat})`);rg.addColorStop(1,`rgba(63,240,255,${.7*pul})`);ctx.fillStyle=rg;ell(ctx,0,0,6,6);ctx.fill();
    if(heat>0){ctx.fillStyle=`rgba(255,255,255,${heat*.8})`;ell(ctx,0,0,18*heat+6,18*heat+6);ctx.fill()}
    ctx.restore()}
  ctx.globalAlpha=1;
}
/** A toy-like neon blaster, drawn along +x with the grip down. */
function drawGun(glow){
  ctx.save();ctx.lineWidth=1.6;ctx.strokeStyle='#0b0a12';
  ctx.fillStyle='#262a3c';rr(ctx,-6,-5,24,10,3);ctx.fill();ctx.stroke();
  ctx.fillStyle='#3a3f58';rr(ctx,16,-3,12,6,2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#262a3c';rr(ctx,-4,3,8,11,2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#3ff0ff';ctx.fillRect(-2,-2.2,15,2.2);
  ctx.fillStyle='#ff3fa4';ell(ctx,27,0,1.8,1.8);ctx.fill();
  if(glow){ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(28,0,1,28,0,14);g.addColorStop(0,'rgba(63,240,255,.8)');g.addColorStop(1,'rgba(63,240,255,0)');ctx.fillStyle=g;ctx.fillRect(14,-14,28,28)}
  ctx.restore();
}
function afterBother(){if(mood<22)startSulk();else setState('idle')}
function startSulk(){m.sulkKind='back';m.sulkIdx=sel;setState('sulk');say('흥.',1.4);
  if(m.sulkKind==='hide'){const b=cur();m.side=(m.x>b.cx)?1:-1}}
function splatWall(side){setState('splatW');m.vx=0;m.vy=0;m.side2=side;m.rot=0;pop('퍽!',m.x-side*(R+62),m.y-70,56);dust(m.x+side*20,m.y-30,8,1);bother(8);sfx('splat');buzz(40);shakeT=.25}
function splatGround(){setState('splatG');m.vx=0;m.vy=0;m.rot=0;pop('퍽!',m.x,FEET-60,56);dust(m.x,FEET,12,1.3);bother(9);sfx('splat');buzz(50);shakeT=.3}
function poke(){
  const recent=(m.pokes=(m.pokes||[]).filter(t=>T-t<2.4));recent.push(T);const n=recent.length;
  if(['held','air','splatW','splatG','enter','inside','exit'].includes(m.state))return;
  if(m.state==='sulk'){say(n>2?'건드리지 마!':'…',1);bother(2);m.react={type:'annoy',t:0,dur:.8};sfx('poke');return}
  if(n<=2){m.react={type:'flinch',t:0,dur:.45};bother(3);sfx('poke');m.sx=.8;m.sy=1.2;if(m.state==='sit')m.sitJolt=.3}
  else if(n<=5){m.react={type:'annoy',t:0,dur:1.3};bother(4);say(n===3?'왜…':'그만해라',1);sfx('poke')}
  else if(Z&&!['sulk','cling','roll'].includes(m.state)){bother(6);startShoot();return}
  else{m.react={type:'angry',t:0,dur:2.2};bother(6);say(['으아악!','화났어!!','진짜!!'][n%3],1.2);sfx('angry');buzz(30);m.stomp=1.5}
  if(m.state==='sit'&&n>2)setState('idle');
  if(mood<22&&n>2)setTimeout(()=>{if(GROUNDED.includes(m.state)&&m.state!=='sulk')startSulk()},900);
}
function pet(amount){
  if(['air','splatW','splatG','enter','inside','exit','roll'].includes(m.state))return;
  mood=clamp(mood+amount*.025,0,100);lastBother=T-6;saveMood();
  m.petT=.6;m.petRun=(T-(m.petLast||-9)<.8?(m.petRun||0):0)+amount;m.petLast=T;
  if(Z){ // the tough guy doesn't want to be petted… but doesn't really leave either
    if(T-(m.petSaid||-9)>4){m.petSaid=T;say(m.petRun>900?(Math.random()<.5?'…나쁘진 않군.':'…아무한테도 말하지 마.'):['…하지 마.','…쳇.','…그만해라.','…5초만이다.'][Math.floor(Math.random()*4)],1.4)}
    if(Math.random()<amount*.006){hearts(m.x,m.y-2*R-10);sfx('pet')}}
  else if(Math.random()<amount*.02){hearts(m.x,m.y-2*R-10);sfx('pet')}
}
function shake(){
  if((mode!=='browse'&&mode!=='launching')||['inside','enter','exit'].includes(m.state))return;
  cancelLaunch();shakeT=.5;m.behind=false;m.y=FEET;m.vy=0;setState('dizzy');say('어질어질…',1.6);bother(10);buzz(60);
}

/* ---------------- drawing ---------------- */
function skyNow(){if(skyMode!=='auto')return skyMode;const h=new Date().getHours();return(h>=6&&h<17)?'day':(h>=17&&h<19)?'dusk':'night'}
const SKY={day:['#7fc6f5','#d8f0ff','#b5cbe0'],dusk:['#5b4a8e','#ffa47a','#9d6f86'],night:['#0b0f2a','#2b2d5c','#1c2142']};
const stars=(()=>{const r=srand(77),a=[];for(let i=0;i<90;i++)a.push([r()*W,r()*420,r()*1.6+.4,r()*6]);return a})();
const SKY_P=4200;const skyline=(()=>{const r=srand(5),a=[];let x=0;while(x<SKY_P){const w=50+r()*90,h=80+r()*170;a.push({x,w,h,win:r()});x+=w+r()*14}return a})();
function drawSky(sk){
  const c=SKY[sk];let g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,c[0]);g.addColorStop(.62,c[1]);g.addColorStop(1,c[1]);ctx.fillStyle=g;ctx.fillRect(-200,-200,W+400,H+400);
  if(sk==='night'){ctx.fillStyle='#fff';stars.forEach(([x,y,r,ph])=>{ctx.globalAlpha=.4+.6*Math.abs(Math.sin(T*.8+ph));ctx.fillRect(x,y,r,r)});ctx.globalAlpha=1;
    ctx.fillStyle='#fff3c8';ell(ctx,1060,110,26,26);ctx.fill();ctx.fillStyle=c[0];ell(ctx,1072,102,22,22);ctx.fill()}
  else if(sk==='day'){ctx.fillStyle='#fff6c9';ell(ctx,1080,110,34,34);ctx.fill();ctx.fillStyle='rgba(255,246,201,.25)';ell(ctx,1080,110,56,56);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.85)';for(let i=0;i<4;i++){const x=((i*380-camX*.12+T*8)%1700+1700)%1700-200,y=80+i*38%120;ell(ctx,x,y,60,18);ctx.fill();ell(ctx,x+30,y-12,36,18);ctx.fill();ell(ctx,x-34,y-4,30,14);ctx.fill()}}
  else{ctx.fillStyle='#ffd18a';ell(ctx,1010,300,40,40);ctx.fill()}
}
function drawSkyline(sk){
  const col=SKY[sk][2],off=-camX*.42+640;
  ctx.fillStyle=col;skyline.forEach(s=>{const x=(((s.x+off)%SKY_P)+SKY_P)%SKY_P-300;if(x>-300&&x<W+300)ctx.fillRect(x,SIDE-s.h-40,s.w,s.h+60)});
  if(sk!=='day'){ctx.fillStyle=sk==='night'?'rgba(255,214,130,.7)':'rgba(255,214,150,.35)';skyline.forEach(s=>{const x=(((s.x+off)%SKY_P)+SKY_P)%SKY_P-300;if(x>-300&&x<W+300&&s.win>.4){for(let k=0;k<3;k++)ctx.fillRect(x+10+k*14,SIDE-s.h-20+((s.win*100|0)%3)*16,5,7)}})}
}
function drawGround(sk){
  const off=-camX+640,night=sk==='night';
  ctx.fillStyle=night?'#4a4855':'#c9c1b6';ctx.fillRect(-400,SIDE,W+800,62);
  ctx.strokeStyle=night?'rgba(0,0,0,.25)':'rgba(90,80,70,.18)';ctx.lineWidth=2;
  const s0=Math.floor((camX-1100)/64)*64;for(let x=s0;x<camX+1100;x+=64){ctx.beginPath();ctx.moveTo(x+off,SIDE);ctx.lineTo(x+off,SIDE+62);ctx.stroke()}
  ctx.fillStyle=night?'#6b6878':'#e3ddd4';ctx.fillRect(-400,SIDE+60,W+800,10);
  ctx.fillStyle=night?'#22222c':'#4b4a52';ctx.fillRect(-400,SIDE+70,W+800,700);
  ctx.fillStyle=night?'rgba(150,150,160,.35)':'rgba(190,190,196,.4)';const d0=Math.floor((camX-1100)/120)*120;for(let x=d0;x<camX+1100;x+=120)ctx.fillRect(x+off,SIDE+128,60,5);
}
/* ---- neon rain city ---- */
const skyFar=(()=>{const r=srand(11),a=[];let x=0;while(x<SKY_P){const w=60+r()*80,h=200+r()*260;a.push({x,w,h,s:r()});x+=w+r()*20}return a})();
function drawSkyNeon(){
  let g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#05040c');g.addColorStop(.45,'#140c2a');g.addColorStop(.72,'#3a1242');g.addColorStop(1,'#1a0c26');ctx.fillStyle=g;ctx.fillRect(-200,-200,W+400,H+400);
  const h=ctx.createRadialGradient(640,560,40,640,560,720);h.addColorStop(0,'rgba(255,63,164,.24)');h.addColorStop(1,'rgba(255,63,164,0)');ctx.fillStyle=h;ctx.fillRect(-200,0,W+400,H);
  ctx.fillStyle='rgba(120,70,160,.12)';for(let i=0;i<5;i++){const x=((i*330-camX*.06+T*14)%1700+1700)%1700-200,y=70+i*29%110;ell(ctx,x,y,180,26);ctx.fill()}
}
function drawSkylineNeon(){
  let off=-camX*.2+640;
  skyFar.forEach(s=>{const x=(((s.x+off)%SKY_P)+SKY_P)%SKY_P-300;if(x<-300||x>W+300)return;ctx.fillStyle='#1c1430';ctx.fillRect(x,SIDE-s.h-60,s.w,s.h+80);
    if(s.s>.7){ctx.fillStyle=`rgba(255,40,70,${.4+.6*Math.abs(Math.sin(T*2+s.x))})`;ctx.fillRect(x+s.w/2-2,SIDE-s.h-66,4,4)}});
  off=-camX*.42+640;
  skyline.forEach((s,i)=>{const x=(((s.x+off)%SKY_P)+SKY_P)%SKY_P-300;if(x<-300||x>W+300)return;const h=s.h*1.5;ctx.fillStyle='#120e1f';ctx.fillRect(x,SIDE-h-40,s.w,h+60);
    ctx.fillStyle=NEON[i%NEON.length];ctx.globalAlpha=.5;
    if(s.win>.55){for(let y=SIDE-h-20,k=0;y<SIDE-30;y+=14,k++){if((k+i)%3)ctx.fillRect(x+6,y,s.w-12,2)}}
    else if(s.win>.3)ctx.fillRect(x+s.w-5,SIDE-h-40,2,h);
    ctx.globalAlpha=1});
}
function drawGroundNeon(ox){
  const off=-camX+640;
  ctx.fillStyle='#1d1a28';ctx.fillRect(-400,SIDE,W+800,62);
  ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=2;const s0=Math.floor((camX-1100)/64)*64;for(let x=s0;x<camX+1100;x+=64){ctx.beginPath();ctx.moveTo(x+off,SIDE);ctx.lineTo(x+off,SIDE+62);ctx.stroke()}
  ctx.fillStyle='#2c2838';ctx.fillRect(-400,SIDE+60,W+800,10);
  ctx.fillStyle='#0d0c14';ctx.fillRect(-400,SIDE+70,W+800,700);
  ctx.fillStyle='rgba(255,63,164,.45)';const d0=Math.floor((camX-1100)/120)*120;for(let x=d0;x<camX+1100;x+=120)ctx.fillRect(x+off,SIDE+128,60,4);
  drawWetReflection(ox);
}
// Wet asphalt: the street above (last frame's picture of it) mirrored at the kerb, stretched
// down the way light smears on wet ground, softened, and rippled by the rain. Only the bright
// parts show (added light), so the neon, windows and lamps reflect and the dark walls don't.
// Puddles here and there hold a sharper mirror. Cheap: a quarter-size copy and a few dozen strips.
const REFL_H=360,REFL_Q=4;let reflBuf=null,reflCtx=null,reflReady=false;
function grabReflection(){
  if(!Z)return;
  const bw=Math.round(W/REFL_Q),bh=Math.round(REFL_H/REFL_Q);
  if(!reflBuf){reflBuf=view.document.createElement('canvas');reflBuf.width=bw;reflBuf.height=bh;reflCtx=reflBuf.getContext('2d')}
  try{reflCtx.setTransform(1,0,0,-1,0,bh);reflCtx.clearRect(0,0,bw,bh);reflCtx.drawImage(cv,0,(SIDE-REFL_H)*K,W*K,REFL_H*K,0,0,bw,bh);reflReady=true}catch(e){reflReady=false}
}
let reflOut=null,reflOutCtx=null;
function drawWetReflection(ox){
  if(!reflReady)return;
  const D=H-SIDE+40,stretch=.62,strip=2,bw=reflBuf.width,Q=2; // the mirror is foreshortened seen from above
  if(!reflOut){reflOut=view.document.createElement('canvas');reflOut.width=W/Q;reflOut.height=Math.ceil(D/Q);reflOutCtx=reflOut.getContext('2d')}
  const c=reflOutCtx;c.setTransform(1/Q,0,0,1/Q,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,W,D);c.imageSmoothingEnabled=true;
  // rippled strips, drawn opaque on their own layer (no seams where they overlap)
  for(let d=0;d<D;d+=strip){const v=d/stretch;if(v>=REFL_H)break;const amp=d<62?2.6:1.5;
    const wob=(Math.sin(d*.085+T*2.4)*1.6+Math.sin(d*.29-T*3.7)*.9)*amp*(1+d*.012);
    c.drawImage(reflBuf,0,v/REFL_Q,bw,Math.max(.5,strip/stretch/REFL_Q),wob,d,W,strip+1)}
  // the long vertical smear bright lights leave on a wet road
  c.globalCompositeOperation='lighter';c.globalAlpha=.28;c.drawImage(reflBuf,0,0,bw,reflBuf.height*.5,0,70,W,D*1.1);
  c.globalAlpha=.14;c.drawImage(reflBuf,0,0,bw,reflBuf.height*.28,0,70,W,D*1.6);
  // how strongly it shows: the rough sidewalk a little, the wet road a lot, fading with distance
  c.globalCompositeOperation='destination-in';c.globalAlpha=1;const g=c.createLinearGradient(0,0,0,D);
  g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(60/D,'rgba(0,0,0,.36)');g.addColorStop(64/D,'rgba(0,0,0,.05)');g.addColorStop(72/D,'rgba(0,0,0,.8)');g.addColorStop(1,'rgba(0,0,0,.18)');
  c.fillStyle=g;c.fillRect(0,0,W,D);
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.drawImage(reflOut,0,SIDE,W,D);
  // puddles: a sharper, brighter mirror in a few ragged pools, anchored to the street
  const p0=Math.floor((camX-900)/230);
  for(let k=p0;k<p0+9;k++){const h=hash(k*7919+13),px=k*230+(h%120)+ox,py=SIDE+86+((h>>>8)%70),rx=50+((h>>>4)%60),ry=9+((h>>>12)%7);
    if(px<-rx||px>W+rx||(h>>>20)%3===0)continue;
    ctx.save();ctx.beginPath();ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2);ctx.ellipse(px+rx*.45,py+ry*.5,rx*.5,ry*.7,0,0,Math.PI*2);ctx.clip();
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.5;ctx.fillStyle='#07060c';ctx.fillRect(px-rx-30,py-ry-10,rx*2+60,ry*3+20); // the water is darker than the asphalt
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.75;ctx.drawImage(reflOut,0,(py-SIDE-ry*2)/Q,W/Q,ry*4/Q,Math.sin(T*3+k)*.6,py-ry*2,W,ry*4);ctx.drawImage(reflOut,0,(py-SIDE-ry*2)/Q,W/Q,ry*4/Q,0,py-ry*2,W,ry*4);
    ctx.restore();
    ctx.globalAlpha=.25;ctx.strokeStyle='rgba(190,225,255,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(px,py,rx,ry,0,Math.PI*1.05,Math.PI*1.95);ctx.stroke()}
  ctx.restore();
}
const rain=[],splash=[];
function newDrop(d,top){d.z=rnd(.35,1);d.x=rnd(-60,W+260);d.y=top?rnd(-H,H):rnd(-160,-20);d.v=rnd(950,1300);d.l=rnd(14,26)*d.z;d.g=d.z>.6?rnd(SIDE+8,H):rnd(SIDE-40,SIDE+40);return d}
for(let i=0;i<200;i++)rain.push(newDrop({},true));
function updRain(dt){
  if(!Z)return;
  rain.forEach(d=>{d.y+=d.v*d.z*dt;d.x-=150*d.z*dt;if(d.y>d.g){if(d.z>.6&&splash.length<70)splash.push({x:d.x,y:d.g,t:0,z:d.z});newDrop(d,false)}});
  for(let i=splash.length-1;i>=0;i--){splash[i].t+=dt;if(splash[i].t>.32)splash.splice(i,1)}
}
function drawRain(){
  ctx.lineCap='round';
  [[.35,.6,.18,1],[.6,1.01,.34,1.6]].forEach(([lo,hi,a,lw])=>{ctx.strokeStyle=`rgba(180,215,255,${a})`;ctx.lineWidth=lw;ctx.beginPath();
    rain.forEach(d=>{if(d.z<lo||d.z>=hi)return;ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+d.l*.14,d.y-d.l)});ctx.stroke()});
  ctx.lineWidth=1.2;splash.forEach(s=>{const k=s.t/.32;ctx.strokeStyle=`rgba(190,225,255,${.5*(1-k)})`;ell(ctx,s.x,s.y,3+k*12*s.z,1+k*3*s.z);ctx.stroke()});
  const g=ctx.createLinearGradient(0,H-160,0,H);g.addColorStop(0,'rgba(120,60,170,0)');g.addColorStop(1,'rgba(120,60,170,.22)');ctx.fillStyle=g;ctx.fillRect(-300,H-160,W+600,460);
}
// Street lamps stand on the sidewalk in front of the shops (drawn after them),
// a bit lower than the shop roofs. Lit (night, dusk, or the neon city), each
// throws a cone of light down onto the shop front and a pool on the pavement.
const LAMP_TOP=SIDE-196;
// The lamp whose head leans over the picked shop burns full; the rest are dimmed.
// Levels ease, so the light follows you along the street.
let restT=0,selSeen=-1,flipPick=null; // flipPick: Ⓧ turned the screen round (true) or back
let LAMP_DIM=typeof host.lampDim==='number'?host.lampDim:.3;const lampLv=new Map();
// How fast the light follows depends on how fast you browse: resting on a shop,
// its lamp warms up slowly (~1 s); flicking through, the light keeps pace.
let lampRate=2.2;
function lampTick(dt){const nr=navRate(),want=clamp(2.2+Math.max(0,nr-1)*3,2.2,12);lampRate+=(want-lampRate)*(1-Math.exp(-dt*(want>lampRate?12:1.5)))}
function lampLevel(i,dt){const want=i===sel-1&&restT>.12?1:LAMP_DIM;let v=lampLv.get(i);if(v===undefined)v=want;
  const r=want>v?lampRate:(navRate()>=2?14:lampRate*1.3); // passed lamps drop at once while you rush
  v+=(want-v)*(1-Math.exp(-dt*r));lampLv.set(i,v);return v}
function drawLamp(x,sk,front,i=0){
  const lit=Z||sk!=='day',lc=Z?(i%2?'#ff3fa4':'#3ff0ff'):'#ffd98a',pole=Z?'#0c0b12':'#2f2a36';
  const hx=x+24,hy=LAMP_TOP-8;
  if(!front){
    ctx.fillStyle=pole;ctx.fillRect(x-3,LAMP_TOP,6,SIDE+40-LAMP_TOP);ctx.fillRect(x-9,SIDE+30,18,10);
    ctx.beginPath();ctx.moveTo(x,LAMP_TOP);ctx.quadraticCurveTo(x,LAMP_TOP-18,x+22,LAMP_TOP-15);ctx.lineWidth=5;ctx.strokeStyle=pole;ctx.stroke();
    ctx.fillStyle=pole;rr(ctx,x+12,LAMP_TOP-19,24,12,4);ctx.fill();
    ctx.fillStyle=lit?(Z?lc:'#fff1b8'):'#e8e2d0';ctx.fillRect(x+15,LAMP_TOP-9,18,4);
    return}
  if(!lit)return;
  const k=(Z?1:sk==='night'?1:.55)*(lampLv.get(i)??LAMP_DIM);
  ctx.save();ctx.globalCompositeOperation='lighter';
  // the cone, falling on the shop front and the pavement
  const cg=ctx.createLinearGradient(0,hy,0,SIDE+40);cg.addColorStop(0,hexA(lc,.26*k));cg.addColorStop(.75,hexA(lc,.08*k));cg.addColorStop(1,hexA(lc,0));
  ctx.fillStyle=cg;ctx.beginPath();ctx.moveTo(hx-9,hy);ctx.lineTo(hx+9,hy);ctx.lineTo(hx+100,SIDE+40);ctx.lineTo(hx-100,SIDE+40);ctx.closePath();ctx.fill();
  let g; // only the light falling down: no round glow at the bulb or on the wall (both themes)
  // the pool on the pavement
  g=ctx.createRadialGradient(hx,SIDE+34,4,hx,SIDE+34,130);g.addColorStop(0,hexA(lc,.3*k));g.addColorStop(1,hexA(lc,0));ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(hx,SIDE+34,140,34,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawBuilding(b,sk,ox){
  if(!b.fac)renderFacade(b);if(!b.img)loadArt(b);if(!b.card)renderCard(b);
  const left=b.cx-BW/2+ox,top=SIDE-b.bh,L=b.L,night=sk==='night',dusk=sk==='dusk',isSel=b.i===sel;
  premiumBeams(b,left,top,sk);
  ctx.drawImage(b.fac,left-b.facPad,top-b.facTop,BW+b.facPad*2,b.bh+b.facTop);
  if(Z){const nc=b.neon,fl=flick(b.i),a=L.awn;ctx.save();ctx.strokeStyle=nc;ctx.fillStyle=nc;ctx.globalAlpha=b.st==='dusty'?(Math.sin(T*9+b.i*5)*Math.sin(T*2.3+b.i)>.82?.9:.13):.5+.5*fl;ctx.shadowColor=nc;ctx.shadowBlur=14;ctx.lineWidth=3;
    // wavy tube under the cornice
    ctx.lineCap='round';ctx.beginPath();for(let k=0;k<=40;k++){const u=k/40;ctx.lineTo(left+22+u*(BW-44),top+26+Math.sin(u*Math.PI*4+b.i)*4)}ctx.stroke();
    ctx.lineWidth=2;rr(ctx,left+a.x+6,top+a.y-1,a.w-12,a.h+2,11);ctx.stroke();
    // vertical blade sign hanging off the right edge
    // horizontal sign: the info icons, in neon
    signName(ctx,b.g.t,left+BW/2,top+a.y+a.h/2,a.w-24,17,DISPLAY); // horizontal sign: the game's name, in neon
    ctx.restore();
    if(b.g.roof===1){ctx.fillStyle=`rgba(255,50,70,${Math.sin(T*4+b.i)>0?1:.25})`;ell(ctx,left+BW/2+42,top-34,3,3);ctx.fill()}}
  // windows
  const dusty=b.st==='dusty',closed=b.st==='closed';
  const lit=b.light*b.light*(3-2*b.light);const wins=L.wins.concat(L.up); // lights come up smoothly
  wins.forEach((w,j)=>{const x=left+w.x,y=top+w.y;
    ctx.fillStyle=night?'#1d2235':dusk?'#3b3a55':'#33405a';ctx.fillRect(x,y,w.w,w.h);
    if(!night){ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.moveTo(x,y+w.h*.7);ctx.lineTo(x+w.w*.6,y);ctx.lineTo(x+w.w*.85,y);ctx.lineTo(x,y+w.h);ctx.fill()}
    if(lit>.02){const day=!Z&&!night&&!dusk; // neon: warm amber interiors (magenta in a playing shop); town by day: cool blue, at dusk/night: warm
      let col=Z?'rgba(255,184,56,':day?'rgba(110,200,255,':'rgba(255,214,130,'; /* one steady colour, also while the penguin is inside */ctx.fillStyle=col+(lit*(night?.95:day?.9:.6))+')';ctx.fillRect(x,y,w.w,w.h);if(Z){const g2=ctx.createLinearGradient(0,y,0,y+w.h);g2.addColorStop(0,'rgba(255,90,40,0)');g2.addColorStop(1,`rgba(255,60,120,${lit*.35})`);ctx.fillStyle=g2;ctx.fillRect(x,y,w.w,w.h)}
      if(night){ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=col+(lit*.18)+')';ctx.fillRect(x-10,y-10,w.w+20,w.h+20);ctx.restore()}}
    if(closed){ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=2;for(let k=6;k<w.h;k+=7){ctx.beginPath();ctx.moveTo(x,y+k);ctx.lineTo(x+w.w,y+k);ctx.stroke()}}
    ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+w.w/2,y);ctx.lineTo(x+w.w/2,y+w.h);ctx.stroke()});
  // door
  const d=L.door,dx=left+d.x,dy=top+d.y;
  ctx.fillStyle=lit>.5||b.door>.05?'#3a2a20':'#1f1a22';ctx.fillRect(dx,dy,d.w,d.h);
  if(b.door>.05){let g=ctx.createLinearGradient(0,dy,0,dy+d.h);g.addColorStop(0,Z?'rgba(255,200,90,.9)':(!night&&!dusk)?'rgba(170,225,255,.9)':'rgba(255,214,140,.9)');g.addColorStop(1,Z?'rgba(255,150,50,.55)':'rgba(255,180,100,.5)');ctx.fillStyle=g;ctx.globalAlpha=b.door;ctx.fillRect(dx+3,dy+3,d.w-6,d.h-3);ctx.globalAlpha=1}
  const pw=d.w*(1-b.door*.82);ctx.fillStyle=Z?'#26232f':shade(b.g.tr,.15);ctx.fillRect(dx,dy,pw,d.h);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(dx+pw-3,dy,3,d.h);
  if(pw>20){ctx.fillStyle=night?'#2a3045':'#465673';ctx.fillRect(dx+pw*.2,dy+12,pw*.6,d.h*.4);if(lit>.05){ctx.fillStyle=Z?`rgba(255,196,72,${lit*.8})`:(!night&&!dusk)?`rgba(150,215,255,${lit*.8})`:`rgba(255,214,130,${lit*.8})`;ctx.fillRect(dx+pw*.2,dy+12,pw*.6,d.h*.4)}ctx.fillStyle='#e8c46a';ell(ctx,dx+pw-10,dy+d.h*.58,3.5,3.5);ctx.fill()}
  premiumBack(b,left,top,sk);
  // card (the readable part)
  const cs=isSel?1.05:1,cxp=left+L.card.x+CW/2,cyp=top+L.card.y+CH/2;
  const fa=(b.flip||0)*Math.PI,fx=Math.cos(fa),back=fx<0; // the screen turns round to show the info
  if(back&&!b.icon)loadIcon(b);if(back&&(!b.back||b.backKey!==infoKey(b)))renderBack(b);
  ctx.save();ctx.translate(cxp,cyp-Math.sin(fa)*6);ctx.scale(cs*Math.max(.02,Math.abs(fx))*(1+Math.sin(fa)*.04),cs*(1+Math.sin(fa)*.04));
  if(isSel&&Z){ctx.save();ctx.fillStyle='#0d0b14';rr(ctx,-CW/2-5,-CH/2-5,CW+10,CH+10,13);ctx.fill();ctx.strokeStyle=b.neon;ctx.shadowColor=b.neon;ctx.shadowBlur=18;ctx.lineWidth=3;rr(ctx,-CW/2-8,-CH/2-8,CW+16,CH+16,15);ctx.stroke();ctx.restore()}
  else if(isSel){ctx.fillStyle='#fff';rr(ctx,-CW/2-5,-CH/2-5,CW+10,CH+10,13);ctx.fill();ctx.strokeStyle='rgba(255,185,56,.9)';ctx.lineWidth=3;rr(ctx,-CW/2-8,-CH/2-8,CW+16,CH+16,15);ctx.stroke()}
  ctx.drawImage(back?b.back:b.card,-CW/2,-CH/2,CW,CH);
  if(Math.abs(fx)<.999){ctx.fillStyle=`rgba(0,0,0,${(1-Math.abs(fx))*.35})`;rr(ctx,-CW/2,-CH/2,CW,CH,10);ctx.fill()}
  if(Z){ // neon theme: every storefront screen is a CRT
    const gl=isSel&&Math.sin(T*17+b.i)>.985?rnd(-6,6):0;
    if(gl){ctx.save();ctx.globalAlpha=.45;ctx.globalCompositeOperation='lighter';ctx.drawImage(back?b.back:b.card,-CW/2+gl,-CH/2,CW,CH);ctx.restore()}
    ctx.save();rr(ctx,-CW/2,-CH/2,CW,CH,10);ctx.clip();
    ctx.fillStyle=hexA(b.neon,isSel?.08:.12);ctx.fillRect(-CW/2,-CH/2,CW,CH);
    ctx.fillStyle='rgba(0,0,0,.22)';for(let y=-CH/2+((T*24)%3);y<CH/2;y+=3)ctx.fillRect(-CW/2,y,CW,1.2);
    const by=((T*40+b.i*37)%(CH+40))-CH/2-20,bg=ctx.createLinearGradient(0,by,0,by+22);bg.addColorStop(0,'rgba(255,255,255,0)');bg.addColorStop(.5,'rgba(255,255,255,.09)');bg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=bg;ctx.fillRect(-CW/2,by,CW,22);
    const vg=ctx.createRadialGradient(0,0,CH*.35,0,0,CW*.62);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.42)');ctx.fillStyle=vg;ctx.fillRect(-CW/2,-CH/2,CW,CH);
    ctx.fillStyle='rgba(255,255,255,.07)';ctx.beginPath();ctx.ellipse(-CW*.22,-CH*.3,CW*.42,CH*.18,-.2,0,Math.PI*2);ctx.fill();
    if(!isSel){ctx.fillStyle=`rgba(5,4,12,${.16+.07*Math.sin(T*9+b.i*3)})`;ctx.fillRect(-CW/2,-CH/2,CW,CH)}
    ctx.restore();
    ctx.strokeStyle='#07060c';ctx.lineWidth=3;rr(ctx,-CW/2-1.5,-CH/2-1.5,CW+3,CH+3,11);ctx.stroke();
  }
  if(dusty){ctx.fillStyle='rgba(160,150,140,.22)';rr(ctx,-CW/2,-CH/2,CW,CH,10);ctx.fill()}
  if(night&&!isSel&&lit<.3){ctx.fillStyle='rgba(10,10,30,.25)';rr(ctx,-CW/2,-CH/2,CW,CH,10);ctx.fill()}
  ctx.restore();
  if(!Z){const a=L.awn,bx=left+a.x-4,by=top+a.y-5,bw2=a.w+8,bh2=a.h+10;
    ctx.fillStyle='rgba(0,0,0,.18)';rr(ctx,bx+2,by+3,bw2,bh2,7);ctx.fill();
    ctx.fillStyle='#fbf4e4';rr(ctx,bx,by,bw2,bh2,7);ctx.fill();ctx.strokeStyle=shade(b.g.tr,-.3);ctx.lineWidth=3;rr(ctx,bx+1.5,by+1.5,bw2-3,bh2-3,6);ctx.stroke();
    ctx.fillStyle=shade(b.g.tr,-.3);[bx+9,bx+bw2-9].forEach(x=>{ell(ctx,x,by+bh2/2,2.2,2.2);ctx.fill()});
    ctx.fillStyle='#3a3036';signName(ctx,b.g.t,bx+bw2/2,by+bh2/2,bw2-34,18,DISPLAY); // the game's name
    if(night||dusk){ctx.fillStyle=`rgba(16,18,40,${(night?.42:.2)*(1-lit)})`;rr(ctx,bx,by,bw2,bh2,7);ctx.fill()}}
  // state dressing
  if(dusty&&Z)drawDerelict(b,left,top,dx,dy,d);
  else if(dusty){ctx.fillStyle='rgba(150,142,132,.28)';ctx.fillRect(left,top,BW,b.bh);
    ctx.strokeStyle='rgba(240,240,240,.7)';ctx.lineWidth=1.2;web(left+2,top+16,1,1,46);web(left+BW-2,top+16,-1,1,38);web(dx+d.w-2,dy+2,-1,1,26);
    ctx.fillStyle='rgba(220,210,200,.5)';for(let k=0;k<7;k++){const px=left+((k*53+b.i*31)%BW),py=top+30+((k*97)%(b.bh-60))+Math.sin(T+k)*4;ctx.fillRect(px,py,2,2)}}
  if(closed){ // shutter + sign
    const sh=d.h*.72;ctx.fillStyle='#8d8f96';ctx.fillRect(dx-4,dy-2,d.w+8,sh);ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=1.5;for(let k=6;k<sh;k+=6){ctx.beginPath();ctx.moveTo(dx-4,dy-2+k);ctx.lineTo(dx+d.w+4,dy-2+k);ctx.stroke()}
    ctx.strokeStyle='#3a3036';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(dx+d.w/2-16,dy+sh-10);ctx.lineTo(dx+d.w/2,dy+sh-22);ctx.lineTo(dx+d.w/2+16,dy+sh-10);ctx.stroke();
    ctx.save();ctx.translate(dx+d.w/2,dy+sh-2);ctx.rotate(Math.sin(T*1.3+b.i)*.04);ctx.fillStyle='#f4ecdc';rr(ctx,-38,-12,76,26,5);ctx.fill();ctx.strokeStyle='#b8424a';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#b8424a';ctx.font='15px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('CLOSED',0,1.5);ctx.restore()}
  if(b.st==='downloading')drawScaffold(b,left,top);
  if(b.st==='new'||b.cele>0){if(Z)drawNeonOpening(b,left,top);else drawBalloons(b,left,top)}
  if(b.st==='recent'){ // OPEN neon + plant
    if(Z){if(b.door<.3){ // the classic neon OPEN sign (blue tube frame, red letters), hung on the door glass
      const x=dx+d.w/2,y=dy+34,on=flick(b.i+3);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      ctx.strokeStyle='#2a2533';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x-12,y-11);ctx.lineTo(x,dy+8);ctx.lineTo(x+12,y-11);ctx.stroke();
      ctx.fillStyle='rgba(8,6,14,.7)';rr(ctx,x-25,y-12,50,24,11);ctx.fill();
      ctx.strokeStyle='#3fa8ff';ctx.shadowColor='#3fa8ff';ctx.shadowBlur=12;ctx.lineWidth=2.2;rr(ctx,x-23,y-10,46,20,9);ctx.stroke();
      ctx.font='13px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=on>.5?'#ff3b4a':'rgba(255,59,74,.35)';ctx.shadowColor='#ff3b4a';ctx.shadowBlur=on>.5?14:0;ctx.fillText('OPEN',x,y+1);ctx.restore()}}
    else if(b.door<.3){ // a sign hung on the door glass, swinging a little
      const sx=dx+d.w/2,sy=dy+16,sw2=Math.sin(T*1.6+b.i)*.05;ctx.save();ctx.translate(sx,sy);ctx.fillStyle='#8a7a60';ell(ctx,0,0,2,2);ctx.fill();ctx.rotate(sw2);
      ctx.strokeStyle='#5a4a3a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-15,14);ctx.lineTo(0,0);ctx.lineTo(15,14);ctx.stroke();
      ctx.fillStyle='rgba(0,0,0,.2)';rr(ctx,-24,15,50,24,5);ctx.fill();ctx.fillStyle='#fffaf0';rr(ctx,-25,13,50,24,5);ctx.fill();ctx.strokeStyle='#c8323c';ctx.lineWidth=2;rr(ctx,-22.5,15.5,45,19,3.5);ctx.stroke();
      ctx.fillStyle='#c8323c';ctx.font='14px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('OPEN',0,26);ctx.restore()}
    const px=dx-22,py=SIDE;ctx.fillStyle='#a5583c';ctx.beginPath();ctx.moveTo(px-12,py-22);ctx.lineTo(px+12,py-22);ctx.lineTo(px+9,py);ctx.lineTo(px-9,py);ctx.fill();
    ctx.fillStyle='#4f9a5a';[[-8,-34,-.5],[0,-40,0],[8,-34,.5]].forEach(([a,bq,r])=>{ctx.save();ctx.translate(px+a,py+bq+Math.sin(T*2+a)*1);ctx.rotate(r);ell(ctx,0,0,5,11);ctx.fill();ctx.restore()})}
  premiumFront(b,left,top);drawAchMedal(b,left,top);
  }
/* ---- playtime tiers: 100h / 150h / 200h / 350h / 500h storefronts get fancier step by step, per theme ---- */
const TIER=[null,{n:host.tiers[1],h:'100h+',c:'#d79a5b'},{n:host.tiers[2],h:'150h+',c:'#f0c9a0'},{n:host.tiers[3],h:'200h+',c:'#cfd8e6'},{n:host.tiers[4],h:'350h+',c:'#bfe9ff'},{n:host.tiers[5],h:'500h+',c:'#ffd24a'}];
function tierOf(b){const h=b.hours||0;return h>=500?5:h>=350?4:h>=200?3:h>=150?2:h>=100?1:0}
function premiumBeams(b,left,top,sk){
  const t=tierOf(b);if(t<3||(!Z&&sk==='day'&&t<5))return;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const n=t>=5?(Z?4:3):t>=4?3:2;
  for(let k=0;k<n;k++){const bx=left+BW*(k+.5)/n,ang=Math.sin(T*.55+k*1.7+b.i)*.45+(k-(n-1)/2)*.18,len=900,wd=Z?10:46;
    const col=Z?(t>=5&&k%2?'#ffe14d':b.neon):'#fff2c4',a=Z?.45:(sk==='day'?.12:.22);
    ctx.save();ctx.translate(bx,top-4);ctx.rotate(ang);const g=ctx.createLinearGradient(0,0,0,-len);g.addColorStop(0,hexA(col,a));g.addColorStop(1,hexA(col,0));ctx.fillStyle=g;
    ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(3,0);ctx.lineTo(wd,-len);ctx.lineTo(-wd,-len);ctx.closePath();ctx.fill();ctx.restore()}
  ctx.restore();
}
function carpet(dx,d,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(dx+6,SIDE);ctx.lineTo(dx+d.w-6,SIDE);ctx.lineTo(dx+d.w+18,SIDE+56);ctx.lineTo(dx-18,SIDE+56);ctx.closePath();ctx.fill()}
function premiumBack(b,left,top,sk){
  const t=tierOf(b);if(!t)return;const L=b.L,d=L.door,dx=left+d.x,cx=left+BW/2,night=sk!=='day';
  tierUpgrades(b,left,top,t,night);
  if(!Z){
    const gold=ctx.createLinearGradient(0,top-2,0,top+18);gold.addColorStop(0,'#fff0a8');gold.addColorStop(.5,'#e6b23a');gold.addColorStop(1,'#a8781e');
    ctx.fillStyle=gold;ctx.fillRect(left-12,top-2,BW+24,5);ctx.fillRect(left-12,top+14,BW+24,3);
    L.wins.forEach((w,j)=>{const x=left+w.x,y=top+w.y+w.h+6;ctx.fillStyle='#7a4a2c';ctx.fillRect(x-4,y,w.w+8,7);ctx.fillStyle='#4f9a5a';ctx.fillRect(x-2,y-2,w.w+4,3);
      for(let k=0;k<6;k++){ctx.fillStyle=['#ff7f8e','#ffd65a','#ffffff'][(k+j)%3];ell(ctx,x+3+k*(w.w-6)/5,y-3+Math.sin(T*2+k)*.6,3.4,3.4);ctx.fill()}});
    if(t>=2){ // 150h: string lights
      ctx.strokeStyle='rgba(60,40,30,.6)';ctx.lineWidth=1;ctx.beginPath();for(let k=0;k<=20;k++){const u=k/20;ctx.lineTo(left+6+u*(BW-12),top+20+Math.sin(u*Math.PI)*16)}ctx.stroke();
      for(let k=0;k<11;k++){const u=k/10,x=left+6+u*(BW-12),y=top+22+Math.sin(u*Math.PI)*16,on=(k+Math.floor(T*3))%3!==0;
        ctx.fillStyle=on?(night?'#fff3b0':'#ffe48a'):'#8a7a50';ell(ctx,x,y,3.2,3.6);ctx.fill();
        if(on&&night){ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgba(255,230,150,.28)';ell(ctx,x,y,9,9);ctx.fill();ctx.restore()}}}
    if(t>=3){ // 200h: a flag on the roof
      const fx=left+BW-26;ctx.fillStyle='#5a4a3a';ctx.fillRect(fx,top-58,3,60);ctx.fillStyle=t>=5?'#e5484d':t>=4?'#f0c24a':'#86c9ff';ctx.beginPath();
      for(let k=0;k<=8;k++)ctx.lineTo(fx+3+k*4,top-58+Math.sin(T*6-k*.8)*2.5);for(let k=8;k>=0;k--)ctx.lineTo(fx+3+k*4,top-40+Math.sin(T*6-k*.8)*2.5);ctx.closePath();ctx.fill()}
    if(t>=4){ // 350h: the golden dome
      const dg=ctx.createRadialGradient(cx-14,top-40,4,cx,top-20,60);dg.addColorStop(0,'#fff6c8');dg.addColorStop(.5,'#f0c24a');dg.addColorStop(1,'#a8781e');ctx.fillStyle=dg;
      ctx.beginPath();ctx.moveTo(cx-50,top);ctx.bezierCurveTo(cx-50,top-58,cx+50,top-58,cx+50,top);ctx.closePath();ctx.fill();ctx.strokeStyle='#8a5e14';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.45)';ctx.beginPath();ctx.ellipse(cx-18,top-24,6,14,-.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a8781e';ctx.fillRect(cx-2,top-62,4,20);star(cx,top-68,9+Math.sin(T*3)*1.2,'#ffe27a')}
    if(t>=5){ // 500h: the red carpet
      carpet(dx,d,'#c0303a');ctx.strokeStyle='#f0c24a';ctx.lineWidth=2;ctx.stroke();
      [dx-26,dx+d.w+26].forEach(px=>{ctx.fillStyle='#e6b23a';ctx.fillRect(px-2,SIDE+8,4,30);ell(ctx,px,SIDE+8,4,4);ctx.fill()});
      ctx.strokeStyle='#9a1f2a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(dx-26,SIDE+14);ctx.quadraticCurveTo(dx-36,SIDE+30,dx-46,SIDE+18);ctx.moveTo(dx+d.w+26,SIDE+14);ctx.quadraticCurveTo(dx+d.w+36,SIDE+30,dx+d.w+46,SIDE+18);ctx.stroke()}
  }else{
    // chrome-gold arc over the card
    ctx.save();ctx.strokeStyle=t>=5?'#ffe14d':'#e8f6ff';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.lineWidth=2.5;ctx.lineCap='round';ctx.globalAlpha=.9;
    const ay=top+L.card.y-24;ctx.beginPath();ctx.moveTo(left+40,ay+10);ctx.quadraticCurveTo(left+BW/2,ay-18,left+BW-40,ay+10);ctx.stroke();
    star(left+BW/2,ay-5,5,ctx.strokeStyle);ctx.restore();
    if(t>=2){const x0=left+L.card.x-13,y0=top+L.card.y-13,w=CW+26,h=CH+26,step=12,n=Math.floor(2*(w+h)/step),sh=Math.floor(T*14);
      for(let k=0;k<n;k++){const p=k*step;let x,y;if(p<w){x=x0+p;y=y0}else if(p<w+h){x=x0+w;y=y0+p-w}else if(p<2*w+h){x=x0+w-(p-w-h);y=y0+h}else{x=x0;y=y0+h-(p-2*w-h)}
        const on=(k+sh)%4===0;ctx.fillStyle=on?(t>=5?'#ffe14d':b.neon):'rgba(255,255,255,.14)';ell(ctx,x,y,on?2.7:1.8,on?2.7:1.8);ctx.fill()}}
    if(t>=4){ // 350h: the spinning neon crown
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(cx,top-66);ctx.strokeStyle='#ffe14d';ctx.shadowColor='#ffe14d';ctx.shadowBlur=16;ctx.lineWidth=2.5;
      if(t>=5){ // 500h: the crown runs through the rainbow as it turns
        const h0=(T*70)%360,rg=ctx.createLinearGradient(-34,0,34,0);for(let k=0;k<=4;k++)rg.addColorStop(k/4,`hsl(${(h0+k*55)%360},100%,62%)`);
        ctx.strokeStyle=rg;ctx.shadowColor=`hsl(${(h0+110)%360},100%,60%)`;ctx.lineWidth=3}
      ctx.save();ctx.scale(Math.abs(Math.cos(T*1.4))*.85+.15,1);ctx.beginPath();ctx.moveTo(-34,14);ctx.lineTo(-34,-10);ctx.lineTo(-17,4);ctx.lineTo(0,-18);ctx.lineTo(17,4);ctx.lineTo(34,-10);ctx.lineTo(34,14);ctx.closePath();ctx.stroke();ctx.restore();
      ctx.lineWidth=1.5;ctx.strokeStyle=t>=5?`hsla(${(T*70+180)%360},100%,65%,.6)`:'rgba(255,225,77,.55)';ell(ctx,0,24,48,8);ctx.stroke();ctx.restore()}
    if(t>=5){ // 500h: the neon carpet
      carpet(dx,d,'#3a0f2a');ctx.save();ctx.strokeStyle='#ffe14d';ctx.shadowColor='#ffe14d';ctx.shadowBlur=10;ctx.lineWidth=2;ctx.stroke();ctx.restore();
      for(let k=0;k<5;k++){const u=(k/5+T*.6)%1;ctx.fillStyle=hexA('#ffe14d',.8*(1-u));ell(ctx,dx+d.w/2,SIDE+u*52,lerp(10,26,u),2);ctx.fill()}}
  }
}
/** The big, visible step of each tier (on top of the smaller trims): 150h marquee bulbs round
 *  the name sign, 200h columns on both sides, 350h a floor taller (makeBuilding), 500h gilded all round. */
function tierUpgrades(b,left,top,t,night){
  const L=b.L,a=L.awn;
  if(t>=3&&Z){ // neon frames on every window, and a pair of hologram koi circling over the roof
    const nc=t>=5?'#ffe14d':b.neon;ctx.save();ctx.strokeStyle=nc;ctx.shadowColor=nc;ctx.lineWidth=2;
    L.wins.concat(L.up).forEach((w,j)=>{const on=flick(b.i*3+j)>.5;ctx.globalAlpha=on?.95:.25;ctx.shadowBlur=on?10:0;rr(ctx,left+w.x-5,top+w.y-5,w.w+10,w.h+10,4);ctx.stroke()});
    ctx.restore();
    const cx=left+BW/2,cy=top-58,pc=t>=5?'#ffe14d':'#3ff0ff';
    // the projector and its faint beam
    ctx.fillStyle='#14121c';rr(ctx,cx-12,top-8,24,8,3);ctx.fill();ctx.fillStyle=pc;ell(ctx,cx,top-8,4,1.6);ctx.fill();
    ctx.save();ctx.globalCompositeOperation='lighter';const bg=ctx.createLinearGradient(0,top-8,0,cy-20);bg.addColorStop(0,hexA(pc,.22));bg.addColorStop(1,hexA(pc,0));ctx.fillStyle=bg;
    ctx.beginPath();ctx.moveTo(cx-4,top-8);ctx.lineTo(cx+4,top-8);ctx.lineTo(cx+90,cy-10);ctx.lineTo(cx-90,cy-10);ctx.closePath();ctx.fill();
    for(let k=0;k<2;k++){const th=T*.75+k*Math.PI+b.i,depth=Math.sin(th),x=cx+Math.cos(th)*92,y=cy+depth*14+Math.sin(T*2+k)*3,dir=-Math.sin(th)>=0?1:-1,sc=1.15+.35*(depth+1)/2;
      const col=k?(t>=5?'#ffb02e':'#ff3fa4'):pc,gl=Math.sin(T*15+k*3)>.96?rnd(-4,4):0;
      ctx.save();ctx.translate(x+gl,y);ctx.scale(dir*sc,sc);const sw=Math.sin(T*8+k)*.35;
      ctx.globalAlpha=.45+.35*(depth+1)/2;ctx.shadowColor=col;ctx.shadowBlur=12;ctx.strokeStyle=col;ctx.fillStyle=hexA(col,.28);ctx.lineWidth=1.6;
      ctx.beginPath();ctx.ellipse(0,0,17,7,0,0,Math.PI*2);ctx.fill();ctx.stroke(); // body
      ctx.save();ctx.translate(-16,0);ctx.rotate(sw);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-13,-9);ctx.quadraticCurveTo(-8,0,-13,9);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore(); // tail
      ctx.beginPath();ctx.moveTo(2,-6);ctx.quadraticCurveTo(-4,-13,-9,-6);ctx.stroke(); // dorsal fin
      ctx.beginPath();ctx.moveTo(4,5);ctx.lineTo(-1,11);ctx.lineTo(-3,5);ctx.stroke(); // side fin
      ctx.fillStyle=col;ell(ctx,10,-1.5,1.6,1.6);ctx.fill(); // eye
      ctx.globalAlpha*=.5;ctx.fillStyle='rgba(7,6,12,.6)';for(let yy=-7;yy<8;yy+=3)ctx.fillRect(-17,yy,34,1); // scanlines
      ctx.restore()}
    ctx.restore()}
  if(t>=3&&!Z){ // a rooftop garden: railing, little trees, a striped parasol
    const ry=top-2;
    ctx.strokeStyle=t>=5?'#c9982e':'#f4efe6';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(left+4,ry-20);ctx.lineTo(left+BW-4,ry-20);ctx.stroke();
    ctx.lineWidth=1.6;ctx.beginPath();for(let x=left+8;x<left+BW-4;x+=12){ctx.moveTo(x,ry-20);ctx.lineTo(x,ry)}ctx.stroke();
    // trees in tubs at both ends
    [[left+22,0],[left+BW-58,1]].forEach(([tx,q])=>{const sway=Math.sin(T*1.3+q*2+b.i)*1.5;
      ctx.fillStyle='#b0603a';ctx.fillRect(tx-9,ry-14,18,14);ctx.fillStyle='#8a4a2a';ctx.fillRect(tx-10,ry-15,20,3);
      ctx.fillStyle='#6a4a30';ctx.fillRect(tx-1.5,ry-30,3,16);
      ctx.fillStyle='#5aa05a';ell(ctx,tx+sway,ry-38,13,12);ctx.fill();ctx.fillStyle='#6fbf63';ell(ctx,tx-4+sway,ry-42,8,7);ctx.fill();
      ctx.fillStyle=q?'#ff8fa8':'#fff2a8';[[-6,-34],[5,-40],[2,-31]].forEach(([fx,fy])=>{ell(ctx,tx+fx+sway,ry+fy,2.2,2.2);ctx.fill()})});
    // the parasol over a little table
    const px=left+74;ctx.fillStyle='#6a4a30';ctx.fillRect(px-1.2,ry-46,2.4,44);ctx.fillStyle='#f4efe6';ctx.fillRect(px-10,ry-12,20,3);
    for(let k=0;k<6;k++){ctx.fillStyle=k%2?'#ffffff':(t>=5?'#e6b23a':'#e5484d');ctx.beginPath();ctx.moveTo(px,ry-52);ctx.lineTo(px-30+k*10,ry-38);ctx.lineTo(px-20+k*10,ry-38);ctx.closePath();ctx.fill()}
    ctx.fillStyle=t>=5?'#e6b23a':'#e5484d';for(let k=0;k<6;k++){ctx.beginPath();ctx.arc(px-25+k*10,ry-38,5,0,Math.PI);ctx.fill()}}
  if(t>=2){ // marquee bulbs round the name sign
    const x0=left+a.x-8,y0=top+a.y-9,w=a.w+16,h=a.h+18,n=26,sh=Math.floor(T*6);
    for(let k=0;k<n;k++){const p=k/n*2*(w+h);let x,y;if(p<w){x=x0+p;y=y0}else if(p<w+h){x=x0+w;y=y0+p-w}else if(p<2*w+h){x=x0+w-(p-w-h);y=y0+h}else{x=x0;y=y0+h-(p-2*w-h)}
      const on=(k+sh)%3!==0,col=Z?(t>=5?'#ffe14d':b.neon):(t>=5?'#ffe48a':'#fff3b0');
      ctx.fillStyle=on?col:(Z?'rgba(255,255,255,.12)':'#9a8a60');ell(ctx,x,y,on?3:2.4,on?3:2.4);ctx.fill();
      if(on&&(Z||night)){ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=hexA(col,.3);ell(ctx,x,y,8,8);ctx.fill();ctx.restore()}}}
  if(t>=5&&!Z){ // gilded: a gold edge round the whole building (Minimi Town only)
    ctx.save();ctx.strokeStyle='#e6b23a';ctx.lineWidth=4;ctx.strokeRect(left-1,top-1,BW+2,b.bh+1);ctx.restore();
    ctx.fillStyle='rgba(255,214,90,.10)';ctx.fillRect(left,top,BW,b.bh)}
}
/** Achievements as a medal pinned to the screen's top-right corner: bronze 50%+, silver 80%+, gold 100%
 *  (with a laurel and a PERFECT ribbon). Playtime tiers stay the building's own look. */
const ACH_TIER=[null,{c1:'#e3a16a',c2:'#9a5a2c',n:'#ff9a4a'},{c1:'#f4f7fb',c2:'#9aa6b8',n:'#bfe6ff'},{c1:'#fff1a8',c2:'#d39a16',n:'#ffe14d'}];
function achTier(b){const a=b.game.info&&b.game.info.ach;if(!a||!a[1])return 0;const p=a[0]/a[1];return p>=1?3:p>=.8?2:p>=.5?1:0}
function drawAchMedal(b,left,top){
  const t=achTier(b);if(!t)return;const L=b.L,M=ACH_TIER[t],a=b.game.info.ach,pct=Math.floor(a[0]/a[1]*100);
  // pinned to the screen's frame: it turns with the screen (Ⓧ) and is out of sight on the back
  const fx=Math.cos((b.flip||0)*Math.PI);if(fx<=.03)return;
  const cxp=left+L.card.x+CW/2,x=cxp+(left+L.card.x+CW-6-cxp)*fx,y=top+L.card.y-4,r=t===3?19:t===2?17:15,sw=Math.sin(T*1.7+b.i)*(.06+shakeT*1.2);
  ctx.save();ctx.translate(x,y);ctx.rotate(sw);ctx.scale(fx,1);
  // ribbon straps
  const rib=Z?['#1a0f24','#2a1636']:t===3?['#c8323c','#a0242c']:t===2?['#3a6fd0','#2a52a0']:['#3f8f5a','#2c6a42'];
  ctx.fillStyle=rib[0];ctx.beginPath();ctx.moveTo(-9,-18);ctx.lineTo(-1,-18);ctx.lineTo(4,8);ctx.lineTo(-4,8);ctx.closePath();ctx.fill();
  ctx.fillStyle=rib[1];ctx.beginPath();ctx.moveTo(1,-18);ctx.lineTo(9,-18);ctx.lineTo(4,8);ctx.lineTo(-4,8);ctx.closePath();ctx.fill();
  if(Z){ctx.strokeStyle=M.n;ctx.lineWidth=1;ctx.shadowColor=M.n;ctx.shadowBlur=6;ctx.beginPath();ctx.moveTo(-9,-18);ctx.lineTo(-4,8);ctx.moveTo(9,-18);ctx.lineTo(4,8);ctx.stroke();ctx.shadowBlur=0}
  ctx.translate(0,8+r);
  if(t===3){ // laurel
    ctx.fillStyle=Z?M.n:'#5f9a3a';if(Z){ctx.shadowColor=M.n;ctx.shadowBlur=8}
    for(const sd of [-1,1])for(let k=0;k<6;k++){const an=Math.PI*(.62+k*.11)*sd+(sd<0?Math.PI:0),lx=Math.cos(an)*(r+5),ly=Math.sin(an)*(r+5)*-1+4;ctx.save();ctx.translate(sd*Math.abs(lx),ly);ctx.rotate(sd*(.9+k*.22));ell(ctx,0,0,3,6.5);ctx.fill();ctx.restore()}
    ctx.shadowBlur=0}
  // the disc
  if(Z){ctx.fillStyle='#0d0b16';ell(ctx,0,0,r,r);ctx.fill();ctx.strokeStyle=M.n;ctx.lineWidth=2.6;ctx.shadowColor=M.n;ctx.shadowBlur=t===3?14+Math.sin(T*4)*5:9;ell(ctx,0,0,r,r);ctx.stroke();ell(ctx,0,0,r-5,r-5);ctx.lineWidth=1;ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=M.n}
  else{const g=ctx.createRadialGradient(-r*.35,-r*.4,2,0,0,r);g.addColorStop(0,M.c1);g.addColorStop(1,M.c2);ctx.fillStyle=g;ell(ctx,0,0,r,r);ctx.fill();ctx.strokeStyle=shade(M.c2,-.25);ctx.lineWidth=1.6;ctx.stroke();ell(ctx,0,0,r-4,r-4);ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=shade(M.c2,-.45)}
  ctx.font=(t===3?'12px ':'11px ')+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t===3?'100%':pct+'%',0,1);
  if(!Z){ // a glint sweeping across now and then
    const ph=(T*.45+b.i*.3)%1;if(ph<.25){ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();const gx=-r+ph/.25*2*r;ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.moveTo(gx-4,-r);ctx.lineTo(gx+3,-r);ctx.lineTo(gx-6,r);ctx.lineTo(gx-13,r);ctx.fill();ctx.restore()}}
  if(t===3){ // PERFECT ribbon under the medal
    ctx.translate(0,r+8);const w=58;ctx.fillStyle=Z?'#16081a':'#c8323c';
    ctx.beginPath();ctx.moveTo(-w/2-8,-6);ctx.lineTo(-w/2,-6);ctx.lineTo(-w/2,6);ctx.lineTo(-w/2-8,6);ctx.lineTo(-w/2-4,0);ctx.closePath();ctx.moveTo(w/2+8,-6);ctx.lineTo(w/2,-6);ctx.lineTo(w/2,6);ctx.lineTo(w/2+8,6);ctx.lineTo(w/2+4,0);ctx.closePath();ctx.fill();
    ctx.fillStyle=Z?'#16081a':'#e0414b';rr(ctx,-w/2,-7,w,14,3);ctx.fill();if(Z){ctx.strokeStyle=M.n;ctx.lineWidth=1.2;ctx.shadowColor=M.n;ctx.shadowBlur=8;rr(ctx,-w/2,-7,w,14,3);ctx.stroke()}
    ctx.fillStyle=Z?M.n:'#fff6d8';ctx.font='10px '+HEAVY;ctx.fillText('PERFECT',0,1);ctx.shadowBlur=0}
  ctx.restore();
  if(t===3&&fx>.9){for(let k=0;k<4;k++){const ph=(T*.9+k*.25+b.i*.1)%1;ctx.globalAlpha=Math.sin(ph*Math.PI);star(x+Math.cos(k*1.7+b.i)*30,y+18+Math.sin(k*2.3)*26,3+ph*4,Z?'#ffe14d':'#fff6c8')}ctx.globalAlpha=1}
}
function premiumFront(b,left,top){
  const t=tierOf(b);if(!t)return;const L=b.L,ti=TIER[t];
  if(t>=3&&b.i!==sel){ctx.save();ctx.strokeStyle=Z?(t>=5?'#ffe14d':b.neon):(t>=5?'#f0c24a':'#d8dee8');if(Z){ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=10}ctx.lineWidth=3;rr(ctx,left+L.card.x-4,top+L.card.y-4,CW+8,CH+8,12);ctx.stroke();ctx.restore()}
  ctx.save();ctx.translate(left+L.card.x-8,top+L.card.y-12);ctx.rotate(-.1);ctx.font='13px '+HEAVY;const txt=`${ti.n} ${ti.h}`,w=ctx.measureText(txt).width+18;
  if(Z){const c=t>=5?'#ffe14d':t>=3?b.neon:ti.c;ctx.fillStyle='rgba(10,8,20,.92)';rr(ctx,0,-11,w,22,6);ctx.fill();ctx.strokeStyle=c;ctx.shadowColor=c;ctx.shadowBlur=8;ctx.lineWidth=1.6;ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=c}
  else{const g=ctx.createLinearGradient(0,-11,0,11);g.addColorStop(0,'#ffffff');g.addColorStop(1,ti.c);ctx.fillStyle=g;rr(ctx,0,-11,w,22,6);ctx.fill();ctx.strokeStyle='rgba(60,40,20,.5)';ctx.lineWidth=1.4;ctx.stroke();ctx.fillStyle='#3a2a18'}
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,9,1);ctx.restore();
  if(t>=5){for(let k=0;k<7;k++){const ph=(T*.8+k*.37)%1,x=left+((k*83+b.i*29)%BW),y=top-60+((k*131)%(b.bh-40));ctx.globalAlpha=Math.sin(ph*Math.PI);star(x,y,4+ph*5,Z?'#ffe14d':'#fff6c8')}ctx.globalAlpha=1}
}
function web(x,y,sx,sy,r){ctx.beginPath();for(let k=0;k<=4;k++){const a=k/4*Math.PI/2;ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*r*sx,y+Math.sin(a)*r*sy)}for(let ring=1;ring<=3;ring++){const rr2=r*ring/3;ctx.moveTo(x+rr2*sx,y);for(let k=1;k<=4;k++){const a=k/4*Math.PI/2;ctx.lineTo(x+Math.cos(a)*rr2*sx*.92,y+Math.sin(a)*rr2*sy*.92)}}ctx.stroke()}
function drawScaffold(b,left,top){
  const L=b.L;ctx.strokeStyle='#c98a3a';ctx.lineWidth=5;
  const xs=[left+8,left+BW-8,left+L.card.x-14,left+L.card.x+CW+14];
  xs.forEach(x=>{ctx.beginPath();ctx.moveTo(x,top-6);ctx.lineTo(x,SIDE);ctx.stroke()});
  ctx.fillStyle='#a8743a';[top+L.card.y-18,top+L.awn.y-8].forEach(y=>{ctx.fillRect(left-6,y,BW+12,8)});
  ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(left+8,top+L.card.y-10);ctx.lineTo(left+L.card.x-14,top+L.awn.y-4);ctx.moveTo(left+BW-8,top+L.card.y-10);ctx.lineTo(left+L.card.x+CW+14,top+L.awn.y-4);ctx.stroke();
  // progress banner over the door
  const bw=184,bx=left+BW/2-bw/2,by=top+L.door.y+8;ctx.fillStyle='#f6e7b0';rr(ctx,bx,by,bw,40,6);ctx.fill();ctx.strokeStyle='#2b2018';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#2b2018';ctx.font='15px '+DISPLAY;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(host.lang==='en'?'Downloading':'다운로드 중',bx+10,by+13);ctx.textAlign='right';ctx.fillText(Math.floor(b.p)+'%',bx+bw-10,by+13);
  ctx.fillStyle='rgba(0,0,0,.15)';rr(ctx,bx+10,by+24,bw-20,9,4);ctx.fill();
  ctx.save();rr(ctx,bx+10,by+24,(bw-20)*b.p/100,9,4);ctx.clip();ctx.fillStyle='#ffb938';ctx.fillRect(bx+10,by+24,bw-20,9);ctx.fillStyle='#2b2018';for(let x=bx+10-20+(T*30%16);x<bx+bw;x+=16){ctx.beginPath();ctx.moveTo(x,by+33);ctx.lineTo(x+8,by+24);ctx.lineTo(x+14,by+24);ctx.lineTo(x+6,by+33);ctx.fill()}ctx.restore();
  // cone
  const cx=left+BW-30;ctx.fillStyle='#ff7a2f';ctx.beginPath();ctx.moveTo(cx-12,SIDE+26);ctx.lineTo(cx,SIDE-6);ctx.lineTo(cx+12,SIDE+26);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(cx-7,SIDE+8,14,5);ctx.fillStyle='#ff7a2f';ctx.fillRect(cx-16,SIDE+24,32,5);
}
function prng(seed){let t=seed>>>0;return()=>{t=(t+0x6D2B79F5)>>>0;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return((r^(r>>>14))>>>0)/4294967296}}
/** Broken glass that looks broken, not shot: jagged cracks that wander and fork out to the frame,
 *  from an impact near an edge, a long stress crack, or a piece fallen out. Same window, same cracks. */
function drawGlassCracks(x,y,w,h,seed){
  const R=prng(seed),inBox=(px,py)=>px>x+.5&&px<x+w-.5&&py>y+.5&&py<y+h-.5,lines=[];
  const walk=(px,py,ang,len,depth)=>{const pts=[[px,py]];let a=ang,l=0;
    while(l<len){const st=2.5+R()*4;a+=(R()-.5)*.7;const nx=px+Math.cos(a)*st,ny=py+Math.sin(a)*st;
      if(!inBox(nx,ny)){pts.push([clamp(nx,x,x+w),clamp(ny,y,y+h)]);break}
      px=nx;py=ny;pts.push([px,py]);l+=st;
      if(depth<2&&R()<.09){walk(px,py,a+(R()<.5?-1:1)*(.45+R()*.6),len*(.25+R()*.4),depth+1)}}
    lines.push([pts,depth])};
  const kind=R();ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.lineJoin='round';ctx.lineCap='round';
  let ix,iy;
  if(kind<.34){ // one long stress crack across the pane, with a few forks
    const e=R()<.5;ix=e?x+R()*w:x;iy=e?y:y+R()*h;walk(ix,iy,Math.atan2(y+h*(.3+R()*.4)-iy,x+w*(.4+R()*.5)-ix),w+h,0);
  }else{ // an impact somewhere off-centre: uneven spokes running out to the frame
    ix=x+w*(.15+R()*.7);iy=y+h*(.15+R()*.7);const n=5+Math.floor(R()*4);let a0=R()*6.28;
    for(let k=0;k<n;k++){a0+=6.28/n*(.55+R()*.9);walk(ix,iy,a0,(w+h)*(.35+R()*.6),0)}
    // a couple of short broken rings close to the impact (not a neat circle)
    for(let r=0;r<2;r++){const rad=4+r*5+R()*3,sa=R()*6.28,ea=sa+1.5+R()*2.5,pts=[];for(let t=sa;t<ea;t+=.35)pts.push([ix+Math.cos(t)*(rad+(R()-.5)*2.5),iy+Math.sin(t)*(rad+(R()-.5)*2.5)]);lines.push([pts,1])}
    if(kind>.72){ // a piece has fallen out
      const a1=R()*6.28,a2=a1+.5+R()*.7,poly=[[ix+(R()-.5)*3,iy+(R()-.5)*3]];
      for(let t=a1;t<=a2;t+=.12){const rr2=(w+h)*.18+R()*8;poly.push([ix+Math.cos(t)*rr2,iy+Math.sin(t)*rr2])}
      ctx.fillStyle='rgba(4,3,8,.92)';ctx.beginPath();poly.forEach(([px,py],k)=>k?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(210,230,255,.5)';ctx.lineWidth=.8;ctx.stroke()}
  }
  // shards sitting a little out of plane: a faint tint on one side of a crack
  ctx.fillStyle='rgba(180,210,255,.06)';ctx.beginPath();ctx.moveTo(ix,iy);ctx.lineTo(x+w,y+R()*h);ctx.lineTo(x+w,y+h);ctx.lineTo(x+R()*w,y+h);ctx.closePath();ctx.fill();
  for(const [pts,depth] of lines){if(pts.length<2)continue;
    ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=depth?.9:1.3;ctx.beginPath();pts.forEach(([px,py],k)=>k?ctx.lineTo(px+.7,py+.7):ctx.moveTo(px+.7,py+.7));ctx.stroke();
    ctx.strokeStyle=`rgba(225,238,255,${depth?.42:.68})`;ctx.lineWidth=depth?.6:.9;ctx.beginPath();pts.forEach(([px,py],k)=>k?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.stroke()}
  ctx.restore();
}
/** Neon Rain City, a game you haven't played in months: a run-down shop. Grime, cracked and
 *  boarded windows, torn posters, a tag on the wall (its tube sputters, see drawBuilding). */
function drawDerelict(b,left,top,dx,dy,d){
  const L=b.L,h=hash((b.appid>>>0)+7),wins=L.wins.concat(L.up);
  ctx.save();
  ctx.fillStyle='rgba(6,5,10,.38)';ctx.fillRect(left,top,BW,b.bh); // grime over everything
  // rust / water streaks running down from the sills
  wins.forEach((w,j)=>{const x=left+w.x+6+((h>>>j)%Math.max(1,w.w-12)),y=top+w.y+w.h+4,len=26+((h>>>(j+3))%40);
    const g=ctx.createLinearGradient(0,y,0,y+len);g.addColorStop(0,'rgba(120,70,40,.45)');g.addColorStop(1,'rgba(120,70,40,0)');ctx.fillStyle=g;ctx.fillRect(x,y,4,len)});
  // the windows: one boarded up, the others cracked, one with a shard missing
  const board=(h>>>2)%wins.length;
  wins.forEach((w,j)=>{const x=left+w.x,y=top+w.y;
    if(j===board){ctx.fillStyle='#4a3a2c';[[0,.18],[0,.62]].forEach(([,v])=>{ctx.save();ctx.translate(x+w.w/2,y+w.h*v+6);ctx.rotate(((h>>>j)%2?1:-1)*.12);ctx.fillRect(-w.w/2-5,-6,w.w+10,12);ctx.fillStyle='#2e241b';ctx.fillRect(-w.w/2-2,-1,3,3);ctx.fillRect(w.w/2-1,-1,3,3);ctx.fillStyle='#4a3a2c';ctx.restore()});return}
    if(((h>>>(j+4))%3)===0&&j!==(board+1)%wins.length)return; // some panes survived
    drawGlassCracks(x,y,w.w,w.h,(h^(j*2654435761))>>>0)});
  // torn posters, half peeled off
  [[dx-31,dy+18,'#ff3fa4'],[dx+d.w-9,dy+40,'#ffe14d']].forEach(([px,py,c],q)=>{ctx.save();ctx.translate(px+20,py+20);ctx.scale(.62,.62);ctx.rotate((q?-1:1)*(.06+((h>>>q)%10)/100));
    ctx.fillStyle=hexA(c,.32);ctx.beginPath();ctx.moveTo(-18,-22);ctx.lineTo(18,-22);ctx.lineTo(18,6);ctx.lineTo(9,12);ctx.lineTo(4,4);ctx.lineTo(-5,16);ctx.lineTo(-18,10);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(-13,-16,26,3);ctx.fillRect(-13,-10,18,2);ctx.restore()});
  // a spray tag by the door
  ctx.strokeStyle='rgba(77,255,154,.55)';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.beginPath();const tx0=dx+d.w+6,ty0=dy+d.h-26;
  ctx.moveTo(tx0,ty0);for(let k=1;k<9;k++)ctx.lineTo(tx0+k*5,ty0+Math.sin(k*1.7+h)*7-(k%2)*4);ctx.stroke();
  ctx.fillStyle='rgba(77,255,154,.35)';ctx.fillRect(tx0+12,ty0+6,2,8);
  // litter on the pavement
  ctx.fillStyle='rgba(180,170,160,.35)';ell(ctx,dx-14,SIDE-3,7,2.5);ctx.fill();ctx.fillStyle='rgba(120,200,255,.25)';ctx.fillRect(dx+d.w+18,SIDE-6,8,5);
  ctx.restore();
}
/** Neon Rain City's own grand opening: delivery drones hanging a light string over the screen,
 *  a flickering hologram banner over the door, and LED ticker pillars scrolling the news. */
function drawNeonOpening(b,left,top){
  const L=b.L,d=L.door,isNew=b.st==='new';
  ctx.save();
  // drones + the light string they carry
  const cy0=top+L.card.y-26,xL=left+L.card.x-6,xR=left+L.card.x+CW+6,bob=k=>Math.sin(T*2.4+k*1.9+b.i)*4;
  const pL={x:xL,y:cy0+bob(0)},pR={x:xR,y:cy0+bob(1)};
  ctx.strokeStyle='rgba(20,18,28,.9)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(pL.x,pL.y+8);ctx.quadraticCurveTo((pL.x+pR.x)/2,cy0+44,pR.x,pR.y+8);ctx.stroke();
  const bulbs=['#ff3fa4','#3ff0ff','#ffe14d','#b26bff','#4dff9a'];
  for(let k=1;k<16;k++){const t=k/16,x=(1-t)*(1-t)*pL.x+2*t*(1-t)*((pL.x+pR.x)/2)+t*t*pR.x,y=(1-t)*(1-t)*(pL.y+8)+2*t*(1-t)*(cy0+44)+t*t*(pR.y+8);
    const on=((Math.floor(T*6)+k)%4)!==0,c=bulbs[k%5];ctx.fillStyle=on?c:hexA(c,.3);ctx.shadowColor=c;ctx.shadowBlur=on?10:0;ell(ctx,x,y+3,3,3.6);ctx.fill()}
  ctx.shadowBlur=0;
  [pL,pR].forEach((p,q)=>{ctx.fillStyle='#14121c';rr(ctx,p.x-13,p.y-4,26,9,4);ctx.fill();ctx.fillStyle='#2a2636';ctx.fillRect(p.x-20,p.y-7,40,2.5);
    ctx.fillStyle='rgba(200,220,255,.35)';[-17,17].forEach(o=>{const w2=7+Math.sin(T*60+o)*2;ctx.fillRect(p.x+o-w2,p.y-9,w2*2,1.5)});
    const blink=Math.sin(T*5+q*2)>.6;ctx.fillStyle=blink?(q?'#4dff9a':'#ff3b4a'):'#3a2a2a';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=blink?8:0;ell(ctx,p.x,p.y+2,2,2);ctx.fill();ctx.shadowBlur=0});
  if(isNew){
    // the hologram banner, projected down from a little emitter under the name sign
    const ex=left+BW/2,ey=top+L.awn.y+L.awn.h+6,hy=ey+20,hw=BW-86,gl=Math.sin(T*13+b.i)>.94?rnd(-5,5):0,fl=.75+.25*Math.sin(T*31+b.i)*Math.sin(T*7);
    ctx.fillStyle='#1a1724';rr(ctx,ex-9,ey-4,18,6,3);ctx.fill();ctx.fillStyle='#3ff0ff';ell(ctx,ex,ey+1,2.5,1.5);ctx.fill();
    ctx.globalCompositeOperation='lighter';
    const cg=ctx.createLinearGradient(0,ey,0,hy+12);cg.addColorStop(0,'rgba(63,240,255,.32)');cg.addColorStop(1,'rgba(63,240,255,.04)');ctx.fillStyle=cg;
    ctx.beginPath();ctx.moveTo(ex-4,ey+2);ctx.lineTo(ex+4,ey+2);ctx.lineTo(ex+hw/2,hy+12);ctx.lineTo(ex-hw/2,hy+12);ctx.closePath();ctx.fill();
    ctx.font='15px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.globalAlpha=fl*.55;ctx.fillStyle='#ff3fa4';ctx.fillText('GRAND OPENING',ex+gl-1.5,hy);
    ctx.globalAlpha=fl;ctx.fillStyle='#8ff8ff';ctx.shadowColor='#3ff0ff';ctx.shadowBlur=12;ctx.fillText('GRAND OPENING',ex+gl+1,hy);ctx.shadowBlur=0;
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='rgba(7,6,12,.28)';for(let y=hy-9+((T*30)%3);y<hy+9;y+=3)ctx.fillRect(ex-hw/2,y,hw,1);
    // LED ticker pillars on both sides of the door
    const msg=(host.lang==='en'?'GRAND OPENING   GRATZ   ':'GRAND OPENING   축 개업   ');
    [left+d.x-24,left+d.x+d.w+24].forEach((px,q)=>{const ph=78,pt=SIDE-ph,pw=18;
      ctx.fillStyle='#0b0a10';rr(ctx,px-pw/2-2,pt-2,pw+4,ph+2,4);ctx.fill();ctx.strokeStyle='#ffb02e';ctx.lineWidth=1.5;ctx.shadowColor='#ffb02e';ctx.shadowBlur=6;rr(ctx,px-pw/2,pt,pw,ph-2,3);ctx.stroke();ctx.shadowBlur=0;
      ctx.save();rr(ctx,px-pw/2+1,pt+1,pw-2,ph-4,3);ctx.clip();ctx.font='11px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';
      const chars=[...msg],step=12,off=(T*26+q*60)%(chars.length*step);
      for(let k=-1;k<ph/step+2;k++){const idx=((Math.floor(off/step)+k)%chars.length+chars.length)%chars.length,y=pt+6+k*step-(off%step);ctx.fillStyle='#ffc24a';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=6;ctx.fillText(chars[idx],px,y)}
      ctx.restore();ctx.fillStyle='rgba(0,0,0,.35)';for(let y=pt+2;y<SIDE-2;y+=2)ctx.fillRect(px-pw/2+1,y,pw-2,.6)});
  }
  ctx.restore();
}
/** A new game's shop: a GRAND OPENING ribbon over the door and congratulation flower stands. */
function drawGrandOpening(b,left,top){
  const L=b.L,y=top+L.awn.y+L.awn.h+17,w=BW-70,x0=left+35,h=20,sw=Math.sin(T*2+b.i)*1.5;
  ctx.save();
  // swallowtail ends
  [[x0,-1],[x0+w,1]].forEach(([ex,sd])=>{ctx.fillStyle=Z?'#5a0f3a':'#9e1f2a';ctx.beginPath();ctx.moveTo(ex,y-h/2+3);ctx.lineTo(ex+sd*20,y-h/2+3+sw);ctx.lineTo(ex+sd*13,y+3+sw);ctx.lineTo(ex+sd*20,y+h/2+3+sw);ctx.lineTo(ex,y+h/2+3);ctx.fill()});
  ctx.fillStyle=Z?'#16081a':'#d6303c';rr(ctx,x0,y-h/2,w,h,3);ctx.fill();
  ctx.strokeStyle=Z?'#ffd24a':'#ffd98a';ctx.lineWidth=1.5;if(Z){ctx.shadowColor='#ffd24a';ctx.shadowBlur=8}rr(ctx,x0+3,y-h/2+3,w-6,h-6,2);ctx.stroke();
  if(Z){for(let k=0;k<14;k++){const on=((Math.floor(T*8)+k)%3)===0;ctx.fillStyle=on?'#fff3b0':'rgba(255,210,74,.35)';ell(ctx,x0+6+k*(w-12)/13,y-h/2-3,1.8,1.8);ctx.fill()}}
  ctx.font='13px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=Z?'#ffe27a':'#fff6d8';ctx.fillText('GRAND OPENING',left+BW/2,y+1);
  ctx.restore();
  // flower stands on both sides of the door (축 개업)
  const d=L.door;[left+d.x-26,left+d.x+d.w+26].forEach((fx,q)=>{
    const fy=SIDE-58,r=19;ctx.strokeStyle=Z?'#2a2533':'#7a5a3a';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx-11,SIDE);ctx.moveTo(fx,fy);ctx.lineTo(fx+11,SIDE);ctx.moveTo(fx,fy);ctx.lineTo(fx,SIDE);ctx.stroke();
    const pet=Z?['#ff3fa4','#ffd24a','#b26bff']:['#ff8fa8','#fff2a8','#ffb6c9'];
    for(let k=0;k<12;k++){const a=k/12*Math.PI*2;ctx.fillStyle=pet[k%3];if(Z){ctx.shadowColor=pet[k%3];ctx.shadowBlur=6}ell(ctx,fx+Math.cos(a)*r,fy-14+Math.sin(a)*r,6.5,6.5);ctx.fill()}
    ctx.shadowBlur=0;ctx.fillStyle=Z?'#2a1030':'#5f9a54';ell(ctx,fx,fy-14,11,11);ctx.fill();
    // the ribbon hanging down the middle
    ctx.fillStyle=Z?'#ffd24a':'#d6303c';ctx.fillRect(fx-5,fy-14,10,host.lang==='en'?54:40);ctx.fillStyle=Z?'#16081a':'#fff6d8';ctx.font='8px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';
    (host.lang==='en'?['G','R','A','T','Z']:['축','개','업']).forEach((ch,k)=>ctx.fillText(ch,fx,fy-6+k*10));
  });
}
function drawBalloons(b,left,top){
  const L=b.L,cols=['#ff7f8e','#ffb938','#86c9ff','#62d6b2','#c79bff'];
  [[left+6,-1],[left+BW-6,1]].forEach(([ax,sd],q)=>{
    const ay=SIDE-10;for(let k=0;k<3;k++){const bx=ax+sd*(10+(k%2)*14)+Math.sin(T*1.6+k+q)*5,by=top+L.card.y+CH-10-k*34+Math.cos(T*1.3+k)*4;
      ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(ax+sd*8,(ay+by)/2,bx,by+18);ctx.stroke();
      ctx.fillStyle=cols[(k+q*2+b.i)%5];ell(ctx,bx,by,13,16);ctx.fill();ctx.fillStyle='rgba(255,255,255,.45)';ell(ctx,bx-4,by-6,3,5);ctx.fill();ctx.fillStyle=cols[(k+q*2+b.i)%5];ctx.beginPath();ctx.moveTo(bx-3,by+18);ctx.lineTo(bx+3,by+18);ctx.lineTo(bx,by+14);ctx.fill()}});
  if(b.st==='new')drawGrandOpening(b,left,top);
}

/* the minimi: an original round baby penguin (scarf in town; in the neon city tactical gear: short-sleeve shirt, leather shoulder rig, fingerless gloves, toy blaster) */
function drawMinimi(sx,f){
  const s=m.state;ctx.save();
  // shadow
  const air=Math.max(0,FEET-m.y);if(!m.behind&&m.alpha>0){ctx.fillStyle=`rgba(0,0,0,${.22*m.alpha*Math.max(.25,1-air/300)})`;ell(ctx,sx,FEET+3,R*(1.05-Math.min(.5,air/500))*m.scale,7*m.scale);ctx.fill()}
  ctx.globalAlpha=m.alpha;ctx.translate(sx,m.y);ctx.scale(m.scale,m.scale);
  // locomotion pose
  const moving=(s==='move'||s==='goDoor'||s==='dizzy'||s==='cling'||s==='enter'||s==='exit')&&(Math.abs(m.vx)>15||s==='enter'||s==='exit');
  const ph=m.phase,mod=m.mode;
  // profile blend: turn to show the side while walking/running
  const spd=Math.abs(m.vx),wantP=((s==='move'||s==='goDoor')&&spd>((m.prof||0)>.5?20:45))||s==='trip'||(s==='cling'&&spd>15);
  m.prof=(m.prof||0)+((wantP?1:0)-(m.prof||0))*(wantP?.16:.08);
  if(spd>70&&m.prof>.3)m.fdir=Math.sign(m.vx);else if(m.prof<.06||m.fdir===undefined)m.fdir=m.dir; // don't flip which side we show mid-turn
  const pf=m.prof*m.prof*(3-2*m.prof),dd=m.fdir||1;m.pfE=pf;
  let bob=0,lean=0,fl=0,fr=0,armL=.25,armR=.25,sxx=m.sx,syy=m.sy,rot=m.rot;
  if(moving){const amp=mod==='sprint'?9:mod==='run'?6:3.5;bob=Math.abs(Math.sin(ph))*amp;fl=Math.max(0,Math.sin(ph))*8;fr=Math.max(0,-Math.sin(ph))*8;lean=(mod==='sprint'?.2:mod==='run'?.12:.05)*m.dir;armL=.25+Math.sin(ph)*(mod==='walk'?.5:1.1);armR=.25-Math.sin(ph)*(mod==='walk'?.5:1.1)}
  // penguin waddle: rock side to side, smaller hop
  if(moving){bob*=.45;rot+=Math.sin(ph)*(mod==='sprint'?.08:.15)}
  if(s==='idle'&&m.pantT>0){syy*=1+Math.sin(T*16)*.035;sxx*=1-Math.sin(T*16)*.02}
  else if(s==='idle'||s==='react'){syy*=1+Math.sin(T*2.4)*.018}
  if(s==='sit'){syy*=.86;sxx*=1.06;lean=-m.lookUp*.1*m.dir;if(m.sitJolt>0){m.sitJolt-=.016;bob=6}}
  if(s==='held'){fl=-4;fr=-2;armL=-2.4;armR=-2.4;syy*=1.12;sxx*=.92;bob=Math.sin(T*9)*2}
  if(s==='air'){armL=-2.2+Math.sin(T*30)*.6;armR=-2.2-Math.sin(T*30)*.6;fl=6;fr=2}
  if(s==='splatW'){sxx=.5;syy=1.22;armL=-1.6;armR=-1.6}
  if(s==='splatG'){sxx=1.75;syy=.34;armL=1.4;armR=1.4}
  if(s==='recover'){const k=clamp(m.t/.5,0,1);sxx=lerp(.8,1,k)+Math.sin(m.t*30)*.05*(1-k);syy=lerp(1.2,1,k)}
  if(s==='trip'){rot=m.dir*1.45*clamp(m.t*6,0,1);bob=-2;armL=-1.8;armR=-1.8;fl=8;fr=12}
  if(s==='getup'){rot=m.dir*1.45*(1-clamp(m.t/.45,0,1));syy*=1+Math.sin(m.t*20)*.04}
  if(s==='collapse'){rot=m.dir*1.5*clamp(m.t*4,0,1);armL=1.6;armR=.4}
  if(s==='dizzy'){rot=Math.sin(m.t*5)*.28}
  if(s==='yawn'){const k=Math.sin(clamp(m.t/1.5,0,1)*Math.PI);syy*=1+k*.12;sxx*=1-k*.05;armL=-2.6*k+.25*(1-k);armR=armL}
  if(s==='cling'&&m.vx===0){lean=m.dir*.32;armL=m.dir>0?.25:-1.55;armR=m.dir>0?-1.55:.25;syy*=1+Math.sin(T*25)*.02}
  if(s==='hesitate'){lean=-.12*m.dir}
  if(s==='enter'){sxx*=1-.35*Math.sin(clamp(m.t/.16,0,1)*Math.PI)} // quick turn toward the door
  if(m.react&&m.react.type==='angry'){bob=Math.abs(Math.sin(T*18))*5;armL=-1+Math.sin(T*18)*.6;armR=-1-Math.sin(T*18)*.6}
  if(m.react&&m.react.type==='flinch'){const k=1-m.react.t/m.react.dur;sxx*=1-.15*k;syy*=1+.15*k}
  if(m.petT>0&&s!=='held'){if(Z){const away=hand.a>.3&&hand.x>m.x?-1:1;lean=away*.2+Math.sin(T*7)*.02;syy*=.95;sxx*=1.03;armL=.1;armR=.1}else{syy*=1+Math.sin(T*10)*.03;armL=-.6;armR=-.6}}
  if(s==='sulk'&&m.sulkKind==='back'){syy*=.86;sxx*=1.06}
  if(s==='cheer'){armL=-2.4;armR=-2.4}
  // neon city: blaster out while chasing, at the door, and when it's had enough
  const armed=Z&&s!=='inside';
  const aiming=Z&&((s==='move'&&(mod==='run'||mod==='sprint')&&spd>120)||s==='goDoor');
  if(aiming&&moving)lean+=.08*dd;
  if(s==='brace'){lean=0;bob=0;rot=0;armR=2.75;armL=.25+Math.sin(T*3)*.05}
  if(s==='shoot'){const rc=m.recoil||0,tg=(m.targets||[])[Math.min(2,m.shots||0)];const sideR=!tg||tg.x>=sx;if(sideR){armR=2.1;armL=.35}else{armL=2.1;armR=.35}syy*=1+rc*.05;bob=-rc*3;rot=0}
  // squash recovery towards 1
  m.sx+=(1-m.sx)*.15;m.sy+=(1-m.sy)*.15;
  sxx*=1-.1*pf;
  ctx.translate(0,-bob);
  if(aiming&&moving&&spd>200){ // chase streaks
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineWidth=2.4;
    for(let k=0;k<3;k++){const y=-R*(.55+k*.5),x0=-dd*(R+6),len=26+k*10+Math.sin(T*20+k)*6;ctx.strokeStyle=`rgba(63,240,255,${.45-k*.1})`;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x0-dd*len,y);ctx.stroke()}
    ctx.restore()}
  ctx.translate(0,-R);ctx.rotate(rot+lean);ctx.translate(0,R);
  ctx.scale(sxx,syy);
  const back=(s==='sulk'&&m.sulkKind==='back')||(s==='enter'&&m.t>.08);
  const ink='#26283a',navy=Z?'#2b3550':'#33405e',navyD=Z?'#1c233a':'#222c46',belly=f.red>0?mix('#ffffff','#ffc2b6',f.red):'#ffffff';
  const coat='#4b5249',coatD='#30352f',leather='#86562f',leatherD='#4d2f19',neonC='#3ff0ff'; // neon city: tactical shirt + leather shoulder rig
  ctx.lineWidth=3;ctx.strokeStyle=ink;
  // orange feet
  const sitting=s==='sit'||(s==='sulk'&&m.sulkKind==='back');
  ctx.fillStyle='#ff9d3a';
  if(sitting){ell(ctx,-13,-3,10,6);ctx.fill();ctx.stroke();ell(ctx,13,-3,10,6);ctx.fill();ctx.stroke()}
  else{const k=moving?Math.cos(ph)*5*m.dir:0,fw=11*(1-pf*.45),f0=dd*pf*4;ell(ctx,-fw+k+f0,-3-fl,10,5.5);ctx.fill();ctx.stroke();ell(ctx,fw-k+f0,-3-fr,10,5.5);ctx.fill();ctx.stroke()}
  // body
  const bodyPath=()=>{ctx.beginPath();ctx.moveTo(-R*.98,-R*.6);ctx.bezierCurveTo(-R*1.06,-R*2.75,R*1.06,-R*2.75,R*.98,-R*.6);ctx.bezierCurveTo(R*1.0,R*.02,-R*1.0,R*.02,-R*.98,-R*.6);ctx.closePath()};
  let gr=ctx.createRadialGradient(-8,-R*1.85,3,0,-R*1.2,R*1.6);gr.addColorStop(0,'#5d6d94');gr.addColorStop(.55,navy);gr.addColorStop(1,navyD);
  ctx.fillStyle=gr;bodyPath();ctx.fill();
  ctx.save();bodyPath();ctx.clip();
  if(!back){ // heart-shaped white face mask + round belly
    // the two eye patches slide together into one cheek patch in profile
    const cx=dd*R*.42,mrx=lerp(R*.43,R*.5,pf),mry=lerp(R*.37,R*.42,pf);ctx.fillStyle=belly;ell(ctx,lerp(-R*.33,cx,pf),-R*1.36,mrx,mry);ctx.fill();ell(ctx,lerp(R*.33,cx,pf),-R*1.36,mrx,mry);ctx.fill();ell(ctx,dd*pf*R*.3,-R*.6,R*.72*(1-pf*.22),R*.82);ctx.fill()}
  if(Z){ // tactical outfit, drawn around the body as a cylinder so front, side and back are one outfit
    // how far the body has turned: 0 = facing us, ±π/2 = side-on, π = back (it spins round at the door)
    const turn=s==='enter'?Math.PI*clamp(m.t/.16,0,1)*(dd||1):back?Math.PI:dd*pf*Math.PI/2;
    const hw=y=>y>-R*1.0?R*1.02:R*1.02*Math.sqrt(Math.max(0,1-((y+R*1.0)/(R*1.24))**2)); // body half-width at y
    const P=(th,y)=>{const a=th+turn;return [Math.sin(a)*hw(y),y,Math.cos(a)]};
    const path=(pts,w,col)=>{ // a strap: only the parts on the side facing us
      ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';ctx.lineJoin='round';let on=false;ctx.beginPath();
      for(const [x,y,v] of pts){if(v>-.02){on?ctx.lineTo(x,y):ctx.moveTo(x,y);on=true}else on=false}ctx.stroke()};
    const strap=(th0,y0,th1,y1,n=14)=>{const pts=[];for(let k=0;k<=n;k++){const t2=k/n;pts.push(P(lerp(th0,th1,t2),lerp(y0,y1,t2)))}path(pts,6,leatherD);path(pts,4,leather)};
    // shirt: the neckline dips at the front and rises at the back, wherever the front happens to be
    const neck=th=>-R*1.16+R*.2*Math.cos(th)-R*.06*Math.cos(th)**8;
    ctx.fillStyle=coat;ctx.beginPath();
    for(let k=0;k<=40;k++){const x=-R*1.5+k/40*R*3,r=hw(-R*1.05),q=clamp(x/r,-1,1),th=Math.asin(q)-turn;ctx.lineTo(x,neck(th)+(1-Math.sqrt(1-q*q))*R*.08)}
    ctx.lineTo(R*1.5,R);ctx.lineTo(-R*1.5,R);ctx.closePath();ctx.fill();
    ctx.strokeStyle=coatD;ctx.lineWidth=2;ctx.beginPath();for(let k=0;k<=40;k++){const x=-R*1.5+k/40*R*3,r=hw(-R*1.05),q=clamp(x/r,-1,1),th=Math.asin(q)-turn;ctx.lineTo(x,neck(th)+(1-Math.sqrt(1-q*q))*R*.08)}ctx.stroke();
    // button placket down the front
    {const [x,,v]=P(0,-R*.9);if(v>.15){ctx.strokeStyle=coatD;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x,neck(0)+2);ctx.lineTo(x,-R*.5);ctx.stroke()}}
    // shoulder rig: over each shoulder, down the front to a holster at the side, and across the back in an X
    [-1,1].forEach(sd=>{
      // straps start at the shoulder, right at the neckline (a penguin's shoulders are low)
      strap(sd*.62,neck(.62)+3,sd*1.42,-R*.7);                     // front strap down to the holster
      strap(sd*(Math.PI-.62),neck(Math.PI-.62)+3,sd*(Math.PI+1.42),-R*.62,18); // back strap, across the back to the other hip
    });
    // holsters at the sides, grips forward
    [-1,1].forEach(sd=>{const [x,y,v]=P(sd*1.42,-R*.66);if(v<-.25)return;ctx.save();ctx.translate(x,y);ctx.rotate(sd*.18*Math.cos(turn));ctx.globalAlpha*=clamp((v+.25)/.3,0,1);
      ctx.fillStyle='#1b1e22';rr(ctx,-3,-11,6,8,1.5);ctx.fill();
      ctx.fillStyle=leather;ctx.strokeStyle=leatherD;ctx.lineWidth=1.4;rr(ctx,-5,-5,10,15,3);ctx.fill();ctx.stroke();
      ctx.fillStyle=neonC;ctx.fillRect(-3.5,2,7,1.1);ctx.restore()});
    // magazine pouches where the back straps cross
    [-.2,.2].forEach(dth=>{const [x,,v]=P(Math.PI+dth,-R*1.0);if(v<.1)return;ctx.save();ctx.translate(x,-R*1.06);ctx.scale(Math.max(.3,v),1);
      ctx.fillStyle=leather;ctx.strokeStyle=leatherD;ctx.lineWidth=1.4;rr(ctx,-5,0,10,15,2);ctx.fill();ctx.stroke();ctx.fillStyle=leatherD;ctx.fillRect(-5,0,10,4);ctx.fillStyle=neonC;ctx.fillRect(-5,13,10,1.2);ctx.restore()});
    // belt all the way round: buckle at the front, a pouch on each hip
    ctx.fillStyle='#23271f';ctx.fillRect(-R*1.5,-R*.5,R*3,R*.24);
    {const [x,,v]=P(0,-R*.4);if(v>.1){ctx.save();ctx.translate(x,0);ctx.scale(Math.max(.3,v),1);ctx.fillStyle='#c9ced8';rr(ctx,-4,-R*.52,8,R*.28,1.5);ctx.fill();ctx.restore()}}
    [-1,1].forEach(sd=>{const [x,,v]=P(sd*1.05,-R*.4);if(v<.05)return;ctx.save();ctx.translate(x,0);ctx.scale(Math.max(.35,v),1);ctx.fillStyle=coatD;ctx.strokeStyle='#1b1e22';ctx.lineWidth=1.2;rr(ctx,-6,-R*.5,12,13,2);ctx.fill();ctx.stroke();ctx.restore()});
  }
  ctx.restore();
  ctx.strokeStyle=ink;ctx.lineWidth=3;bodyPath();ctx.stroke();
  const sw=Math.sin(T*3+m.phase*.5)*.15+(moving?-m.dir*.25:0)+(s==='air'?Math.sin(T*25)*.4:0);
  if(Z){ // spiky crest and a neon earpiece with a mic
    ctx.save();ctx.translate(dd*pf*R*.15,-R*2.16);ctx.rotate(sw-dd*pf*.25);ctx.strokeStyle=navyD;ctx.lineWidth=3.2;ctx.lineCap='round';
    [[-6,-.7],[-2,-.25],[2,.2],[6,.65]].forEach(([x,a])=>{ctx.beginPath();ctx.moveTo(x*.5,2);ctx.quadraticCurveTo(x+Math.sin(a)*4,-5,x+Math.sin(a)*9,-10);ctx.stroke()});ctx.restore();
    if(!back){const ed=pf>.3?dd:1,ex=ed*R*(.9-pf*.3)+dd*pf*R*.1,ey=-R*1.55;
      ctx.strokeStyle='#14182a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ex,ey+4);ctx.quadraticCurveTo(ex-ed*2,-R*1.05,ex-ed*R*.38,-R*1.0);ctx.stroke();
      ctx.fillStyle='#14182a';ell(ctx,ex,ey,5,6);ctx.fill();ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=`rgba(63,240,255,${.7+.3*Math.sin(T*4)})`;ell(ctx,ex,ey,2.2,2.2);ctx.fill();ctx.restore();
      ctx.fillStyle=neonC;ell(ctx,ex-ed*R*.38,-R*1.0,1.8,1.8);ctx.fill()}}
  else{ // fluffy head tuft + knit scarf
    ctx.save();ctx.translate(0,-R*2.16);ctx.rotate(sw);ctx.strokeStyle=navyD;ctx.lineWidth=3;ctx.lineCap='round';
    [[-4,-.5],[0,0],[4,.5]].forEach(([x,a])=>{ctx.beginPath();ctx.moveTo(x*.5,2);ctx.quadraticCurveTo(x+Math.sin(a)*3,-4,x+Math.sin(a)*6,-8);ctx.stroke()});ctx.restore();
    ctx.save();ctx.beginPath();ctx.moveTo(-R*1.02,-R*1.04);ctx.quadraticCurveTo(0,-R*.82,R*1.02,-R*1.04);ctx.lineTo(R*1.0,-R*.78);ctx.quadraticCurveTo(0,-R*.56,-R*1.0,-R*.78);ctx.closePath();
    ctx.fillStyle='#e5484d';ctx.fill();ctx.lineWidth=2.4;ctx.strokeStyle=ink;ctx.stroke();ctx.clip();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;
    for(let x=-R*1.1;x<=R;x+=8){ctx.beginPath();ctx.moveTo(x,-R*1.1);ctx.lineTo(x+4,-R*.5);ctx.stroke()}ctx.restore();
    const td=-dd;ctx.save();ctx.translate(td*R*.62,-R*.82);ctx.rotate(td*(.25+Math.sin(T*4+ph)*.12+(moving?.35:0)));ctx.fillStyle='#e5484d';ctx.strokeStyle=ink;ctx.lineWidth=2.2;rr(ctx,-4.5,0,9,17,3);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.fillRect(-4.5,13,9,2);ctx.restore()}
  // flippers
  ctx.lineWidth=2.6;
  [[-1,armL],[1,armR]].forEach(([sd,a])=>{const far=sd!==dd,fa=far?clamp((.7-pf)/.35,0,1):1;if(fa<=.02)return;ctx.save();ctx.translate(sd*R*.92*(1-(far?0:pf*.72)),-R*1.08);
    let r=sd*-a*.9;if(!far&&pf>0&&!['held','air','splatW','splatG','trip'].includes(s))r=lerp(r,(moving?Math.sin(ph)*.75:0)-dd*.12,pf);if(aiming&&!far)r=-dd*1.35+Math.sin(ph*2)*.04; // arm out, aiming ahead
    ctx.rotate(r);ctx.fillStyle=navy;ctx.beginPath();ctx.ellipse(sd*2.5*fa,12,Math.max(.5,5.8*fa),15,sd*-.12,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(Z){ctx.save();ctx.beginPath();ctx.ellipse(sd*2.5*fa,12,Math.max(.5,5.8*fa),15,sd*-.12,0,Math.PI*2);ctx.clip();
      ctx.fillStyle=coat;ctx.fillRect(-12,-6,24,13);ctx.fillStyle='#1d2027';ctx.fillRect(-12,19,24,12);ctx.fillStyle=neonC;ctx.fillRect(-12,19,24,1.1);ctx.restore();
      ctx.strokeStyle=ink;ctx.lineWidth=2.6;ctx.beginPath();ctx.ellipse(sd*2.5*fa,12,Math.max(.5,5.8*fa),15,sd*-.12,0,Math.PI*2);ctx.stroke()}
    if(armed&&s!=='shoot'&&(s==='brace'?sd===1:!far)){ctx.translate(sd*2.5*fa,24);ctx.rotate(Math.PI/2);ctx.scale(1,s==='brace'?1:dd);drawGun(s==='brace'&&m.t>.25||aiming)} // always in hand; held low unless aiming
    ctx.restore()});
  if(s==='shoot'){ // aimed at the glass: the blaster points at where the shot lands
    const rc=m.recoil||0,tg=(m.targets||[])[Math.min(2,m.shots||0)]||{x:640,y:380};
    const side=tg.x>=sx?1:-1,gx=side*R*1.05,gy=-R*1.15,py=m.y+gy-bob,ang=Math.atan2(tg.y-py,tg.x-(sx+gx)),left=Math.cos(ang)<0;
    m.muzzle={x:sx+gx+Math.cos(ang)*36,y:py+Math.sin(ang)*36};
    ctx.save();ctx.translate(gx,gy);ctx.rotate(ang);ctx.translate(8-rc*5,0);ctx.scale(1,left?-1:1);drawGun(true);
    if(flashT>0){ctx.globalCompositeOperation='lighter';star(30,0,22,'rgba(255,63,164,.9)');star(30,0,13,'rgba(63,240,255,.95)');star(30,0,6,'#ffffff')}
    ctx.restore()}
  if(!back)drawFace(f);
  else{ // back view: little tail nub
    ctx.fillStyle=navyD;ctx.strokeStyle=ink;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-7,-R*.3);ctx.quadraticCurveTo(0,-R*.3+14+Math.sin(T*8)*1.5,7,-R*.3);ctx.closePath();ctx.fill();ctx.stroke()}
  ctx.restore();
  // extras in screen-ish space (not rotated)
  const hx=sx,hy=m.y-2.45*R*m.scale-bob-6;
  if(f.sweat&&m.alpha>.5){ctx.fillStyle='#9fd8ff';ctx.strokeStyle='#3a6a8a';ctx.lineWidth=1.5;const k=(T*1.8)%1;ctx.globalAlpha=1-k;ctx.beginPath();const x=hx+R*.95*(m.dir||1),y=hy+16+k*14;ctx.moveTo(x,y-7);ctx.quadraticCurveTo(x+6,y+2,x,y+4);ctx.quadraticCurveTo(x-6,y+2,x,y-7);ctx.fill();ctx.stroke();ctx.globalAlpha=1}
  if(f.zzz){ctx.fillStyle='#fff';ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.font='22px '+DISPLAY;ctx.textAlign='center';for(let k=0;k<2;k++){const ph2=((T*.7+k*.5)%1);ctx.globalAlpha=1-ph2;ctx.strokeText('z',hx+22+ph2*18,hy-ph2*30);ctx.fillText('z',hx+22+ph2*18,hy-ph2*30)}ctx.globalAlpha=1}
  if(f.stars){for(let k=0;k<3;k++){const a=T*5+k*2.1;star(hx+Math.cos(a)*30,hy+6+Math.sin(a)*8,6,'#ffd65a')}}
  if(f.brow==='angry'&&m.react&&m.react.type==='angry'){ctx.strokeStyle='#e5484d';ctx.lineWidth=3;const vx=hx+18,vy=hy+8;ctx.beginPath();for(let k=0;k<4;k++){const a=k*Math.PI/2+.4;ctx.moveTo(vx+Math.cos(a)*3,vy+Math.sin(a)*3);ctx.lineTo(vx+Math.cos(a)*9,vy+Math.sin(a)*9)}ctx.stroke()}
}
function star(x,y,r,col){ctx.fillStyle=col;ctx.beginPath();for(let k=0;k<10;k++){const a=k*Math.PI/5-Math.PI/2,rr2=k%2?r*.45:r;ctx.lineTo(x+Math.cos(a)*rr2,y+Math.sin(a)*rr2)}ctx.closePath();ctx.fill()}
function mix(a,b,t){const p=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];const A=p(a),Bc=p(b);return`rgb(${A.map((v,i)=>Math.round(lerp(v,Bc[i],t))).join(',')})`}
function drawFace(f){
  const ink='#26283a',d=m.fdir||m.dir||1,pf=m.pfE||0,lx=f.lookX!=null?f.lookX:d*(4+pf*R*.3),ly=f.lookY,ey=-R*1.4+ly,ex=R*.34*(1-pf*.5),farA=clamp((.55-pf)/.35,0,1);
  // blush
  if(f.blush>0){ctx.fillStyle=`rgba(255,130,140,${.45*f.blush})`;[-1,1].forEach(sd=>{if(sd!==d&&farA<.5)return;ell(ctx,sd*R*.56*(1-pf*.75)+lx-d*pf*3,-R*1.1+pf*2,6-pf*1.5,3.8);ctx.fill()})}
  ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=2.8;ctx.lineCap='round';
  const E=(x,side)=>{
    switch(f.eyes){
      case 'open':ell(ctx,x,ey,4.6,6.4);ctx.fill();ctx.fillStyle='#fff';ell(ctx,x+1.4,ey-2.4,1.7,1.9);ctx.fill();ctx.fillStyle=ink;break;
      case 'wide':ctx.fillStyle='#fff';ell(ctx,x,ey,6,7.5);ctx.fill();ctx.stroke();ctx.fillStyle=ink;ell(ctx,x,ey+1,2.6,3);ctx.fill();break;
      case 'blink':ctx.beginPath();ctx.moveTo(x-5,ey+1);ctx.lineTo(x+5,ey+1);ctx.stroke();break;
      case 'happy':ctx.beginPath();ctx.arc(x,ey+2,5,Math.PI*1.1,Math.PI*1.9);ctx.stroke();break;
      case 'closedU':ctx.beginPath();ctx.arc(x,ey-1,5,Math.PI*.15,Math.PI*.85);ctx.stroke();break;
      case 'half':ell(ctx,x,ey+2,4.4,3.6);ctx.fill();ctx.beginPath();ctx.moveTo(x-6,ey-1);ctx.lineTo(x+6,ey-1);ctx.stroke();break;
      case 'squint':ctx.beginPath();ctx.moveTo(x-5*side,ey-4);ctx.lineTo(x+4*side,ey);ctx.lineTo(x-5*side,ey+4);ctx.stroke();break;
      case 'x':case 'x2':ctx.beginPath();ctx.moveTo(x-4.5,ey-4.5);ctx.lineTo(x+4.5,ey+4.5);ctx.moveTo(x+4.5,ey-4.5);ctx.lineTo(x-4.5,ey+4.5);ctx.stroke();break;
      case 'spiral':ctx.lineWidth=2;ctx.beginPath();for(let a=0;a<12;a+=.4){const r=a*.55;ctx.lineTo(x+Math.cos(a+T*8*side)*r,ey+Math.sin(a+T*8*side)*r)}ctx.stroke();ctx.lineWidth=2.8;break;
      case 'angry':ell(ctx,x,ey+1.5,4.4,5);ctx.fill();break;
      case 'tear':ell(ctx,x,ey,4.4,6);ctx.fill();ctx.fillStyle='#9fd8ff';ell(ctx,x+side*1,ey+9,2.4,3.4);ctx.fill();ctx.fillStyle=ink;break;
    }};
  [-1,1].forEach(sd=>{const far=sd!==d;if(far&&farA<=.02)return;const x=sd*ex+lx;ctx.save();if(far){ctx.translate(x,ey);ctx.scale(farA,1);ctx.translate(-x,-ey)}E(x,sd);ctx.restore();ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=2.8});
  if(f.brow){ctx.beginPath();const by=ey-10;
    if(f.brow==='angry'){ctx.moveTo(-ex+lx-6,by-3);ctx.lineTo(-ex+lx+5,by+2);ctx.moveTo(ex+lx+6,by-3);ctx.lineTo(ex+lx-5,by+2)}
    else if(f.brow==='worry'){ctx.moveTo(-ex+lx-6,by+2);ctx.lineTo(-ex+lx+5,by-2);ctx.moveTo(ex+lx+6,by+2);ctx.lineTo(ex+lx-5,by-2)}
    else{ctx.moveTo(-ex+lx-5,by);ctx.lineTo(-ex+lx+5,by);ctx.moveTo(ex+lx-5,by);ctx.lineTo(ex+lx+5,by)}ctx.stroke()}
  // beak: the mouth expressions become how wide it opens
  const mx=d*(3.2+pf*R*.72),my=-R*1.13+ly*.4;
  let o=0,jx=0;
  switch(f.mouth){case 'open':o=.6;break;case 'o':o=.5;break;case 'o2':o=.3;break;case 'scream':o=1;break;
    case 'pant':o=.35+Math.abs(Math.sin(T*16))*.3;break;case 'yawn':o=Math.sin(clamp(m.t/1.3,0,1)*Math.PI)*1.1;break;case 'wavy':jx=Math.sin(T*30)*1.2;break}
  const bx=mx+jx;ctx.lineWidth=2;ctx.strokeStyle=ink;
  const sk=clamp((pf-.3)/.4,0,1);if(sk>0){ctx.save();ctx.globalAlpha*=sk; // side-on beak, cross-faded with the front one
    if(o>.05){ctx.fillStyle='#5a2236';ell(ctx,bx+d*3,my+2+o*2,4,1+o*3);ctx.fill();ctx.fillStyle='#ff9d3a';ctx.beginPath();ctx.moveTo(bx-d*2,my+2);ctx.quadraticCurveTo(bx+d*5,my+3+o*6,bx+d*9,my+2+o*5);ctx.lineTo(bx-d*2,my+5);ctx.closePath();ctx.fill();ctx.stroke()}
    ctx.fillStyle='#ff9d3a';ctx.beginPath();ctx.moveTo(bx-d*3,my-4);ctx.quadraticCurveTo(bx+d*6,my-4,bx+d*12,my+.5);ctx.quadraticCurveTo(bx+d*5,my+3,bx-d*3,my+3);ctx.closePath();ctx.fill();ctx.stroke();
    if(f.mouth==='frown'||f.mouth==='pout'){ctx.strokeStyle='rgba(38,40,58,.5)';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(bx-d*2,my+8);ctx.lineTo(bx+d*6,my+9);ctx.stroke()}
    ctx.restore();ctx.strokeStyle=ink;ctx.lineWidth=2;if(sk>=1)return}
  ctx.save();ctx.globalAlpha*=1-sk;
  if(o>.05){ctx.fillStyle='#5a2236';ell(ctx,bx,my+3+o*3,4.2,1.5+o*4);ctx.fill();
    ctx.fillStyle='#ff9d3a';ctx.beginPath();ctx.moveTo(bx-4.5,my+3+o*6);ctx.quadraticCurveTo(bx,my+8+o*7,bx+4.5,my+3+o*6);ctx.closePath();ctx.fill();ctx.stroke()}
  ctx.fillStyle='#ff9d3a';ctx.beginPath();ctx.moveTo(bx-6.5,my-1.5);ctx.quadraticCurveTo(bx,my-6.5,bx+6.5,my-1.5);ctx.quadraticCurveTo(bx+2.5,my+3.5,bx,my+4.5);ctx.quadraticCurveTo(bx-2.5,my+3.5,bx-6.5,my-1.5);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.6)';ell(ctx,bx-2,my-2.5,2,1);ctx.fill();
  if(f.mouth==='frown'||f.mouth==='pout'){ctx.strokeStyle='rgba(38,40,58,.5)';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(bx-8,my+7);ctx.quadraticCurveTo(bx,my+4,bx+8,my+7);ctx.stroke()}
  ctx.restore();
}
function drawParts(ox){
  parts.forEach(p=>{const a=1-p.life/p.max,x=p.x+ox;
    if(p.k==='dust'){ctx.fillStyle=Z?`rgba(170,205,240,${a*.6})`:`rgba(230,222,210,${a*.8})`;ell(ctx,x,p.y,p.r*(1+p.life*1.5),p.r*(1+p.life*1.5));ctx.fill()}
    else if(p.k==='steam'){ctx.fillStyle=`rgba(255,255,255,${a*.85})`;ell(ctx,x,p.y,p.r*(1+p.life),p.r*(1+p.life));ctx.fill()}
    else if(p.k==='heart'){ctx.fillStyle=`rgba(255,110,140,${a})`;const r=p.r;ctx.beginPath();ctx.moveTo(x,p.y+r*.9);ctx.bezierCurveTo(x-r*1.4,p.y-r*.2,x-r*.6,p.y-r*1.2,x,p.y-r*.4);ctx.bezierCurveTo(x+r*.6,p.y-r*1.2,x+r*1.4,p.y-r*.2,x,p.y+r*.9);ctx.fill()}
    else if(p.k==='conf'){ctx.save();ctx.translate(x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=a;ctx.fillStyle=p.col;ctx.fillRect(-4,-2,8,4);ctx.restore()}
    else if(p.k==='text'){const k=Math.min(1,p.life*8),sc=k<1?.5+k*.7:1.2-(p.life-.125)*.25;ctx.font=`${p.size}px ${DISPLAY}`;const hw=(ctx.measureText(p.text).width/2+10)*1.25,xc=clamp(x,hw,W-hw); /* keep the whole word on screen (e.g. splatting into a wall) */ctx.save();ctx.translate(xc,p.y);ctx.rotate(p.rot);ctx.scale(sc,sc);ctx.globalAlpha=Math.min(1,a*2);ctx.font=`${p.size}px ${DISPLAY}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle='#2f2236';ctx.strokeText(p.text,0,0);ctx.fillStyle=p.col;ctx.fillText(p.text,0,0);ctx.restore()}
  });ctx.globalAlpha=1;
}
function drawBubble(sx){
  const bb=m.bubble;if(!bb||m.alpha<.5)return;const a=Math.min(1,bb.t*8,(bb.dur-bb.t)*5);ctx.save();ctx.globalAlpha=Math.max(0,a);
  ctx.font='21px '+DISPLAY;const w=ctx.measureText(bb.text).width+26,x=clamp(sx,w/2+10,W-w/2-10),y=m.y-2.45*R*m.scale-44-(m.state==='held'?0:0);
  ctx.fillStyle='#fff';ctx.strokeStyle='#2f2236';ctx.lineWidth=2.5;rr(ctx,x-w/2,y-20,w,38,14);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(sx-6,y+17);ctx.lineTo(sx,y+28);ctx.lineTo(sx+7,y+17);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(sx-6,y+18);ctx.lineTo(sx,y+28);ctx.lineTo(sx+7,y+18);ctx.stroke();
  ctx.fillStyle='#2f2236';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(bb.text,x,y);ctx.restore();
}
function drawFrame(){
  grabReflection(); // last frame's street, for the wet-ground mirror
  ctx.setTransform(K,0,0,K,0,0);
  const sk=Z?'night':skyNow();Z?drawSkyNeon():drawSky(sk);
  const tilt=(tiltSensor!==null?tiltSensor:tiltDeg);
  ctx.save();
  const shx=shakeT>0?rnd(-1,1)*shakeT*24:0,shy=shakeT>0?rnd(-1,1)*shakeT*16:0;
  ctx.translate(640+shx,400+shy);ctx.rotate(tilt*.5*Math.PI/180);ctx.translate(-640,-400);
  Z?drawSkylineNeon():drawSkyline(sk);
  const ox=-camX+640+camKick;
  // where the picked building is, for page overlays that follow it (stage px)
  if(host.onFrame&&B.length){const b=cur(),top=SIDE-b.bh;host.onFrame({x:b.cx+ox,roof:top,cardTop:top+b.L.card.y,cardBottom:top+b.L.card.y+CH,awning:top+b.L.awn.y,door:top+b.L.door.y,ground:SIDE,S,offX:parseFloat(cv.style.left)||0,offY:parseFloat(cv.style.top)||0})}
  const f=faceFrom();
  if(showP&&m.behind){ctx.save();drawMinimi(m.x+ox+(m.sulkKind==='hide'?m.side*m.peek*16:0),f);ctx.restore()}
  Z?drawGroundNeon(ox):drawGround(sk);
  const lampXs=[];const li0=Math.max(-1,Math.floor((camX-900)/SP)),li1=Math.min(B.length-1,Math.ceil((camX+900)/SP));for(let i=li0;i<=li1;i++)lampXs.push(i*SP+SP/2);
  const vis=x=>x+ox>-420&&x+ox<W+420;
  {const bi0=Math.max(0,Math.floor((camX-1100)/SP)),bi1=Math.min(B.length-1,Math.ceil((camX+1100)/SP));for(let i=bi0;i<=bi1;i++){try{drawBuilding(B[i],sk,ox)}catch(err){if(!drawErr){drawErr=true;console.debug('[MinimiTown:draw] building failed',B[i]?.appid,err)}}}}
  lampXs.forEach((x,i)=>{if(vis(x))drawLamp(x+ox,sk,false,i+li0)}); // in front of the shops
  lampTick(frameDt);lampXs.forEach((x,i)=>{lampLevel(i+li0,frameDt);if(vis(x))drawLamp(x+ox,sk,true,i+li0)});
  if(sk==='night'){ctx.fillStyle=Z?'rgba(20,6,40,.12)':'rgba(10,12,40,.18)';ctx.fillRect(-300,-300,W+600,H+600)}
  if(showP&&!m.behind&&m.state!=='inside')drawMinimi(m.x+ox,f);
  if(showP)drawHand(ox);
  drawParts(ox);
  if(Z)drawRain();
  if(showP&&m.state!=='inside')drawBubble(m.x+ox);
  ctx.restore();
  if(holes.length||flashT>0||beamT>0)drawHoles();
  // off-screen marker
  const msx=m.x+ox;if(showP&&m.state!=='inside'&&!rushNow&&(msx<-20||msx>W+20)){const side=msx<0?-1:1,x=side<0?34:W-34,y=FEET-40;ctx.fillStyle='rgba(22,17,30,.8)';ell(ctx,x,y,24,24);ctx.fill();ctx.fillStyle=Z?'#4b5249':'#33405e';ell(ctx,x,y+2,16,15);ctx.fill();ctx.fillStyle='#fff';ell(ctx,x-4,y+1,6,6);ctx.fill();ell(ctx,x+4,y+1,6,6);ctx.fill();ctx.fillStyle='#26283a';ell(ctx,x-4,y,1.8,2.4);ctx.fill();ell(ctx,x+4,y,1.8,2.4);ctx.fill();ctx.fillStyle='#ff9d3a';ell(ctx,x,y+6,3,2);ctx.fill();ctx.fillStyle='#ffb938';ctx.beginPath();ctx.moveTo(x+side*30,y);ctx.lineTo(x+side*22,y-7);ctx.lineTo(x+side*22,y+7);ctx.fill()}
}


/* ---------------- loop ---------------- */
let last=0,raf=0,frozen=false,active=false,trimT=0,frameDt=0;var drawErr=false;
function loop(ts){
  raf=0;if(!cv.isConnected)return; // a detached copy: stop (setActive restarts it)
  let dt=(ts-last)/1000;if(!(dt>0))dt=0.016;dt=Math.min(.05,dt);last=ts;
  frameDt=dt;update(dt);if(B.length)handTick(dt);updRain(dt);updHoles(dt);
  if(!frozen)drawFrame();
  trimT+=dt;if(trimT>2){trimT=0;trimCaches()}
  if(active&&!frozen)raf=view.requestAnimationFrame(loop);
}
function start(){if(!raf&&active&&!frozen){last=now();raf=view.requestAnimationFrame(loop)}}
function stop(){if(raf){view.cancelAnimationFrame(raf);raf=0}}
function freeze(){frozen=true;drawFrame();stop()}
const listeners=[];
function on(type,fn){cv.addEventListener(type,fn);listeners.push([type,fn])}

/* ---------------- pointer: swipe, poke, fling, lift, pet ---------------- */
let P=null,lastTap={t:0,x:0};
function stagePt(e){const r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
function toWorld(p){const tilt=(tiltSensor!==null?tiltSensor:tiltDeg)*.5*Math.PI/180,c=Math.cos(-tilt),s=Math.sin(-tilt),dx=p.x-640,dy=p.y-400;return{x:dx*c-dy*s+640-640+camX-camKick,y:dx*s+dy*c+400}}
function overMinimi(w,pad=0){if(!showP)return false;if(['inside','enter','exit'].includes(m.state)||m.alpha<.5)return false;const cy=m.y-R*1.15*m.scale;return Math.hypot(w.x-m.x,(w.y-cy)*.75)<R*1.5+pad+(m.behind?14:0)}
on('pointerdown',e=>{
  if(mode==='playing'){return}
  cv.setPointerCapture(e.pointerId);const p=stagePt(e),w=toWorld(p),now=view.performance.now();
  P={id:e.pointerId,sx:p.x,sy:p.y,x:p.x,y:p.y,t0:now,hist:[{x:p.x,y:p.y,t:now}],moved:0,rub:0,scrub:0};
  if(overMinimi(w,8)&&!['air','splatW','splatG'].includes(m.state)){P.kind='mm';P.lp=setTimeout(()=>{if(P&&P.kind==='mm'&&P.moved<12&&P.rub<20)grab('lift',toWorld({x:P.x,y:P.y}))},420)}
  else P.kind='street';
});
on('pointermove',e=>{
  const p=stagePt(e),w=toWorld(p),now=view.performance.now();
  if(!P||P.id!==e.pointerId){ // mouse hover rubbing counts as petting
    if(e.pointerType==='mouse'&&e.buttons===0&&mode==='browse'){if(overMinimi(w)){const dd=Math.hypot(e.movementX||0,e.movementY||0)*W/cv.getBoundingClientRect().width;if(dd<30)pet(dd)}}
    return}
  const step=Math.hypot(p.x-P.x,p.y-P.y),dx=p.x-P.x;P.x=p.x;P.y=p.y;P.moved=Math.max(P.moved,Math.hypot(p.x-P.sx,p.y-P.sy));P.hist.push({x:p.x,y:p.y,t:now});while(P.hist.length>8)P.hist.shift();
  if(P.kind==='mm'){
    const h=P.hist,a=h[0],sp=Math.hypot(p.x-a.x,p.y-a.y)/Math.max(1,now-a.t);
    if(P.moved>20&&sp>.55){grab('fling',w)}
    else if(overMinimi(w,6)&&sp<.55){P.rub+=step;if(P.rub>40){pet(step);if(m.state==='sit')m.lookUp=0}}
    else if(P.moved>50){grab('fling',w)}
  }
  if(P.kind==='held'){
    const prevX=m.x;m.x=w.x;m.y=Math.min(FEET,w.y+2*R+14);m.vx=(m.x-prevX)/.016;
  }
  if(P.kind==='street'){
    P.scrub+=dx;const step2=150;while(P.scrub<=-step2){P.scrub+=step2;nav(1)}while(P.scrub>=step2){P.scrub-=step2;nav(-1)}
    
  }
});
function cancelLaunch(){if(mode==='launching'){mode='browse';if(cur())cur().doorTarget=0;if(['goDoor','hesitate','brace','enter'].includes(m.state)){m.braceOpen=false;m.alpha=1;m.scale=1;m.y=FEET;setState('idle')}host.onSelect(sel)}}
function grab(kind,w){
  if(!P)return;cancelLaunch();clearTimeout(P.lp);P.kind='held';m.grab=kind;m.behind=false;setState('held');m.react=null;cv.classList.add('held');
  if(kind==='lift'){say('으앗?',1);sfx('boing');m.x=w.x;m.y=Math.min(FEET,w.y+2*R+14)}else{say('으아앗!',1)}
}
function endPointer(e){
  if(!P||P.id!==e.pointerId)return;clearTimeout(P.lp);const now=view.performance.now(),p=stagePt(e),dt=now-P.t0;
  if(P.kind==='mm'){if(dt<320&&P.moved<14&&P.rub<40)poke()}
  else if(P.kind==='held'){
    cv.classList.remove('held');const h=P.hist.filter(q=>now-q.t<90),a=h[0]||P.hist[0];const span=Math.max(16,now-a.t);
    let vx=(p.x-a.x)/span*1000,vy=(p.y-a.y)/span*1000;const sp=Math.hypot(vx,vy);
    if(sp>1800){vx*=1800/sp;vy*=1800/sp}
    if(sp>380){m.vx=vx*1.15;m.vy=vy*1.15;setState('air');bother(m.grab==='fling'?6:3);sfx('boing')}
    else{m.vx=0;m.vy=60;setState('air');bother(1)}
    m.grab=null;
  }
  else if(P.kind==='street'){
    if(Math.abs(P.scrub)<10&&P.moved<12&&dt<350){
      const w=toWorld(p);
      if(now-lastTap.t<340&&Math.abs(p.x-lastTap.x)<60){launch();lastTap.t=0}
      else{lastTap={t:now,x:p.x};const idx=Math.round(w.x/SP);if(idx>=0&&idx<B.length&&Math.abs(w.x-B[idx].cx)<BW/2&&w.y<SIDE+40&&idx!==sel){nav(idx-sel)}}
    }else{const h=P.hist,a=h[0],v=(p.x-a.x)/Math.max(1,now-a.t);if(Math.abs(v)>.9&&Math.abs(P.scrub)>40)nav(v<0?1:-1)}
  }
  P=null;
}
on('pointerup',endPointer);on('pointercancel',endPointer);


/* ---------------- public API ---------------- */
/** Ⓧ: turn the picked shop's screen round (info) or back (art). */
function flipCard(){const b=B[sel];if(!b||mode!=='browse'||!b.game.info)return;flipPick=!((b.flip||0)>.5);sfx('tick')}
/* ---------------- the left trackpad as a hand ---------------- */
// Rub (no click) to pet; click to grab, keep the thumb on the pad to carry, flick and lift it to throw.
const pad={touch:false,click:false,x:0,y:0,px:0,py:0},hand={pending:null,poke:-9,pokeSide:1,a:0,x:0,y:0,grip:false,ax:0,ay:0,bx:0,by:0,hist:[],wig:0,pat:0,patting:false,patAt:0,px:null,py:null};
const HAND_OFF=['enter','inside','exit','air','splatW','splatG','shoot','brace','roll'];
function padInput(st){
  if(!showP){pad.touch=pad.click=false;return}
  const wasClick=pad.click;pad.touch=!!st.touch;pad.click=!!st.click;if(pad.touch){pad.x=st.x;pad.y=st.y}
  // a click: short = a poke (like tapping the screen), held or dragged = pick the penguin up
  if(pad.click&&!wasClick&&!hand.grip&&pad.touch&&(mode==='browse'||mode==='launching')&&!HAND_OFF.includes(m.state)&&!P)hand.pending={t:T,x:pad.x,y:pad.y};
  if(hand.pending&&pad.click&&(T-hand.pending.t>.2||Math.hypot(pad.x-hand.pending.x,pad.y-hand.pending.y)>.08))padGrab();
  if(hand.pending&&!pad.click){hand.pending=null;hand.poke=T;poke()}
  // let go of the click mid-flick: throw right away (a still thumb keeps holding)
  if(wasClick&&!pad.click&&hand.grip&&padSpeed()>520)padRelease();
  if(!pad.touch&&hand.grip)padRelease();
}
/** How fast the carried penguin was moving at the end of the gesture (world px/s), ignoring the
 *  still moment after the thumb stops (the pad only reports a lift after a short silence). */
function padVel(){
  const h=hand.hist;if(h.length<2)return{vx:0,vy:0,sp:0};
  let k=h.length-1;while(k>0&&Math.hypot(h[k].x-h[k-1].x,h[k].y-h[k-1].y)<.5)k--; // last sample that moved
  const end=h[k],stale=T-end.t>.3;if(stale||k===0)return{vx:0,vy:0,sp:0};
  let j=k;while(j>0&&end.t-h[j-1].t<=.1)j--;const a=h[j],span=Math.max(.016,end.t-a.t);
  const vx=(end.x-a.x)/span,vy=(end.y-a.y)/span;return{vx,vy,sp:Math.hypot(vx,vy)};
}
const padSpeed=()=>padVel().sp;
function padGrab(){
  hand.pending=null;if(HAND_OFF.includes(m.state)||!(mode==='browse'||mode==='launching'))return;
  cancelLaunch();m.behind=false;m.react=null;setState('held');m.grab='lift';hand.grip=true;
  hand.bx=m.x;hand.by=Math.min(FEET,m.y)-34;hand.ax=pad.x;hand.ay=pad.y;hand.hist=[];say('으앗?',1);sfx('boing');buzz(25);
}
function padRelease(){
  hand.grip=false;if(m.state!=='held'||m.grab!=='lift')return;
  let {vx,vy,sp}=padVel();if(sp>1800){vx*=1800/sp;vy*=1800/sp}
  if(sp>380){m.vx=vx*1.15;m.vy=vy*1.15;setState('air');bother(3);sfx('boing')}else{m.vx=0;m.vy=60;setState('air');bother(1)}
  m.grab=null;
}
function handTick(dt){
  if(hand.pending&&pad.click&&T-hand.pending.t>.2)padGrab();
  const on=pad.touch&&(mode==='browse'||mode==='launching'||hand.grip)&&(hand.grip||!HAND_OFF.includes(m.state));
  hand.a+=((on?1:0)-hand.a)*(1-Math.exp(-dt*(on?14:8)));
  if(hand.grip&&m.state==='held'&&m.grab==='lift'){
    const prev=m.x;m.x=clamp(hand.bx+(pad.x-hand.ax)*520,viewL(),viewR());m.y=clamp(hand.by-(pad.y-hand.ay)*380,140,FEET);m.vx=(m.x-prev)/Math.max(dt,.001);
    hand.hist.push({t:T,x:m.x,y:m.y});while(hand.hist.length>40)hand.hist.shift();
    hand.x=m.x;hand.y=m.y-2.2*R*m.scale;return}
  if(hand.grip&&m.state!=='held')hand.grip=false;
  if(!on){hand.px=hand.py=null;hand.patting=false;return}
  const px=m.x+pad.x*120,py=m.y-R*1.3-pad.y*90;
  // the thumb's own movement (not the hand's easing) is what rubs
  const mv=Math.hypot(px-(hand.px??px),py-(hand.py??py));hand.px=px;hand.py=py;
  const near=overMinimi({x:px,y:py},16);
  hand.patting=near&&(mv>.6||(hand.patting&&T-(hand.patAt||0)<.35));if(near&&mv>.6)hand.patAt=T;
  hand.pat+=mv*.09;
  const poking=T-(hand.poke||-9)<.32,head=m.y-1.9*R*m.scale;
  if(poking){const side=px>=m.x?1:-1,jab=Math.sin(clamp((T-hand.poke)/.32,0,1)*Math.PI);hand.pokeSide=side;hand.x=m.x+side*(R+22-jab*12);hand.y=m.y-R*1.25;hand.patting=false;return}
  const tx=hand.patting?clamp(px,m.x-R*.7,m.x+R*.7):px,ty=hand.patting?head-Math.abs(Math.sin(hand.pat))*9:py;
  if(hand.a<.05){hand.x=tx;hand.y=ty}
  hand.x+=(tx-hand.x)*(1-Math.exp(-dt*22));hand.y+=(ty-hand.y)*(1-Math.exp(-dt*(hand.patting?40:22)));
  if(near&&mv>.6){pet(mv*1.4);if(m.state==='sit')m.lookUp=0}
}
/** A cartoon glove in three poses: an open hand hovering, a flat hand patting the head (토닥토닥),
 *  and thumb + index pinching the top of the head to carry the penguin. */
function drawHand(ox){
  if(hand.a<.02)return;const x=hand.x+ox,y=hand.y;
  const fill=Z?'#eaf7ff':'#ffffff',line=Z?'#3ff0ff':'#3a3036',shade2=Z?'rgba(63,240,255,.18)':'rgba(58,48,54,.12)';
  ctx.save();ctx.globalAlpha=hand.a;ctx.translate(x,y);ctx.lineWidth=2.2;ctx.strokeStyle=line;ctx.fillStyle=fill;ctx.lineJoin='round';ctx.lineCap='round';
  const glow=()=>{if(Z){ctx.shadowColor='#3ff0ff';ctx.shadowBlur=8}},noGlow=()=>{ctx.shadowBlur=0};
  const finger=(fx,fy,w,h,r=0)=>{ctx.save();ctx.translate(fx,fy);ctx.rotate(r);rr(ctx,-w/2,0,w,h,w/2);ctx.fill();ctx.stroke();ctx.restore()};
  // a finger as a soft tube: dark outline, then the glove over it
  const tube=(pts,w)=>{const path=()=>{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);if(pts.length===3)ctx.quadraticCurveTo(pts[1][0],pts[1][1],pts[2][0],pts[2][1]);else pts.slice(1).forEach(q=>ctx.lineTo(q[0],q[1]))};
    ctx.save();ctx.lineCap='round';ctx.strokeStyle=line;ctx.lineWidth=w+4.4;path();ctx.stroke();ctx.strokeStyle=fill;ctx.lineWidth=w;path();ctx.stroke();ctx.restore()};
  if(T-(hand.poke||-9)<.32){
    // the poke: index finger out toward the penguin, the rest curled
    ctx.scale(-hand.pokeSide,1);glow();
    rr(ctx,-2,-12,22,20,8);ctx.fill();ctx.stroke();noGlow(); // fist
    tube([[2,-6],[-16,-6]],7.5); // index finger
    ctx.fillStyle=shade2;[-4,2,8].forEach(k=>{ell(ctx,4,k,3,2.4);ctx.fill()}); // curled fingers
    ctx.fillStyle=fill;rr(ctx,18,-10,12,16,4);ctx.fill();ctx.stroke(); // cuff
    ctx.strokeStyle=hexA(Z?'#ff3fa4':'#ffb938',.9);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,-14);ctx.lineTo(-29,-18);ctx.moveTo(-25,-6);ctx.lineTo(-31,-6);ctx.moveTo(-24,2);ctx.lineTo(-29,6);ctx.stroke();
  }else if(hand.grip){
    // pinch: the hand above, thumb and index closing on the top of the head, the other fingers curled
    glow();ctx.fillStyle=fill;rr(ctx,-4,-46,30,22,10);ctx.fill();ctx.stroke();noGlow(); // back of the hand
    tube([[22,-30],[30,-22],[24,-16]],7);tube([[15,-27],[21,-17],[15,-14]],7); // curled fingers
    tube([[4,-30],[10,-14],[1,-3]],7.5); // index, down to the pinch
    tube([[-2,-36],[-14,-20],[-3,-3]],7.5); // thumb
    ctx.fillStyle=fill;rr(ctx,8,-60,20,15,5);ctx.fill();ctx.stroke(); // cuff, the arm goes up and away
    ctx.strokeStyle=hexA(Z?'#3ff0ff':'#3a3036',.55);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-12,-2);ctx.lineTo(-18,-6);ctx.moveTo(10,-2);ctx.lineTo(16,-6);ctx.stroke(); // grip marks
  }else if(hand.patting){
    // palm down on the head, fingers draped over the front: 토닥토닥
    const tilt=-.06+Math.sin(hand.pat)*.07;ctx.rotate(tilt);glow();
    ell(ctx,4,-10,21,11);ctx.fill();ctx.stroke();noGlow(); // back of the hand
    [[-10,-2],[-2,0],[6,0],[14,-2]].forEach(([fx,fy],k)=>tube([[fx,fy-8],[fx+(k-1.5)*.6,fy+4]],7)); // four fingertips over the head
    tube([[-14,-14],[-22,-8],[-21,0]],7); // thumb on the near side
    ctx.fillStyle=fill;rr(ctx,18,-28,18,14,5);ctx.fill();ctx.stroke(); // cuff, arm comes from the upper right
    const down=1-Math.abs(Math.sin(hand.pat));if(down>.7){ctx.strokeStyle=hexA(Z?'#ff3fa4':'#ffb938',.9);ctx.lineWidth=2;ctx.beginPath();[[-24,8,-31,14],[2,13,2,21],[26,8,33,14]].forEach(([a1,b1,a2,b2])=>{ctx.moveTo(a1,b1);ctx.lineTo(a2,b2)});ctx.stroke()}
  }else{
    // open hand hovering, fingers relaxed and a little spread
    ctx.rotate(Math.sin(T*2.2)*.06);glow();
    [[-11,-.28,12],[-4,-.09,15],[3.5,.08,15],[10.5,.26,12]].forEach(([fx,r,h])=>finger(fx,-14,6.8,-h,r));
    ell(ctx,0,-4,14,12);ctx.fill();ctx.stroke();noGlow();
    ctx.save();ctx.translate(-14,-2);ctx.rotate(.9);rr(ctx,-3.5,-12,7,13,3.5);ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle=fill;rr(ctx,-10,7,20,10,4);ctx.fill();ctx.stroke(); // cuff (wrist below: the hand reaches in from the player's side)
  }
  ctx.restore();
}
/** Show or hide the penguin (Quick Access). Hidden, the street is just the street. */
function setPenguin(on){showP=!!on;if(!showP){hand.grip=false;hand.pending=null;m.bubble=null;m.react=null;if(!['enter','inside','exit','goDoor'].includes(m.state)){m.y=FEET;m.rot=0;m.vx=m.vy=0;setState('idle')}}}
function setGames(list,selAppid){
  const prevSel=B[sel]?.appid;
  B=list.map((g,i)=>makeBuilding(g,i));
  let idx=B.findIndex(b=>b.appid===(selAppid??prevSel));if(idx<0)idx=0;sel=idx;
  if(B.length){camX=B[sel].cx;if(m.x<B[0].cx-640||m.x>B[B.length-1].cx+640||!isFinite(m.x))m.x=standX(B[sel])}
  drawFrame();host.onSelect(sel);
}
/** Refresh states (installs, downloads, playtime) without rebuilding the street. */
function patchGames(list){
  const byId=new Map(list.map(g=>[g.appid,g]));
  for(const b of B){const g=byId.get(b.appid);if(!g)continue;
    if(b.st==='downloading'&&g.status!=='downloading'&&g.status!=='closed'){b.cele=1.6;for(let i=0;i<24;i++)parts.push({k:'conf',x:b.cx+rnd(-120,120),y:SIDE-b.bh+rnd(40,120),vx:rnd(-80,80),vy:rnd(-220,-60),life:0,max:1.6,col:['#ff7f8e','#ffb938','#86c9ff','#62d6b2'][i%4],rot:rnd(0,6)})}
    b.st=g.status;b.p=g.progress||0;b.hours=g.hours||0;b.game=g;b.g.g=g.sign}
}
function setTheme(t,talk){
  theme=t==='neon'?'neon':'town';Z=theme==='neon';
  B.forEach(b=>{b.fac=null});
  if(talk&&mode==='browse')say(Z?'출동.':'햇살 좋다!',1.4);
  drawFrame();
}
function setSky(s){skyMode=s||'auto';drawFrame()}
function setLampDim(v){LAMP_DIM=clamp(Number(v)||0,0,1);drawFrame()}
function setCardStyle(st){st=st==='capsule'?'capsule':'wide';if(st===cardStyle)return;cardStyle=st;CW=CARD[st][0];CH=CARD[st][1];setGames(B.map(b=>b.game),B[sel]?.appid)}
function setActive(on){active=!!on;if(active){start()}else stop()}
function destroy(){active=false;stop();clearTimeout(moodSaveT);try{host.saveMood(Math.round(mood))}catch(e){};listeners.forEach(([t,f])=>cv.removeEventListener(t,f));B=[]}
setTimeout(()=>{if(mode==='browse')say('안녕!',1.6)},600);
return {fit,flipCard,padInput,setPenguin,emerge,poke,setLampDim,setGames,patchGames,setTheme,setSky,setCardStyle,setActive,destroy,nav,select,launch,goBack,cancelLaunch,shake,
  get selected(){return sel},get mode(){return mode},get mood(){return mood},set mood(v){mood=clamp(v,0,100);saveMood()},
  get debug(){return {m,B,camX,camKick,lampLv,lampRate}}};
}
