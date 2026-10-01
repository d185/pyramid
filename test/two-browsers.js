const {JSDOM}=require('jsdom'); const fs=require('fs');
const WS=require('../node_modules/ws');
const D=__dirname+'/../public/', PORT=+process.argv[2];
const BASE='http://localhost:'+PORT;
const results=[]; const ok=(name,cond,extra)=>{results.push([cond?'✓':'✗',name,extra||'']);};

/* --- поддельный звонок: два участника обмениваются описаниями через настоящий сервер --- */
function fakeRTC(w,log){
  return function(){
    const pc={senders:[],local:null,remote:null,iceConnectionState:'new',signalingState:'stable',replaced:0};
    pc.addTrack=(track,stream)=>{const s={track,replaceTrack(t){this.track=t;pc.replaced++;return Promise.resolve()},getParameters(){return {encodings:[{}]}},setParameters(){return Promise.resolve()}};
      pc.senders.push(s);pc._stream=stream;setTimeout(()=>pc.onnegotiationneeded&&pc.onnegotiationneeded(),5);return s;};
    pc.getSenders=()=>pc.senders;
    pc.setLocalDescription=async(d)=>{const type=d&&d.type||(pc.remote&&pc.remote.type==='offer'?'answer':'offer');
      if(type==='rollback'){pc.local=null;pc.signalingState='stable';return;}
      pc.local={type,sdp:'fake'};pc.localDescription=pc.local;pc.signalingState=type==='offer'?'have-local-offer':'stable';
      setTimeout(()=>pc.onicecandidate&&pc.onicecandidate({candidate:{candidate:'c',sdpMid:'0'}}),5);
      if(type==='answer') connect();};
    pc.createOffer=async()=>({type:'offer',sdp:'fake'});
    pc.setRemoteDescription=async(d)=>{pc.remote=d;pc.remoteDescription=d;if(d.type==='answer'){pc.signalingState='stable';connect();}};
    pc.addIceCandidate=async()=>{};pc.restartIce=()=>{};pc.close=()=>{pc.iceConnectionState='closed'};
    pc.getStats=async()=>({forEach(){}});
    function connect(){ if(pc.iceConnectionState==='connected')return; pc.iceConnectionState='connected';
      const track={kind:'audio',enabled:true}; const stream={getAudioTracks:()=>[track],getTracks:()=>[track],id:'remote'};
      setTimeout(()=>{pc.oniceconnectionstatechange&&pc.oniceconnectionstatechange(); pc.ontrack&&pc.ontrack({streams:[stream]});},10);}
    log.pcs.push(pc); return pc;
  };
}

