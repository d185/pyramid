/* имитация родной оболочки: страница живёт на capacitor://localhost, сервер — по полному адресу */
const {JSDOM}=require('jsdom'); const fs=require('fs');
const D=__dirname+'/../public/';
let html=fs.readFileSync(D+'index.html','utf8').replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/,'').replace(/<link[^>]*fonts[^>]*>/g,'');
html=html.replace('<head>','<head><script>window.PYRAMID_SERVER="http://localhost:8059";</script>');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/',pretendToBeVisual:true});
const w=dom.window, hits=[];
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
w.HTMLCanvasElement.prototype.toDataURL=()=>'data:,';
w.fetch=(u,o)=>{hits.push(u);return fetch(u,o)};
w.WebSocket=function(u){hits.push('WS '+u);this.readyState=0;this.send=()=>{}};
w.AudioContext=function(){return{state:'running',destination:{},createGain:()=>({gain:{value:1},connect:x=>x}),createAnalyser:()=>({fftSize:512,connect(){},getByteTimeDomainData(a){a.fill(128)}}),createMediaStreamDestination:()=>({stream:{getAudioTracks:()=>[{}]}}),createOscillator:()=>({connect:x=>x,start(){}}),createMediaStreamSource:s=>({connect(){},disconnect(){},mediaStream:s}),resume:()=>Promise.resolve()}};
w.navigator.mediaDevices={getUserMedia:()=>Promise.resolve({getTracks:()=>[{stop(){}}],getAudioTracks:()=>[{enabled:true}]})};
w.RTCPeerConnection=function(){return{addTrack(){},getSenders:()=>[],close(){},getStats:async()=>({forEach(){}})}};
w.localStorage.setItem('pyr-name','Тест'); w.PYRAMID_SERVER='http://localhost:8059';
for(const f of ['i18n.js','day.js','scene.js','chunker.js','app.js']) w.eval(fs.readFileSync(D+f,'utf8'));
w.document.querySelector('[data-style="green"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
setTimeout(()=>{
  const api=hits.filter(h=>/\/api\//.test(h)), ws=hits.filter(h=>h.startsWith('WS'));
  console.log('запросы к серверу идут по полному адресу:', api.length>0 && api.every(h=>h.startsWith('http://localhost:8059/')), api[0]);
  console.log('сокет — к серверу, а не к оболочке:', ws.length>0 && ws[0].includes('ws://localhost:8059'), ws[0]);
  console.log('ссылка-приглашение ведёт на сайт:', w.__pyr.inviteLink().startsWith('http://localhost:8059/?room='), w.__pyr.inviteLink());
  process.exit(0);
},1500);
