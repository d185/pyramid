const fs=require('fs'),{createCanvas}=require('canvas');
const W=160,H=280; const gl=require('gl')(W,H,{preserveDrawingBuffer:true});
global.window=global;global.self=global;global.innerWidth=W;global.innerHeight=H;global.devicePixelRatio=1;
global.addEventListener=()=>{};global.removeEventListener=()=>{};
let pending=null;global.requestAnimationFrame=f=>{pending=f;return 1};global.cancelAnimationFrame=()=>{pending=null};
global.document={hidden:false,createElement:()=>{const c=createCanvas(8,8);c.style={};c.addEventListener=()=>{};return c}};
global.THREE=require('three');
let ctxCreated=0;
const cv={width:W,height:H,style:{},listeners:{},addEventListener(n,f){this.listeners[n]=f},removeEventListener(){},getContext:()=>{ctxCreated++;return gl}};gl.canvas=cv;
eval(fs.readFileSync(__dirname+'/../public/scene.js','utf8'));
const S=window.Scene;
function lum(){for(let i=0;i<6;i++){if(pending){const f=pending;pending=null;f(performance.now()+i*20)}}
  const px=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);let s=0;for(let i=0;i<px.length;i+=4)s+=px[i]+px[i+1]+px[i+2];return (s/(W*H*3)).toFixed(0)}
const step=(name,fn)=>{try{const r=fn();console.log(name.padEnd(40),'яркость',lum(),r!==undefined?'| '+r:'')}catch(e){console.log(name.padEnd(40),'ОШИБКА',e.message)}};
step('вход в зелёную', ()=>S.enter('green',cv));
step('повторный вход в ту же (как при госте)', ()=>S.enter('green',cv));
step('смена на золотую на лету', ()=>'restyle → '+S.restyle('gold'));
step('та же золотая ещё раз', ()=>'restyle → '+S.restyle('gold'));
step('выход', ()=>S.dispose());
step('снова вход, индиго', ()=>S.enter('blue',cv));
step('потеря и возврат контекста', ()=>{cv.listeners.webglcontextlost({preventDefault(){}});cv.listeners.webglcontextrestored();});
setTimeout(()=>{ step('через 100 мс после восстановления',()=>S.kind());
  console.log('графических контекстов запрошено у холста:',ctxCreated,'(должен быть один)'); process.exit(0); },120);
