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
}
export interface TownHost {
  lang: "ko" | "en";
  tiers: string[];
  theme: "town" | "neon";
  sky: "auto" | "day" | "dusk" | "night";
  cardStyle: "wide" | "capsule";
  mood: number;
  sound(kind: string): void;      // tick, door, boing, splat, poke, pet, angry, yawn
  haptic(strength: number): void;
  saveMood(mood: number): void;
  onSelect(i: number): void;      // selection changed
  onInstall(i: number): void;     // Ⓐ on a game that isn't installed
  onEntered(i: number): void;     // the penguin went through the door
  onFrame?(box: any): void;       // every frame: the picked building's position (stage px)
}

export function createTown(cv: HTMLCanvasElement, host: TownHost) {
'use strict';
const W=1280,H=800,SIDE=588,FEET=626,SP=360,R=30;
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
const EN={'퍽!':'Splat!','콩!':'Bonk!','철퍼덕!':'Oof!','건드리지 마!':"Don't touch me!",'왜…':'What…','그만해라':'Stop it','내려줘!!':'Put me down!!','잠깐만…':'Hang on…','으아악!':'Aaargh!','화났어!!':"I'm mad!!",'진짜!!':'Seriously!!','비다! 우비 입어야지':'Rain! Raincoat time','햇살 좋다!':'What a sunny day!','흥.':'Hmph.','흥. 안 가.':'Hmph. Not going.','헉… 헉…':'Huff… huff…','헉… 헉… 가자!':"Huff… let's go!",'하아아암~':'Yaaawn~','콜록… 들어가도 돼?':'Ahem… can I come in?','으앗?':'Whoa?','으아앗!':'Waaah!','으아아아':'Whoaaa','으… 기다려!':'Ugh… wait up!','어질어질…':'So dizzy…','안녕!':'Hi!','설치부터 할게!':"Let's install it!",'버텨…!':'Hold on…!','놓쳤다아':'Lost my grip','…헤헤':'…hehe','잠깐만~!':'Wait for me~!','같이 가아~!':'Coming~!'};
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
function loadArt(b){
  const list=(cardStyle==='capsule'?b.game.capsule:b.game.art)||[];
  if(b.img||b.imgLoading||b.imgTried>=list.length)return;
  const url=list[b.imgTried++];
  const im=new view.Image();b.imgLoading=true;
  im.onload=()=>{b.imgLoading=false;if(im.naturalWidth>8){b.img=im;b.card=null}else loadArt(b)};
  im.onerror=()=>{b.imgLoading=false;loadArt(b)};
  im.src=url;
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
  const h=hash(game.appid>>>0||i+1),look=LOOKS[h%LOOKS.length],bh=Math.max(HEIGHTS[(h>>>5)%HEIGHTS.length],CH+158+(cardStyle==='capsule'?52:40));
  const g={t:game.name,g:game.sign,c:look[0],tr:look[1],roof:(h>>>9)%3,bh};
  const b={i,g,game,appid:game.appid,bh,cx:i*SP,st:game.status,p:game.progress||0,door:0,doorTarget:0,light:0,playing:false,hours:game.hours||0,cele:0,neon:NEON[h%NEON.length],img:null,imgTried:0,card:null,fac:null};
  const cardY=bh-158-CH;
  b.L={card:{x:(BW-CW)/2,y:cardY},door:{x:BW/2-38,y:bh-114,w:76,h:114},awn:{x:18,y:bh-142,w:BW-36,h:22},
    wins:[{x:26,y:bh-102,w:64,h:58},{x:BW-90,y:bh-102,w:64,h:58}],up:[]};
  if(cardY>=104){const n=3;for(let k=0;k<n;k++)b.L.up.push({x:44+k*((BW-88-46)/(n-1)),y:34,w:46,h:Math.min(52,cardY-62)})}
  return b;
}
/** Keep bitmaps only near the camera. */
function trimCaches(){
  const keep=6;
  for(const b of B){const far=Math.abs(b.i-sel)>keep&&Math.abs(b.cx-camX)>keep*SP;if(far){b.fac=null;b.card=null;if(Math.abs(b.i-sel)>keep*3){b.img=null;b.imgTried=0}}}
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
function say(text,dur=1.6){m.bubble={text:tx(text),t:0,dur}}
function pop(text,x,y,size=44,col='#fff'){parts.push({k:'text',text:tx(text),x,y,vx:0,vy:-40,life:0,max:.9,size,col,rot:rnd(-.2,.2)})}
function dust(x,y,n=6,s=1){for(let i=0;i<n;i++)parts.push({k:'dust',x:x+rnd(-10,10),y:y-rnd(0,6),vx:rnd(-60,60)*s,vy:rnd(-60,-10)*s,life:0,max:rnd(.4,.8),r:rnd(5,10)*s})}
function hearts(x,y){parts.push({k:'heart',x:x+rnd(-14,14),y,vx:rnd(-20,20),vy:-70,life:0,max:1.1,r:rnd(7,10)})}
function steam(x,y){parts.push({k:'steam',x:x+rnd(-18,18),y,vx:rnd(-15,15),vy:-90,life:0,max:.7,r:rnd(5,8)})}
function bother(amt){mood=clamp(mood-amt,0,100);lastBother=T;saveMood()}
function saveMood(){clearTimeout(moodSaveT);moodSaveT=setTimeout(()=>{try{host.saveMood(Math.round(mood))}catch(e){}},1500)}
function setState(s){m.state=s;m.t=0}
function standX(b){return b.cx+72*m.side}
const GROUNDED=['idle','move','sit','sulk','cheer','goDoor','hesitate','react'];
const BUSY=['held','air','splatW','splatG','recover','trip','getup','dizzy','collapse','roll','cling','enter','inside','exit','yawn'];
function navRate(){const now=T;navTimes=navTimes.filter(t=>now-t<1.3);return navTimes.length}
function viewL(){return camX-640+34}function viewR(){return camX+640-34}

/* ---------------- navigation / launch ---------------- */
let camKick=0;
function nav(d){
  if(mode!=='browse'||!B.length)return;const n=clamp(sel+d,0,B.length-1);if(n===sel){camKick=d*26;return}
  sel=n;navTimes.push(T);sfx('tick');
  m.side=(B[sel].cx>m.x)?-1:1;
  if(['idle','sit','react','cheer'].includes(m.state))setState('move');
  if(m.state==='goDoor'||m.state==='hesitate')setState('move');
  host.onSelect(sel);
}
function select(i){if(!B.length)return;i=clamp(i|0,0,B.length-1);if(i!==sel)nav(i-sel)}
function launch(){
  if(mode!=='browse'||!B.length)return;const b=cur();
  if(b.st==='closed'){say('설치부터 할게!');sfx('tick');host.onInstall(sel);return}
  if(b.st==='downloading'){say(host.lang==='en'?`Only ${Math.floor(b.p)}% so far…`:`아직 ${Math.floor(b.p)}%야…`);if(m.state==='idle')setState('sit');return}
  if(BUSY.includes(m.state)){say(m.state==='held'?'내려줘!!':'잠깐만…',1);return}
  if(m.state==='sulk'&&mood<40){say('흥. 안 가.',1.4);return}
  mode='launching';m.behind=false;m.hes=false;m.rush=false;setState('goDoor');
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
  const f={eyes:'open',mouth:'smile',brow:null,blush:.5,red:0,sweat:0,steam:0,zzz:0,stars:0,tongue:0,lookY:0};
  const s=m.state,t=m.t;
  if(m.react){const r=m.react;if(r.type==='flinch'){f.eyes='squint';f.mouth='o';f.brow='worry'}else if(r.type==='annoy'){f.eyes='half';f.mouth='pout';f.brow='flat';f.blush=.9}else{f.eyes='angry';f.mouth='grit';f.brow='angry';f.red=.7;f.steam=1}}
  else if(m.petT>0){f.eyes='happy';f.mouth='open';f.blush=1}
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
  if(f.eyes==='open'&&m.blink>0&&!((m.pfE||0)>.03&&(m.pfE||0)<.97))f.eyes='blink'; // no random blink mid-turn
  return f;
}

function update(dt){
  if(!B.length){T+=dt;return}
  T+=dt;
  // camera
  const tx=cur().cx;if(!isFinite(camX))camX=tx;if(!isFinite(m.x)||!isFinite(m.y)){m.x=standX(cur());m.y=FEET;m.vx=0;m.vy=0}
  camX+= (tx-camX)*(1-Math.exp(-dt*6.5));camKick*=Math.exp(-dt*10);
  if(shakeT>0)shakeT-=dt;
  const tilt=(tiltSensor!==null?tiltSensor:tiltDeg)*Math.PI/180;
  // doors ease open/closed; lights come on when you pick the building
  {const ci=Math.round(camX/SP),bi0=Math.max(0,ci-5),bi1=Math.min(B.length-1,ci+5);for(let i=bi0;i<=bi1;i++){const b=B[i];
   b.door+=(b.doorTarget-b.door)*(1-Math.exp(-dt*14));const lt=(b.i===sel||b.playing)?1:0;b.light+=(lt-b.light)*(1-Math.exp(-dt*(lt?5:3)));if(b.cele>0)b.cele-=dt}}
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
    if(ad>900){m.x=target-Math.sign(dist)*900}
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
      if(mode2==='sprint'){m.sprintT+=dt;m.stamina-=dt*.45;if(Math.random()<dt*9)dust(m.x-m.dir*16,FEET,1,.7)}else m.sprintT=Math.max(0,m.sprintT-dt*.5);
      const onScreen=m.x>viewL()-10&&m.x<viewR()+10;
      if(mode2==='sprint'&&s!=='goDoor'&&m.tripCD<0&&onScreen&&((m.sprintT>1.25&&Math.random()<dt*1.8)||(m.stamina<.25&&ad>260))){setState('trip');m.tripCD=3.5;m.sprintT=0;m.stamina=.7;pop('철퍼덕!',m.x+m.dir*30,FEET-70,40);dust(m.x+m.dir*20,FEET,10,1.1);sfx('splat');buzz(25);return}
          }else{
      if(s==='move'||s==='goDoor'){m.x=target;m.vx=0}else{m.vx*=Math.exp(-dt*14);if(Math.abs(m.vx)<8)m.vx=0}
      if(s==='move'){
        if(m.sprintT>.35){m.pantT=1.8;say('헉… 헉…',1.6)}m.sprintT=0;
        m.dir=m.side<0?1:-1;setState('idle');
        if(mood<22){startSulk()}
      }
      if(s==='goDoor'){m.dir=1;if(m.rush){m.rush=false;m.pantT=1.4;say('헉… 헉… 가자!',1.2)}if(b.st==='dusty'&&!m.hes){setState('hesitate');say('콜록… 들어가도 돼?',1.6)}else{setState('enter');b.doorTarget=1;sfx('door')}}
      if(s==='idle'&&m.t>3.5&&mode==='browse')setState('sit');
    }
    m.x+=m.vx*dt;m.phase+=Math.abs(m.vx)*dt*.055;
  }
  else if(s==='sit'){m.vx=0;m.lookUp=clamp((m.t-1.1)*2,0,1);if(Math.abs(standX(b)-m.x)>4)setState('move');if(m.t>12&&m.sleepyT<=0&&Math.random()<dt*.15)m.sleepyT=3}
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
  else if(s==='trip'){m.vx*=Math.exp(-dt*5);m.x+=m.vx*dt;if(m.t>.95)setState('getup')}
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
  // sulk check / unsulk
  if(m.state==='sulk'&&mood>=55){m.behind=false;m.y=FEET;setState('cheer');say('…헤헤',1.4);for(let i=0;i<5;i++)hearts(m.x,m.y-70)}
  if(m.pantT>0&&Math.random()<dt*3&&m.state==='idle')dust(m.x,FEET,1,.3);
  m.x=clamp(m.x,B[0].cx-640+34,B[B.length-1].cx+640-34);
  // particles
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life+=dt;if(p.life>p.max){parts.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.k==='dust'){p.vx*=.92;p.vy*=.92}if(p.k==='conf'){p.vy+=500*dt;p.rot+=dt*8}}
}
function afterBother(){if(mood<22)startSulk();else setState('idle')}
function startSulk(){m.sulkKind=Math.random()<.5?'hide':'back';m.sulkIdx=sel;setState('sulk');say('흥.',1.4);
  if(m.sulkKind==='hide'){const b=cur();m.side=(m.x>b.cx)?1:-1}}
