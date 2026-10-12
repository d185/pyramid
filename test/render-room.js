/* Отрисовка комнаты тем же scene.js, что в браузере, через программный WebGL */
const fs=require('fs'), {PNG}=require('pngjs');
const {createCanvas}=require('canvas');
const W=+process.argv[3]||360, H=+process.argv[4]||640, KIND=process.argv[2]||'green';
const gl=require('gl')(W,H,{preserveDrawingBuffer:true,antialias:false});
global.window=global; global.self=global;
global.innerWidth=W; global.innerHeight=H; global.devicePixelRatio=1;
global.performance=global.performance||require('perf_hooks').performance;
global.addEventListener=()=>{}; global.removeEventListener=()=>{};
let pending=null; global.requestAnimationFrame=f=>{pending=f;return 1}; global.cancelAnimationFrame=()=>{};
global.document={hidden:false,createElement:t=>{const c=createCanvas(8,8);c.style={};c.addEventListener=()=>{};return c;},
  createElementNS:()=>({style:{}})};
global.THREE=require('three');
const glCanvas={width:W,height:H,style:{},addEventListener(){},removeEventListener(){},getContext:()=>gl,clientWidth:W,clientHeight:H};
gl.canvas=glCanvas;
eval(fs.readFileSync(__dirname+'/../public/scene.js','utf8'));
let ok; try{ ok=window.Scene.enter(KIND,glCanvas); }catch(e){ console.log('ошибка:',e.message,e.stack.split('\n').slice(0,3).join(' | ')); }
if(!ok){console.log('сцена не поднялась');process.exit(1)}
window.Scene.setLevel(+process.argv[5]||0);
for(let i=0;i<30;i++){ if(pending){const f=pending;pending=null;f();} }
const px=new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
const png=new PNG({width:W,height:H});
for(let y=0;y<H;y++) for(let x=0;x<W;x++){const s=((H-1-y)*W+x)*4,d=(y*W+x)*4;png.data[d]=px[s];png.data[d+1]=px[s+1];png.data[d+2]=px[s+2];png.data[d+3]=255;}
fs.writeFileSync('room_'+KIND+'.png',PNG.sync.write(png));
/* яркость: стены — верхняя половина, пол — нижняя треть */
const lum=(y0,y1)=>{let s=0,n=0;for(let y=y0;y<y1;y++)for(let x=0;x<W;x+=2){const d=(y*W+x)*4;s+=0.2126*png.data[d]+0.7152*png.data[d+1]+0.0722*png.data[d+2];n++}return s/n};
console.log(KIND.padEnd(7),'стены',lum(Math.round(H*.1),Math.round(H*.45)).toFixed(0),'| пол',lum(Math.round(H*.72),H).toFixed(0));
process.exit(0);
