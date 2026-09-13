const {JSDOM}=require('jsdom'); const fs=require('fs');
const D='/mnt/user-data/outputs/pyramid/public/';
const html=fs.readFileSync(D+'index.html','utf8')
  .replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/,'')
  .replace(/<link[^>]*fonts[^>]*>/g,'');
const errors=[];
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://x.test/?room=abc',pretendToBeVisual:true});
const w=dom.window;
w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
w.fetch=()=>Promise.reject(new Error('нет сети в тесте'));
w.AudioContext=function(){return{currentTime:0,destination:{},createGain:()=>({gain:{value:1,setTargetAtTime(){}},connect(x){return x}}),createAnalyser:()=>({fftSize:512,connect(){},getByteTimeDomainData(a){for(let i=0;i<a.length;i++)a[i]=128+Math.round(Math.sin(i/9)*40)},smoothingTimeConstant:0}),resume:()=>Promise.resolve(),decodeAudioData:()=>Promise.resolve({duration:60}),createBufferSource:()=>({connect(){},start(){},stop(){},playbackRate:{value:1,setTargetAtTime(){}}}),createMediaStreamSource:()=>({connect(){}})}};
w.navigator.mediaDevices={getUserMedia:()=>Promise.resolve({getTracks:()=>[],getAudioTracks:()=>[]})};
w.RTCPeerConnection=function(){return{addTrack(){},getSenders:()=>[],close(){},restartIce(){},createOffer:()=>Promise.resolve({}),setLocalDescription(){},setRemoteDescription(){},addIceCandidate(){},getStats:()=>Promise.resolve({forEach(){}}),iceConnectionState:'new',signalingState:'stable'}};
w.WebSocket=function(){this.readyState=0;this.send=()=>{};setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen()},5)};
w.WebSocket.prototype.close=()=>{};
w.onerror=(m)=>errors.push('window.onerror: '+m);

// холст в jsdom не рисует — подменяем, иначе генератор мрамора зависает
w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,k)=>{
  if(k==='canvas')return {width:1,height:1};
  if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});
  if(k==='getImageData')return ()=>({data:new Uint8ClampedArray(4)});
  return ()=>{};}})};
for(const f of ['i18n.js','day.js','scene.js','app.js']){
  try{ w.eval(fs.readFileSync(D+f,'utf8')); console.log('✓ загружен',f); }
  catch(e){ console.log('✗ ОШИБКА в',f,'→',e.message); console.log(String(e.stack).split('\n').slice(0,6).join('\n')); errors.push(f+': '+e.message); }
}
const $=s=>w.document.querySelector(s);
const out=[];const say=(...a)=>{out.push(a.join(' '));console.log(...a)};

say('--- состояние интерфейса ---');
say('надпись фонотеки:', JSON.stringify($('#libLbl').textContent));
say('надпись добавить:', JSON.stringify($('#addLbl').textContent));
say('меню фонотеки пусто?', $('#libMenu').innerHTML.length===0);
say('обработчик у invite?', typeof $('#invite').onclick);
say('обработчик у diagBtn?', typeof $('#diagBtn').onclick);
say('обработчик у music?', typeof $('#music').oninput);
say('обработчик у mic?', typeof $('#micBtn').onclick);
say('заголовок главной:', JSON.stringify($('#homeTag').textContent.slice(0,40)));

say('--- проверка нажатий ---');
function click(sel){const el=$(sel); if(!el) return say(sel,'НЕТ ТАКОГО');
  el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));}
click('#libBtn'); say('меню фонотеки открылось?', $('#dropLib').classList.contains('open'));
click('#addBtn'); say('меню добавить открылось?', $('#dropAdd').classList.contains('open'));
say('   фонотека закрылась при этом?', !$('#dropLib').classList.contains('open'));
click('#musicBtn'); say('ползунок музыки открылся?', $('#dropMusic').classList.contains('open'));
click('#voiceBtn'); say('ползунок речи открылся?', $('#dropVoice').classList.contains('open'));
click('#chatMore'); say('чат развернулся?', $('#chatBox').classList.contains('open'));
click('#chatMore'); say('чат свернулся?', !$('#chatBox').classList.contains('open'));
click('#diagBtn'); say('диагностика открылась?', $('#diagSheet').classList.contains('on'));
click('#invite'); say('окно приглашения открылось?', $('#inviteBack').classList.contains('on'));
click('#optClose'); say('приглашение закрылось?', !$('#inviteBack').classList.contains('on'));
click('#hpSwitch'); say('режим переключился на:', JSON.stringify($('#hpNow').textContent));
say('подписи кнопок:', ['#invLbl','#trfLbl','#rmLbl'].map(s=>JSON.stringify($(s).textContent)).join(' '));
say('скрыты, пока не нужны:', 'передача='+$('#transfer').hidden, 'комната='+$('#toRooms').hidden);

say('всего ошибок:', errors.length);

setTimeout(()=>{require('fs').writeFileSync('page_out.txt',out.join('\n'));process.exit(0)},1500);