function splatWall(side){setState('splatW');m.vx=0;m.vy=0;m.side2=side;m.rot=0;pop('퍽!',m.x+side*10,m.y-40,56);dust(m.x+side*20,m.y-30,8,1);bother(8);sfx('splat');buzz(40);shakeT=.25}
function splatGround(){setState('splatG');m.vx=0;m.vy=0;m.rot=0;pop('퍽!',m.x,FEET-60,56);dust(m.x,FEET,12,1.3);bother(9);sfx('splat');buzz(50);shakeT=.3}
function poke(){
  const recent=(m.pokes=(m.pokes||[]).filter(t=>T-t<2.4));recent.push(T);const n=recent.length;
  if(['held','air','splatW','splatG','enter','inside','exit'].includes(m.state))return;
  if(m.state==='sulk'){say(n>2?'건드리지 마!':'…',1);bother(2);m.react={type:'annoy',t:0,dur:.8};sfx('poke');return}
  if(n<=2){m.react={type:'flinch',t:0,dur:.45};bother(3);sfx('poke');m.sx=.8;m.sy=1.2;if(m.state==='sit')m.sitJolt=.3}
  else if(n<=5){m.react={type:'annoy',t:0,dur:1.3};bother(4);say(n===3?'왜…':'그만해라',1);sfx('poke')}
  else{m.react={type:'angry',t:0,dur:2.2};bother(6);say(['으아악!','화났어!!','진짜!!'][n%3],1.2);sfx('angry');buzz(30);m.stomp=1.5}
  if(m.state==='sit'&&n>2)setState('idle');
  if(mood<22&&n>2)setTimeout(()=>{if(GROUNDED.includes(m.state)&&m.state!=='sulk')startSulk()},900);
}
function pet(amount){
  if(['air','splatW','splatG','enter','inside','exit','roll'].includes(m.state))return;
  mood=clamp(mood+amount*.025,0,100);lastBother=T-6;saveMood();
  m.petT=.6;if(Math.random()<amount*.02){hearts(m.x,m.y-2*R-10);sfx('pet')}
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
  // wet-street reflections of each storefront's neon
  ctx.save();ctx.globalCompositeOperation='lighter';
  B.forEach(b=>{const x=b.cx+ox;if(x<-300||x>W+300)return;const a=(b.i===sel?.34:.22)*flick(b.i);
    for(let k=0;k<10;k++){const y=SIDE+4+k*21,w=BW*(.96-k*.07),wob=Math.sin(T*2.2+k*1.3+b.i)*6;ctx.fillStyle=hexA(b.neon,a*(1-k/10));ctx.fillRect(x-w/2+wob,y,w,11)}});
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
function drawLamp(x,sk,front,i=0){
  if(Z){const lc=i%2?'#ff3fa4':'#3ff0ff';
    if(!front){ctx.fillStyle='#0c0b12';ctx.fillRect(x-3,SIDE-236,6,236+40);ctx.fillRect(x-9,SIDE+30,18,10);
      ctx.beginPath();ctx.moveTo(x,SIDE-236);ctx.quadraticCurveTo(x,SIDE-256,x+22,SIDE-252);ctx.lineWidth=5;ctx.strokeStyle='#0c0b12';ctx.stroke();
      ctx.fillStyle='#0c0b12';rr(ctx,x+12,SIDE-256,24,12,4);ctx.fill();ctx.fillStyle=lc;ctx.fillRect(x+15,SIDE-246,18,4)}
    else{ctx.save();ctx.globalCompositeOperation='lighter';
      let g=ctx.createRadialGradient(x+24,SIDE-242,2,x+24,SIDE-242,80);g.addColorStop(0,hexA(lc,.55));g.addColorStop(1,hexA(lc,0));ctx.fillStyle=g;ctx.fillRect(x-60,SIDE-322,170,160);
      g=ctx.createRadialGradient(x+24,SIDE+34,4,x+24,SIDE+34,130);g.addColorStop(0,hexA(lc,.28));g.addColorStop(1,hexA(lc,0));ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x+24,SIDE+34,140,36,0,0,Math.PI*2);ctx.fill();ctx.restore()}
    return}
  const night=sk!=='day';
  if(!front){ctx.fillStyle='#2f2a36';ctx.fillRect(x-3,SIDE-236,6,236+40);ctx.fillRect(x-9,SIDE+30,18,10);
    ctx.beginPath();ctx.moveTo(x,SIDE-236);ctx.quadraticCurveTo(x,SIDE-256,x+22,SIDE-252);ctx.lineWidth=5;ctx.strokeStyle='#2f2a36';ctx.stroke();
    ctx.fillStyle='#2f2a36';rr(ctx,x+12,SIDE-256,24,12,4);ctx.fill();ctx.fillStyle=night?'#fff1b8':'#e8e2d0';ctx.fillRect(x+16,SIDE-245,16,5)}
  else if(night){ctx.save();ctx.globalCompositeOperation='lighter';
    let g=ctx.createRadialGradient(x+24,SIDE-242,2,x+24,SIDE-242,70);g.addColorStop(0,'rgba(255,220,140,.55)');g.addColorStop(1,'rgba(255,220,140,0)');ctx.fillStyle=g;ctx.fillRect(x-50,SIDE-312,150,140);
    g=ctx.createRadialGradient(x+24,SIDE+34,4,x+24,SIDE+34,120);g.addColorStop(0,`rgba(255,214,140,${sk==='night'?.32:.16})`);g.addColorStop(1,'rgba(255,214,140,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x+24,SIDE+34,130,34,0,0,Math.PI*2);ctx.fill();ctx.restore()}
}
function drawBuilding(b,sk,ox){
  if(!b.fac)renderFacade(b);if(!b.img)loadArt(b);if(!b.card)renderCard(b);
  const left=b.cx-BW/2+ox,top=SIDE-b.bh,L=b.L,night=sk==='night',dusk=sk==='dusk',isSel=b.i===sel;
  premiumBeams(b,left,top,sk);
  ctx.drawImage(b.fac,left-b.facPad,top-b.facTop,BW+b.facPad*2,b.bh+b.facTop);
  if(Z){const nc=b.neon,fl=flick(b.i),a=L.awn;ctx.save();ctx.strokeStyle=nc;ctx.fillStyle=nc;ctx.globalAlpha=.5+.5*fl;ctx.shadowColor=nc;ctx.shadowBlur=14;ctx.lineWidth=3;
    // wavy tube under the cornice
    ctx.lineCap='round';ctx.beginPath();for(let k=0;k<=40;k++){const u=k/40;ctx.lineTo(left+22+u*(BW-44),top+26+Math.sin(u*Math.PI*4+b.i)*4)}ctx.stroke();
    ctx.lineWidth=2;rr(ctx,left+a.x+6,top+a.y-1,a.w-12,a.h+2,11);ctx.stroke();
    // vertical blade sign hanging off the right edge
    const sx=left+BW+3,sy=SIDE-236,sh=86,sw=24;ctx.save();ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle='#0c0b12';ctx.fillRect(left+BW-4,sy+10,8,4);ctx.fillRect(left+BW-4,sy+sh-14,8,4);rr(ctx,sx,sy,sw,sh,8);ctx.fill();ctx.restore();
    rr(ctx,sx+2,sy+2,sw-4,sh-4,7);ctx.stroke();
    const chars=[...b.g.t.replace(/[^가-힣A-Za-z0-9]/g,'')].slice(0,2);ctx.font='18px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';
    chars.forEach((ch,k)=>ctx.fillText(ch,sx+sw/2,sy+26+k*34));
    ctx.font='17px '+DISPLAY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.g.g,left+BW/2,top+a.y+a.h/2+1);ctx.restore();
    if(b.g.roof===1){ctx.fillStyle=`rgba(255,50,70,${Math.sin(T*4+b.i)>0?1:.25})`;ell(ctx,left+BW/2+42,top-34,3,3);ctx.fill()}}
  // windows
  const dusty=b.st==='dusty',closed=b.st==='closed';
  // a short flicker while the lights come on, like a switch being flipped
  const lit=b.light*(b.i===sel&&b.light>.05&&b.light<.8&&Math.sin(T*53+b.i*3)<-.2?.35:1);const wins=L.wins.concat(L.up);
  wins.forEach((w,j)=>{const x=left+w.x,y=top+w.y;
    ctx.fillStyle=night?'#1d2235':dusk?'#3b3a55':'#33405a';ctx.fillRect(x,y,w.w,w.h);
    if(!night){ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.moveTo(x,y+w.h*.7);ctx.lineTo(x+w.w*.6,y);ctx.lineTo(x+w.w*.85,y);ctx.lineTo(x,y+w.h);ctx.fill()}
    if(lit>.02){let col=Z?(b.playing?(j%2?'rgba(63,240,255,':'rgba(255,63,164,'):'rgba(150,230,255,'):b.playing?(j%2?'rgba(140,200,255,':'rgba(255,214,140,'):'rgba(255,214,130,';ctx.fillStyle=col+(lit*(night?.95:.6))+')';ctx.fillRect(x,y,w.w,w.h);
      if(night){ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=col+(lit*.18)+')';ctx.fillRect(x-10,y-10,w.w+20,w.h+20);ctx.restore()}}
    if(closed){ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=2;for(let k=6;k<w.h;k+=7){ctx.beginPath();ctx.moveTo(x,y+k);ctx.lineTo(x+w.w,y+k);ctx.stroke()}}
    ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+w.w/2,y);ctx.lineTo(x+w.w/2,y+w.h);ctx.stroke()});
  // door
  const d=L.door,dx=left+d.x,dy=top+d.y;
  ctx.fillStyle=lit>.5||b.door>.05?'#3a2a20':'#1f1a22';ctx.fillRect(dx,dy,d.w,d.h);
  if(b.door>.05){let g=ctx.createLinearGradient(0,dy,0,dy+d.h);g.addColorStop(0,Z?'rgba(120,245,255,.9)':'rgba(255,214,140,.9)');g.addColorStop(1,Z?hexA(b.neon,.55):'rgba(255,180,100,.5)');ctx.fillStyle=g;ctx.globalAlpha=b.door;ctx.fillRect(dx+3,dy+3,d.w-6,d.h-3);ctx.globalAlpha=1}
  const pw=d.w*(1-b.door*.82);ctx.fillStyle=Z?'#26232f':shade(b.g.tr,.15);ctx.fillRect(dx,dy,pw,d.h);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(dx+pw-3,dy,3,d.h);
  if(pw>20){ctx.fillStyle=night?'#2a3045':'#465673';ctx.fillRect(dx+pw*.2,dy+12,pw*.6,d.h*.4);if(lit>.05){ctx.fillStyle=`rgba(255,214,130,${lit*.8})`;ctx.fillRect(dx+pw*.2,dy+12,pw*.6,d.h*.4)}ctx.fillStyle='#e8c46a';ell(ctx,dx+pw-10,dy+d.h*.58,3.5,3.5);ctx.fill()}
  premiumBack(b,left,top,sk);
  // card (the readable part)
  const cs=isSel?1.05:1,cxp=left+L.card.x+CW/2,cyp=top+L.card.y+CH/2;
  ctx.save();ctx.translate(cxp,cyp);ctx.scale(cs,cs);
  if(isSel&&Z){ctx.save();ctx.fillStyle='#0d0b14';rr(ctx,-CW/2-5,-CH/2-5,CW+10,CH+10,13);ctx.fill();ctx.strokeStyle=b.neon;ctx.shadowColor=b.neon;ctx.shadowBlur=18;ctx.lineWidth=3;rr(ctx,-CW/2-8,-CH/2-8,CW+16,CH+16,15);ctx.stroke();ctx.restore()}
  else if(isSel){ctx.fillStyle='#fff';rr(ctx,-CW/2-5,-CH/2-5,CW+10,CH+10,13);ctx.fill();ctx.strokeStyle='rgba(255,185,56,.9)';ctx.lineWidth=3;rr(ctx,-CW/2-8,-CH/2-8,CW+16,CH+16,15);ctx.stroke()}
  ctx.drawImage(b.card,-CW/2,-CH/2,CW,CH);
  if(Z){ // neon theme: every storefront screen is a CRT
    const gl=isSel&&Math.sin(T*17+b.i)>.985?rnd(-6,6):0;
    if(gl){ctx.save();ctx.globalAlpha=.45;ctx.globalCompositeOperation='lighter';ctx.drawImage(b.card,-CW/2+gl,-CH/2,CW,CH);ctx.restore()}
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
  // state dressing
  if(dusty){ctx.fillStyle='rgba(150,142,132,.28)';ctx.fillRect(left,top,BW,b.bh);
    ctx.strokeStyle='rgba(240,240,240,.7)';ctx.lineWidth=1.2;web(left+2,top+16,1,1,46);web(left+BW-2,top+16,-1,1,38);web(dx+d.w-2,dy+2,-1,1,26);
    ctx.fillStyle='rgba(220,210,200,.5)';for(let k=0;k<7;k++){const px=left+((k*53+b.i*31)%BW),py=top+30+((k*97)%(b.bh-60))+Math.sin(T+k)*4;ctx.fillRect(px,py,2,2)}}
  if(closed){ // shutter + sign
    const sh=d.h*.72;ctx.fillStyle='#8d8f96';ctx.fillRect(dx-4,dy-2,d.w+8,sh);ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=1.5;for(let k=6;k<sh;k+=6){ctx.beginPath();ctx.moveTo(dx-4,dy-2+k);ctx.lineTo(dx+d.w+4,dy-2+k);ctx.stroke()}
    ctx.strokeStyle='#3a3036';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(dx+d.w/2-16,dy+sh-10);ctx.lineTo(dx+d.w/2,dy+sh-22);ctx.lineTo(dx+d.w/2+16,dy+sh-10);ctx.stroke();
    ctx.save();ctx.translate(dx+d.w/2,dy+sh-2);ctx.rotate(Math.sin(T*1.3+b.i)*.04);ctx.fillStyle='#f4ecdc';rr(ctx,-38,-12,76,26,5);ctx.fill();ctx.strokeStyle='#b8424a';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#b8424a';ctx.font='15px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('CLOSED',0,1.5);ctx.restore()}
  if(b.st==='downloading')drawScaffold(b,left,top);
  if(b.st==='new'||b.cele>0)drawBalloons(b,left,top);
  if(b.st==='recent'){ // OPEN neon + plant
    const w=L.wins[1],x=left+w.x+w.w/2,y=top+w.y+w.h/2;ctx.font='14px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=`rgba(98,214,178,${.75+.25*Math.sin(T*3)})`;ctx.shadowColor='#62d6b2';ctx.shadowBlur=night?12:4;ctx.fillText('OPEN',x,y);ctx.shadowBlur=0;
    const px=dx-22,py=SIDE;ctx.fillStyle='#a5583c';ctx.beginPath();ctx.moveTo(px-12,py-22);ctx.lineTo(px+12,py-22);ctx.lineTo(px+9,py);ctx.lineTo(px-9,py);ctx.fill();
    ctx.fillStyle='#4f9a5a';[[-8,-34,-.5],[0,-40,0],[8,-34,.5]].forEach(([a,bq,r])=>{ctx.save();ctx.translate(px+a,py+bq+Math.sin(T*2+a)*1);ctx.rotate(r);ell(ctx,0,0,5,11);ctx.fill();ctx.restore()})}
  premiumFront(b,left,top);
  }
/* ---- playtime tiers: 100h / 200h / 500h storefronts get fancier, per theme ---- */
const TIER=[null,{n:host.tiers[1],h:'100h+',c:'#d79a5b'},{n:host.tiers[2],h:'200h+',c:'#cfd8e6'},{n:host.tiers[3],h:'500h+',c:'#ffd24a'}];
function tierOf(b){const h=b.hours||0;return h>=500?3:h>=200?2:h>=100?1:0}
function premiumBeams(b,left,top,sk){
  const t=tierOf(b);if(t<2||(!Z&&sk==='day'&&t<3))return;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const n=t===3?(Z?4:3):2;
  for(let k=0;k<n;k++){const bx=left+BW*(k+.5)/n,ang=Math.sin(T*.55+k*1.7+b.i)*.45+(k-(n-1)/2)*.18,len=900,wd=Z?10:46;
    const col=Z?(t===3&&k%2?'#ffe14d':b.neon):'#fff2c4',a=Z?.45:(sk==='day'?.12:.22);
    ctx.save();ctx.translate(bx,top-4);ctx.rotate(ang);const g=ctx.createLinearGradient(0,0,0,-len);g.addColorStop(0,hexA(col,a));g.addColorStop(1,hexA(col,0));ctx.fillStyle=g;
    ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(3,0);ctx.lineTo(wd,-len);ctx.lineTo(-wd,-len);ctx.closePath();ctx.fill();ctx.restore()}
  ctx.restore();
}
function carpet(dx,d,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(dx+6,SIDE);ctx.lineTo(dx+d.w-6,SIDE);ctx.lineTo(dx+d.w+18,SIDE+56);ctx.lineTo(dx-18,SIDE+56);ctx.closePath();ctx.fill()}
function premiumBack(b,left,top,sk){
  const t=tierOf(b);if(!t)return;const L=b.L,d=L.door,dx=left+d.x,cx=left+BW/2,night=sk!=='day';
  if(!Z){
    const gold=ctx.createLinearGradient(0,top-2,0,top+18);gold.addColorStop(0,'#fff0a8');gold.addColorStop(.5,'#e6b23a');gold.addColorStop(1,'#a8781e');
    ctx.fillStyle=gold;ctx.fillRect(left-12,top-2,BW+24,5);ctx.fillRect(left-12,top+14,BW+24,3);
    L.wins.forEach((w,j)=>{const x=left+w.x,y=top+w.y+w.h+6;ctx.fillStyle='#7a4a2c';ctx.fillRect(x-4,y,w.w+8,7);ctx.fillStyle='#4f9a5a';ctx.fillRect(x-2,y-2,w.w+4,3);
      for(let k=0;k<6;k++){ctx.fillStyle=['#ff7f8e','#ffd65a','#ffffff'][(k+j)%3];ell(ctx,x+3+k*(w.w-6)/5,y-3+Math.sin(T*2+k)*.6,3.4,3.4);ctx.fill()}});
    if(t>=2){
      ctx.strokeStyle='rgba(60,40,30,.6)';ctx.lineWidth=1;ctx.beginPath();for(let k=0;k<=20;k++){const u=k/20;ctx.lineTo(left+6+u*(BW-12),top+20+Math.sin(u*Math.PI)*16)}ctx.stroke();
      for(let k=0;k<11;k++){const u=k/10,x=left+6+u*(BW-12),y=top+22+Math.sin(u*Math.PI)*16,on=(k+Math.floor(T*3))%3!==0;
        ctx.fillStyle=on?(night?'#fff3b0':'#ffe48a'):'#8a7a50';ell(ctx,x,y,3.2,3.6);ctx.fill();
        if(on&&night){ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgba(255,230,150,.28)';ell(ctx,x,y,9,9);ctx.fill();ctx.restore()}}
      const fx=left+BW-26;ctx.fillStyle='#5a4a3a';ctx.fillRect(fx,top-58,3,60);ctx.fillStyle=t===3?'#e5484d':'#86c9ff';ctx.beginPath();
      for(let k=0;k<=8;k++)ctx.lineTo(fx+3+k*4,top-58+Math.sin(T*6-k*.8)*2.5);for(let k=8;k>=0;k--)ctx.lineTo(fx+3+k*4,top-40+Math.sin(T*6-k*.8)*2.5);ctx.closePath();ctx.fill()}
    if(t>=3){
      const dg=ctx.createRadialGradient(cx-14,top-40,4,cx,top-20,60);dg.addColorStop(0,'#fff6c8');dg.addColorStop(.5,'#f0c24a');dg.addColorStop(1,'#a8781e');ctx.fillStyle=dg;
      ctx.beginPath();ctx.moveTo(cx-50,top);ctx.bezierCurveTo(cx-50,top-58,cx+50,top-58,cx+50,top);ctx.closePath();ctx.fill();ctx.strokeStyle='#8a5e14';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.45)';ctx.beginPath();ctx.ellipse(cx-18,top-24,6,14,-.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a8781e';ctx.fillRect(cx-2,top-62,4,20);star(cx,top-68,9+Math.sin(T*3)*1.2,'#ffe27a');
      carpet(dx,d,'#c0303a');ctx.strokeStyle='#f0c24a';ctx.lineWidth=2;ctx.stroke();
      [dx-26,dx+d.w+26].forEach(px=>{ctx.fillStyle='#e6b23a';ctx.fillRect(px-2,SIDE+8,4,30);ell(ctx,px,SIDE+8,4,4);ctx.fill()});
      ctx.strokeStyle='#9a1f2a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(dx-26,SIDE+14);ctx.quadraticCurveTo(dx-36,SIDE+30,dx-46,SIDE+18);ctx.moveTo(dx+d.w+26,SIDE+14);ctx.quadraticCurveTo(dx+d.w+36,SIDE+30,dx+d.w+46,SIDE+18);ctx.stroke()}
  }else{
    // chrome-gold arc over the card
    ctx.save();ctx.strokeStyle=t>=3?'#ffe14d':'#e8f6ff';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.lineWidth=2.5;ctx.lineCap='round';ctx.globalAlpha=.9;
    const ay=top+L.card.y-24;ctx.beginPath();ctx.moveTo(left+40,ay+10);ctx.quadraticCurveTo(left+BW/2,ay-18,left+BW-40,ay+10);ctx.stroke();
    star(left+BW/2,ay-5,5,ctx.strokeStyle);ctx.restore();
    if(t>=2){const x0=left+L.card.x-13,y0=top+L.card.y-13,w=CW+26,h=CH+26,step=12,n=Math.floor(2*(w+h)/step),sh=Math.floor(T*14);
      for(let k=0;k<n;k++){const p=k*step;let x,y;if(p<w){x=x0+p;y=y0}else if(p<w+h){x=x0+w;y=y0+p-w}else if(p<2*w+h){x=x0+w-(p-w-h);y=y0+h}else{x=x0;y=y0+h-(p-2*w-h)}
        const on=(k+sh)%4===0;ctx.fillStyle=on?(t>=3?'#ffe14d':b.neon):'rgba(255,255,255,.14)';ell(ctx,x,y,on?2.7:1.8,on?2.7:1.8);ctx.fill()}}
    if(t>=3){
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(cx,top-66);ctx.strokeStyle='#ffe14d';ctx.shadowColor='#ffe14d';ctx.shadowBlur=16;ctx.lineWidth=2.5;
      ctx.save();ctx.scale(Math.abs(Math.cos(T*1.4))*.85+.15,1);ctx.beginPath();ctx.moveTo(-34,14);ctx.lineTo(-34,-10);ctx.lineTo(-17,4);ctx.lineTo(0,-18);ctx.lineTo(17,4);ctx.lineTo(34,-10);ctx.lineTo(34,14);ctx.closePath();ctx.stroke();ctx.restore();
      ctx.lineWidth=1.5;ctx.strokeStyle='rgba(255,225,77,.55)';ell(ctx,0,24,48,8);ctx.stroke();ctx.restore();
      carpet(dx,d,'#3a0f2a');ctx.save();ctx.strokeStyle='#ffe14d';ctx.shadowColor='#ffe14d';ctx.shadowBlur=10;ctx.lineWidth=2;ctx.stroke();ctx.restore();
      for(let k=0;k<5;k++){const u=(k/5+T*.6)%1;ctx.fillStyle=hexA('#ffe14d',.8*(1-u));ell(ctx,dx+d.w/2,SIDE+u*52,lerp(10,26,u),2);ctx.fill()}}
  }
}
function premiumFront(b,left,top){
  const t=tierOf(b);if(!t)return;const L=b.L,ti=TIER[t];
  if(t>=2&&b.i!==sel){ctx.save();ctx.strokeStyle=Z?(t>=3?'#ffe14d':b.neon):(t>=3?'#f0c24a':'#d8dee8');if(Z){ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=10}ctx.lineWidth=3;rr(ctx,left+L.card.x-4,top+L.card.y-4,CW+8,CH+8,12);ctx.stroke();ctx.restore()}
  ctx.save();ctx.translate(left+L.card.x-8,top+L.card.y-12);ctx.rotate(-.1);ctx.font='13px '+HEAVY;const txt=`${ti.n} ${ti.h}`,w=ctx.measureText(txt).width+18;
  if(Z){const c=t>=3?'#ffe14d':t>=2?b.neon:ti.c;ctx.fillStyle='rgba(10,8,20,.92)';rr(ctx,0,-11,w,22,6);ctx.fill();ctx.strokeStyle=c;ctx.shadowColor=c;ctx.shadowBlur=8;ctx.lineWidth=1.6;ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=c}
  else{const g=ctx.createLinearGradient(0,-11,0,11);g.addColorStop(0,'#ffffff');g.addColorStop(1,ti.c);ctx.fillStyle=g;rr(ctx,0,-11,w,22,6);ctx.fill();ctx.strokeStyle='rgba(60,40,20,.5)';ctx.lineWidth=1.4;ctx.stroke();ctx.fillStyle='#3a2a18'}
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,9,1);ctx.restore();
  if(t>=3){for(let k=0;k<7;k++){const ph=(T*.8+k*.37)%1,x=left+((k*83+b.i*29)%BW),y=top-60+((k*131)%(b.bh-40));ctx.globalAlpha=Math.sin(ph*Math.PI);star(x,y,4+ph*5,Z?'#ffe14d':'#fff6c8')}ctx.globalAlpha=1}
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
function drawBalloons(b,left,top){
  const L=b.L,cols=['#ff7f8e','#ffb938','#86c9ff','#62d6b2','#c79bff'];
  [[left+6,-1],[left+BW-6,1]].forEach(([ax,sd],q)=>{
    const ay=SIDE-10;for(let k=0;k<3;k++){const bx=ax+sd*(10+(k%2)*14)+Math.sin(T*1.6+k+q)*5,by=top+L.card.y+CH-10-k*34+Math.cos(T*1.3+k)*4;
      ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(ax+sd*8,(ay+by)/2,bx,by+18);ctx.stroke();
      ctx.fillStyle=cols[(k+q*2+b.i)%5];ell(ctx,bx,by,13,16);ctx.fill();ctx.fillStyle='rgba(255,255,255,.45)';ell(ctx,bx-4,by-6,3,5);ctx.fill();ctx.fillStyle=cols[(k+q*2+b.i)%5];ctx.beginPath();ctx.moveTo(bx-3,by+18);ctx.lineTo(bx+3,by+18);ctx.lineTo(bx,by+14);ctx.fill()}});
  // pennant string + NEW tag
  const y0=top+L.awn.y-6;ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(left+14,y0);ctx.quadraticCurveTo(left+BW/2,y0+18,left+BW-14,y0);ctx.stroke();
  for(let k=1;k<10;k++){const t=k/10,x=lerp(left+14,left+BW-14,t),y=y0+18*4*t*(1-t)*.5*2;ctx.fillStyle=cols[k%5];ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.lineTo(x,y+12);ctx.fill()}
  if(b.st==='new'){const tx=left+L.card.x+CW-6,ty=top+L.card.y-4;ctx.save();ctx.translate(tx,ty);ctx.rotate(.18);ctx.fillStyle='#ffb938';rr(ctx,-26,-12,52,24,6);ctx.fill();ctx.fillStyle='#1b1420';ctx.font='15px '+HEAVY;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('NEW',0,1);ctx.restore()}
}

/* the minimi: an original round baby penguin (scarf in town, raincoat in the neon rain) */
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
  if(m.petT>0&&s!=='held'){syy*=1+Math.sin(T*10)*.03;armL=-.6;armR=-.6}
  if(s==='sulk'&&m.sulkKind==='back'){syy*=.86;sxx*=1.06}
  if(s==='cheer'){armL=-2.4;armR=-2.4}
  // squash recovery towards 1
  m.sx+=(1-m.sx)*.15;m.sy+=(1-m.sy)*.15;
  sxx*=1-.1*pf;
  ctx.translate(0,-bob);
  ctx.translate(0,-R);ctx.rotate(rot+lean);ctx.translate(0,R);
  ctx.scale(sxx,syy);
  const back=(s==='sulk'&&m.sulkKind==='back')||(s==='enter'&&m.t>.08);
  const ink='#26283a',navy=Z?'#2b3550':'#33405e',navyD=Z?'#1c233a':'#222c46',belly=f.red>0?mix('#ffffff','#ffc2b6',f.red):'#ffffff';
  const coat='#ffd23f',coatD='#d9a118';
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
  if(Z&&back){ctx.fillStyle=coat;ctx.fillRect(-R*1.4,-R*.98,R*2.8,R*2.2);ctx.strokeStyle=coatD;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,-R*.98);ctx.lineTo(0,R);ctx.stroke()}
  else if(Z){ // raincoat front panels, open in the middle
    const co=dd*pf*R*.35;ctx.fillStyle=coat;[-1,1].forEach(sd=>{ctx.beginPath();ctx.moveTo(sd*R*1.4,-R*.98);ctx.lineTo(sd*R*.4+co,-R*.98);ctx.lineTo(sd*R*.28+co,R);ctx.lineTo(sd*R*1.4,R);ctx.closePath();ctx.fill()});
    ctx.strokeStyle=coatD;ctx.lineWidth=1.6;[-1,1].forEach(sd=>{ctx.beginPath();ctx.moveTo(sd*R*.4+co,-R*.98);ctx.lineTo(sd*R*.28+co,R);ctx.stroke()});
    ctx.fillStyle=ink;ell(ctx,R*.52+co,-R*.74,1.8,1.8);ctx.fill();ell(ctx,R*.49+co,-R*.44,1.8,1.8);ctx.fill()}
  ctx.restore();
  ctx.strokeStyle=ink;ctx.lineWidth=3;bodyPath();ctx.stroke();
  const sw=Math.sin(T*3+m.phase*.5)*.15+(moving?-m.dir*.25:0)+(s==='air'?Math.sin(T*25)*.4:0);
  if(Z){ // rain hood framing the face
    ctx.fillStyle=coat;ctx.beginPath();ctx.moveTo(-R*1.08,-R*1.05);ctx.bezierCurveTo(-R*1.18,-R*2.95,R*1.18,-R*2.95,R*1.08,-R*1.05);
    if(back)ctx.quadraticCurveTo(0,-R*.92,-R*1.08,-R*1.05);else{const ho=dd*pf*R*.32;ctx.bezierCurveTo(R*.84+ho,-R*1.95,-R*.84+ho,-R*1.95,-R*1.08,-R*1.05)}ctx.closePath();ctx.fill();ctx.lineWidth=2.6;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.ellipse(-R*.5,-R*2.0,7,2.6,-.4,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(0,-R*2.3);ctx.rotate(sw*.5);ctx.fillStyle=coat;ctx.beginPath();ctx.moveTo(-3,2);ctx.quadraticCurveTo(0,-9,3,2);ctx.fill();ctx.stroke();ctx.restore()}
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
    let r=sd*-a*.9;if(!far&&pf>0&&!['held','air','splatW','splatG','trip'].includes(s))r=lerp(r,(moving?Math.sin(ph)*.75:0)-dd*.12,pf);ctx.rotate(r);ctx.fillStyle=Z?coat:navy;ctx.beginPath();ctx.ellipse(sd*2.5*fa,12,Math.max(.5,5.8*fa),15,sd*-.12,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore()});
  if(!back)drawFace(f);
  else{ // back view: little tail nub
    ctx.fillStyle=Z?coat:navyD;ctx.strokeStyle=ink;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-7,-R*.3);ctx.quadraticCurveTo(0,-R*.3+14+Math.sin(T*8)*1.5,7,-R*.3);ctx.closePath();ctx.fill();ctx.stroke()}
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
  const ink='#26283a',d=m.fdir||m.dir||1,pf=m.pfE||0,lx=d*(4+pf*R*.3),ly=f.lookY,ey=-R*1.4+ly,ex=R*.34*(1-pf*.5),farA=clamp((.55-pf)/.35,0,1);
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
    else if(p.k==='text'){const k=Math.min(1,p.life*8),sc=k<1?.5+k*.7:1.2-(p.life-.125)*.25;ctx.save();ctx.translate(x,p.y);ctx.rotate(p.rot);ctx.scale(sc,sc);ctx.globalAlpha=Math.min(1,a*2);ctx.font=`${p.size}px ${DISPLAY}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle='#2f2236';ctx.strokeText(p.text,0,0);ctx.fillStyle=p.col;ctx.fillText(p.text,0,0);ctx.restore()}
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
  if(m.behind){ctx.save();drawMinimi(m.x+ox+(m.sulkKind==='hide'?m.side*m.peek*16:0),f);ctx.restore()}
  Z?drawGroundNeon(ox):drawGround(sk);
  const lampXs=[];const li0=Math.max(-1,Math.floor((camX-900)/SP)),li1=Math.min(B.length-1,Math.ceil((camX+900)/SP));for(let i=li0;i<=li1;i++)lampXs.push(i*SP+SP/2);
  const vis=x=>x+ox>-420&&x+ox<W+420;
  lampXs.forEach((x,i)=>{if(vis(x))drawLamp(x+ox,sk,false,i+li0)});
  {const bi0=Math.max(0,Math.floor((camX-1100)/SP)),bi1=Math.min(B.length-1,Math.ceil((camX+1100)/SP));for(let i=bi0;i<=bi1;i++){try{drawBuilding(B[i],sk,ox)}catch(err){if(!drawErr){drawErr=true;console.debug('[MinimiTown:draw] building failed',B[i]?.appid,err)}}}}
  if(sk!=='day')lampXs.forEach((x,i)=>{if(vis(x))drawLamp(x+ox,sk,true,i+li0)});
  if(sk==='night'){ctx.fillStyle=Z?'rgba(20,6,40,.12)':'rgba(10,12,40,.18)';ctx.fillRect(-300,-300,W+600,H+600)}
  if(!m.behind&&m.state!=='inside')drawMinimi(m.x+ox,f);
  drawParts(ox);
  if(Z)drawRain();
  if(m.state!=='inside')drawBubble(m.x+ox);
  ctx.restore();
  // off-screen marker
  const msx=m.x+ox;if(m.state!=='inside'&&(msx<-20||msx>W+20)){const side=msx<0?-1:1,x=side<0?34:W-34,y=FEET-40;ctx.fillStyle='rgba(22,17,30,.8)';ell(ctx,x,y,24,24);ctx.fill();ctx.fillStyle=Z?'#ffd23f':'#33405e';ell(ctx,x,y+2,16,15);ctx.fill();ctx.fillStyle='#fff';ell(ctx,x-4,y+1,6,6);ctx.fill();ell(ctx,x+4,y+1,6,6);ctx.fill();ctx.fillStyle='#26283a';ell(ctx,x-4,y,1.8,2.4);ctx.fill();ell(ctx,x+4,y,1.8,2.4);ctx.fill();ctx.fillStyle='#ff9d3a';ell(ctx,x,y+6,3,2);ctx.fill();ctx.fillStyle='#ffb938';ctx.beginPath();ctx.moveTo(x+side*30,y);ctx.lineTo(x+side*22,y-7);ctx.lineTo(x+side*22,y+7);ctx.fill()}
}


/* ---------------- loop ---------------- */
let last=0,raf=0,frozen=false,active=false,trimT=0;var drawErr=false;
function loop(ts){
  raf=0;let dt=(ts-last)/1000;if(!(dt>0))dt=0.016;dt=Math.min(.05,dt);last=ts;
  update(dt);updRain(dt);
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
function overMinimi(w,pad=0){if(['inside','enter','exit'].includes(m.state)||m.alpha<.5)return false;const cy=m.y-R*1.15*m.scale;return Math.hypot(w.x-m.x,(w.y-cy)*.75)<R*1.5+pad+(m.behind?14:0)}
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
function cancelLaunch(){if(mode==='launching'){mode='browse';if(cur())cur().doorTarget=0;if(['goDoor','hesitate','enter'].includes(m.state)){m.alpha=1;m.scale=1;m.y=FEET;setState('idle')}host.onSelect(sel)}}
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
  if(talk&&mode==='browse')say(Z?'비다! 우비 입어야지':'햇살 좋다!',1.4);
  drawFrame();
}
function setSky(s){skyMode=s||'auto';drawFrame()}
function setCardStyle(st){st=st==='capsule'?'capsule':'wide';if(st===cardStyle)return;cardStyle=st;CW=CARD[st][0];CH=CARD[st][1];setGames(B.map(b=>b.game),B[sel]?.appid)}
function setActive(on){active=!!on;if(active){start()}else stop()}
function destroy(){active=false;stop();clearTimeout(moodSaveT);try{host.saveMood(Math.round(mood))}catch(e){};listeners.forEach(([t,f])=>cv.removeEventListener(t,f));B=[]}
setTimeout(()=>{if(mode==='browse')say('안녕!',1.6)},600);
return {fit,emerge,setGames,patchGames,setTheme,setSky,setCardStyle,setActive,destroy,nav,select,launch,goBack,cancelLaunch,shake,
  get selected(){return sel},get mode(){return mode},get mood(){return mood},set mood(v){mood=clamp(v,0,100);saveMood()},
  get debug(){return {m,B,camX}}};
}