function browser(name, url, opts){
  const html=fs.readFileSync(D+'index.html','utf8')
    .replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/,'').replace(/<link[^>]*fonts[^>]*>/g,'');
  const dom=new JSDOM(html,{runScripts:'outside-only',url,pretendToBeVisual:true});
  const w=dom.window, log={errs:[],pcs:[],blobs:[],els:new Set(),rateChanges:0,micReq:0,seeks:0};
  w.onerror=m=>log.errs.push(m);
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(t,k)=>{
    if(k==='createImageData')return(a,b)=>({data:new Uint8ClampedArray(a*b*4)});
    if(k==='getImageData')return(x,y,a,b)=>({data:new Uint8ClampedArray(a*b*4).fill(90)});
    if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return()=>{}}});
  w.HTMLCanvasElement.prototype.toDataURL=()=>'data:,';
  /* настоящая сеть к настоящему серверу */
  w.fetch=(u,o)=>fetch(u.startsWith('http')?u:BASE+u,o);
  w.Blob=class{constructor(parts,o){this.size=parts.reduce((a,p)=>a+(p.byteLength||p.length||0),0);this.type=o&&o.type;log.blobs.push(this.size)}};
  w.URL.createObjectURL=b=>'blob:fake/'+b.size; w.URL.revokeObjectURL=()=>{};
  w.WebSocket=class extends WS{constructor(u){super(u)}};
  w.MediaStream=function(tr){this.getAudioTracks=()=>tr;this.getTracks=()=>tr;};
  /* звуковой выход: только время и события */
  const MP=w.HTMLMediaElement.prototype;
  Object.defineProperty(MP,'readyState',{get(){return this._rs||0},configurable:true});
  Object.defineProperty(MP,'duration',{get(){return this._rs?20:NaN},configurable:true});
  Object.defineProperty(MP,'seeking',{get(){return !!this._sk},configurable:true});
  Object.defineProperty(MP,'error',{get(){return this._err||null},configurable:true});
  Object.defineProperty(MP,'playbackRate',{get(){return this._rate||1},set(v){if(v!==(this._rate||1))log.rateChanges++;this._ct=this.currentTime;this._t0=performance.now();this._rate=v},configurable:true});
  Object.defineProperty(MP,'currentTime',{
    get(){if(this._paused!==false||this._sk)return this._ct||0;return (this._ct||0)+(performance.now()-this._t0)/1000*(this._rate||1)+(opts.skew||0)*(performance.now()-this._t0)/1000;},
    set(v){log.seeks++;this._ct=v;this._sk=true;setTimeout(()=>{this._sk=false;this._t0=performance.now();this.dispatchEvent(new w.Event('seeked'))},60)},configurable:true});
  MP.load=function(){log.els.add(this);const src=this.getAttribute('src')||this.src||'';
    setTimeout(()=>{ if(String(src).startsWith('data:')||String(src).startsWith('blob:')){this._rs=4;this.dispatchEvent(new w.Event('canplay'))}
                     else {this._err={code:4};this.dispatchEvent(new w.Event('error'))} },20)};
  MP.play=function(){this._paused=false;this._t0=performance.now();return Promise.resolve()};
  MP.pause=function(){this._ct=this.currentTime;this._paused=true};
  Object.defineProperty(MP,'paused',{get(){return this._paused!==false},configurable:true});
  const an=()=>({fftSize:512,connect(){},disconnect(){},smoothingTimeConstant:0,getByteTimeDomainData(a){a.fill(log.remoteSilent?128:150)}});
  w.AudioContext=function(){return{currentTime:0,state:'running',destination:{},sampleRate:48000,
    createGain:()=>({gain:{value:1,setTargetAtTime(){}},connect:x=>x,disconnect(){}}),
    createAnalyser:an, createMediaElementSource:()=>({connect(){}}),
    createMediaStreamSource:s=>({connect(){},disconnect(){},mediaStream:s}),
    createMediaStreamDestination:()=>({stream:{getAudioTracks:()=>[{kind:'audio',silent:true,enabled:true}]}}),
    createOscillator:()=>({connect:x=>x,start(){}}),
    resume:()=>Promise.resolve(),suspend:()=>Promise.resolve()}};
  w.navigator.mediaDevices={getUserMedia:()=>{log.micReq++;
    if(opts.denyMic&&log.micReq===1)return Promise.reject(Object.assign(new Error('no'),{name:'NotAllowedError'}));
    return Promise.resolve({getTracks:()=>[{stop(){},kind:'audio',enabled:true}],getAudioTracks:()=>[{stop(){},kind:'audio',enabled:true,real:true}]})}};
  w.RTCPeerConnection=fakeRTC(w,log);
  w.localStorage.setItem('pyr-name',name);      // имя — до загрузки страницы, как у живого человека
  for(const f of ['i18n.js','day.js','scene.js','app.js']){
    try{ w.eval(fs.readFileSync(D+f,'utf8')); }catch(e){ log.errs.push(f+': '+e.message); }
  }
  w.localStorage.setItem('pyr-name',name);
  return {w,log,$:s=>w.document.querySelector(s),click(s){this.$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true}))}};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const room='e2e'+Date.now().toString(36);
  /* Мастер входит через пирамиду, гость — по ссылке, микрофон гостю сначала не дали,
     а часы гостя отстают на 3% — как бывает у слабых телефонов */
  const M=browser('Дмитрий',BASE+'/',{});
  M.click('[data-style="green"]');
  await wait(800);
  const G=browser('Гость55',BASE+'/?room='+M.w.location.search.split('=')[1],{denyMic:true,skew:0.03});
  G.$('#gate').classList.add('gone'); G.click('#enter');
  await wait(1500);

  ok('оба в одной комнате', M.$('#rbRole').textContent.includes('two')||M.$('#rbRole').textContent.includes('двое'), M.$('#rbRole').textContent);
  ok('у гостя без микрофона соединение всё равно собралось', G.log.pcs.length>0 && G.log.pcs[0].senders.length===1 && G.log.pcs[0].senders[0].track.silent);
  ok('у обоих голос соединился', M.log.pcs[0]&&M.log.pcs[0].iceConnectionState==='connected' && G.log.pcs[0].iceConnectionState==='connected');

  /* фонотека видит испорченные файлы */
  M.click('#libBtn'); await wait(100);
  const broken=[...M.$('#libMenu').querySelectorAll('.mi.broken')].map(x=>x.textContent);
  ok('фонотека помечает испорченные файлы', broken.length===4, broken.length+' шт.');
  M.click('#libClose');

  /* Мастер ставит настоящий mp3 */
  const full=JSON.parse(await (await fetch(BASE+'/api/tracks')).text()).find(t=>t.title==='Full Moon');
  M.w.__pyr.send({type:'select',trackId:full.id});
  await wait(2500);
  ok('Мастер скачал mp3 целиком', M.log.blobs.includes(full.size), M.log.blobs.join(',')+' из '+full.size);
  ok('гость скачал mp3 целиком', G.log.blobs.includes(full.size), G.log.blobs.join(',')+' из '+full.size);
  const mEl=[...M.log.els].find(e=>!e.id&&String(e.src).startsWith('blob')), gEl=[...G.log.els].find(e=>!e.id&&String(e.src).startsWith('blob'));
  ok('у Мастера играет', mEl&&!mEl.paused);
  ok('у гостя играет', gEl&&!gEl.paused);

  /* гость с отстающими часами: сколько раз дёргается скорость за 8 секунд */
  const rc0=G.log.rateChanges, sk0=G.log.seeks;
  await wait(8000);
  ok('у гостя правок скорости мало — не квакает', G.log.rateChanges-rc0<=4, (G.log.rateChanges-rc0)+' смен скорости, '+(G.log.seeks-sk0)+' рывков за 8 с');

  /* +15 у Мастера */
  M.click('#fwd15'); await wait(1500);
  ok('после +15 у гостя музыка не остановилась', gEl&&!gEl.paused, 'позиция '+gEl.currentTime.toFixed(1)+' с');

  /* испорченный файл: точная причина, без попытки играть */
  const lfs=JSON.parse(await (await fetch(BASE+'/api/tracks')).text()).find(t=>t.bad==='lfs');
  M.w.__pyr.send({type:'select',trackId:lfs.id});
  await wait(1200);
  const sysG=[...G.$('#chat').querySelectorAll('.bub.sys')].map(x=>x.textContent);
  ok('в чате оранжевый системный пузырь с точной причиной', sysG.some(t=>/LFS/.test(t)), sysG[0]||'');
  ok('системный пузырь подписан именем', sysG.some(t=>/^(Дмитрий|Гость55): /.test(t)));

  /* чат с именами */
  M.w.__pyr.send({type:'chat',text:'привет'}); await wait(400);
  const gThem=G.$('#chat').querySelector('.bub.them'), mMe=M.$('#chat').querySelector('.bub.me');
  ok('у гостя сообщение Мастера слева, с именем', gThem && gThem.querySelector('.who') && gThem.querySelector('.who').textContent==='Дмитрий');
  ok('у Мастера своё сообщение справа, без имени', mMe && !mMe.querySelector('.who'));

  /* гость разрешил микрофон позже — дорожка подменяется без перезвона */
  const before=G.log.pcs[0].replaced;
  await G.w.__pyr.setMic(true); await wait(300);
  ok('гость включил микрофон позже — подменилась настоящая дорожка', G.log.pcs[0].replaced>before && G.log.pcs[0].senders[0].track.real);

  /* громкость голоса: регулятор реально меняется */
  const v=M.$('#voice'); v.value=25; v.dispatchEvent(new M.w.Event('input'));
  ok('ползунок голоса задаёт громкость регулятора', M.w.__pyr.state().voiceGain===0.25);

  /* самопроверка пути голоса: собеседник говорит, а у нас тишина — переходим на обычный путь */
  M.log.remoteSilent=true;
  M.w.__pyr.setPeerSpeaking(true); await wait(2200);
  ok('при пустом звуке голос сам переключается на обычный путь', M.w.__pyr.state().voiceFallback===true && M.$('#remoteAudio').muted===false);

  ok('ошибок у Мастера нет', M.log.errs.length===0, M.log.errs.slice(0,2).join(' | '));
  ok('ошибок у гостя нет', G.log.errs.length===0, G.log.errs.slice(0,2).join(' | '));

  for(const r of results) console.log(r[0],r[1],r[2]?'— '+r[2]:'');
  console.log('\nИТОГ:',results.filter(r=>r[0]==='✓').length,'из',results.length);
  process.exit(0);
})().catch(e=>{console.log('ТЕСТ УПАЛ:',e.stack);process.exit(1)});
