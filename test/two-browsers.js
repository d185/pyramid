const {JSDOM}=require('jsdom'); const fs=require('fs');
const WS=require('../node_modules/ws');
const D=__dirname+'/../public/', PORT=+process.argv[2], MP=process.argv[3]||'android', GP=process.argv[4]||'android';
const BASE='http://localhost:'+PORT;
const { MPEGDecoder } = require('mpg123-decoder');
function resample(c, from, to){ if(from===to) return c; const n=Math.floor(c.length*to/from), o=new Float32Array(n), r=from/to;
  for(let i=0;i<n;i++){ const x=i*r, a=Math.floor(x), f=x-a; o[i]=(c[a]||0)*(1-f)+(c[a+1]||0)*f; } return o; }
const results=[]; const ok=(name,cond,extra)=>{results.push([cond?'✓':'✗',name,extra||'']);};

/* --- поддельный звонок: два участника обмениваются описаниями через настоящий сервер --- */
function fakeRTC(w,log){ /* log задаётся ниже */
  return function(){
    const pc={senders:[],local:null,remote:null,iceConnectionState:'new',signalingState:'stable',replaced:0};
    pc.addTrack=(track,stream)=>{const s={track,replaceTrack(t){this.track=t;pc.replaced++;return Promise.resolve()},getParameters(){return {encodings:[{}]}},setParameters(){return Promise.resolve()}};
      pc.senders.push(s);pc._stream=stream;setTimeout(()=>pc.onnegotiationneeded&&pc.onnegotiationneeded(),5);return s;};
    pc.getSenders=()=>pc.senders;
    pc.setLocalDescription=async(d)=>{const type=d&&d.type||(pc.remote&&pc.remote.type==='offer'?'answer':'offer');
      if(type==='rollback'){pc.local=null;pc.signalingState='stable';return;}
      pc.local={type,sdp:(d&&d.sdp)||'fake'};pc.localDescription=pc.local;pc.signalingState=type==='offer'?'have-local-offer':'stable';
      setTimeout(()=>pc.onicecandidate&&pc.onicecandidate({candidate:{candidate:'c',sdpMid:'0'}}),5);
      if(type==='answer') connect();};
    pc.createOffer=async()=>({type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n'});
    pc.createAnswer=async()=>({type:'answer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n'});
    pc.setRemoteDescription=async(d)=>{pc.remote=d;pc.remoteDescription=d;if(d.type==='answer'){pc.signalingState='stable';connect();}};
    pc.addIceCandidate=async()=>{};pc.restartIce=()=>{};pc.close=()=>{pc.iceConnectionState='closed'};
    pc.getStats=async()=>({forEach(f){ f({type:'inbound-rtp',kind:'audio',audioLevel:log.remoteTalking?0.2:0,packetsReceived:(log.rx=(log.rx||0)+50)}); f({type:'media-source',kind:'audio',audioLevel:0.08}); }});
    function connect(){ if(pc.iceConnectionState==='connected')return; pc.iceConnectionState='connected';
      const track={kind:'audio',enabled:true}; const stream={getAudioTracks:()=>[track],getTracks:()=>[track],id:'remote',isRemote:true};
      setTimeout(()=>{ pc.ontrack&&pc.ontrack({streams:[stream],track}); },5);
      setTimeout(()=>{ pc.oniceconnectionstatechange&&pc.oniceconnectionstatechange(); },15);
      setTimeout(()=>{ track.onunmute&&track.onunmute(); },60);}
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
  const IOS=opts.platform==='ios';
  log.gesture=false; log.capturing=false; log.remoteTalking=false; log.ctxs=[];
  /* ПРАВИЛА АЙФОНА:
     1) движок, созданный до включения микрофона, получает голоса пустыми;
     2) движок без касания спит, если микрофон не включён; разбудить можно только касанием;
     3) громкость звукового элемента заблокирована на 1. */
  w.AudioContext=function(){
    const ctx={destination:{},sampleRate:48000,beforeMic:!log.capturing,_t0:performance.now(),outputLatency:0,
      state:(!IOS||log.gesture||log.capturing)?'running':'suspended'};
    Object.defineProperty(ctx,'currentTime',{get(){return (performance.now()-ctx._t0)/1000}});
    /* настоящая расшифровка mp3 с пересчётом частоты, как в телефоне */
    ctx.decodeAudioData=(ab,ok,err)=>{ const p=(async()=>{ const d=new MPEGDecoder(); await d.ready;
        const r=d.decode(new Uint8Array(ab)); d.free(); if(!r.samplesDecoded) throw new Error('decode');
        const ch=r.channelData.map(c=>resample(c,r.sampleRate,ctx.sampleRate));
        log.decodes=(log.decodes||0)+1;
        return {numberOfChannels:ch.length,length:ch[0].length,sampleRate:ctx.sampleRate,duration:ch[0].length/ctx.sampleRate,getChannelData:i=>ch[i]}; })();
      if(ok) p.then(ok,err||(()=>{})); return p; };
    ctx.createBufferSource=()=>{ const src={buffer:null,onended:null,connect(x){return x},disconnect(){},
        start(when,off){this.when=when;this.off=off;log.starts=(log.starts||0)+1;}, stop(){}}; return src; };
    log.ctxs.push(ctx);
    const node=(extra)=>Object.assign({connect(x){if(x&&x._an)x._src=this;return x},disconnect(){}},extra||{});
    ctx.createGain=()=>node({gain:{value:1,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){}}});
    ctx.createAnalyser=()=>({_an:true,fftSize:512,smoothingTimeConstant:0,connect(){},disconnect(){},
      getByteTimeDomainData(a){ const src=this._src;
        let loud=false;
        if(src&&src._stream){ loud = !(IOS&&ctx.beforeMic) && (src._stream.isRemote ? (log.remoteTalking && !log.deafWebAudio) : true) && ctx.state==='running'; }
        else loud = ctx.state==='running';
        a.fill(loud?150:128); }});
    ctx.createMediaElementSource=()=>node();
    ctx.createMediaStreamSource=s=>node({_stream:s,mediaStream:s});
    ctx.createMediaStreamDestination=()=>({stream:{getAudioTracks:()=>[{kind:'audio',silent:true,enabled:true}]}});
    ctx.createOscillator=()=>node({start(){}});
    ctx.resume=()=>{ if(!IOS||log.gesture||log.capturing) ctx.state='running'; return Promise.resolve(); };
    ctx.suspend=()=>{ctx.state='suspended';return Promise.resolve()};
    return ctx;
  };
  if(IOS){ Object.defineProperty(w.HTMLMediaElement.prototype,'volume',{get(){return 1},set(){},configurable:true});
    w.navigator.audioSession={type:'auto'}; }
  w.navigator.mediaDevices={getUserMedia:()=>{log.micReq++;
    if(opts.denyMic&&log.micReq===1)return Promise.reject(Object.assign(new Error('no'),{name:'NotAllowedError'}));
    return new Promise(r=>setTimeout(()=>{ log.capturing=true;
      r({getTracks:()=>[{stop(){},kind:'audio',enabled:true}],getAudioTracks:()=>[{stop(){},kind:'audio',enabled:true,real:true}]}) },30))}};
  w.RTCPeerConnection=fakeRTC(w,log);
  w.localStorage.setItem('pyr-name',name);      // имя — до загрузки страницы, как у живого человека
  for(const f of ['i18n.js','day.js','scene.js','chunker.js','app.js']){
    try{ w.eval(fs.readFileSync(D+f,'utf8')); }catch(e){ log.errs.push(f+': '+e.message); }
  }
  w.localStorage.setItem('pyr-name',name);
  return {w,log,$:s=>w.document.querySelector(s),click(s){log.gesture=true;try{this.$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true}))}finally{setTimeout(()=>log.gesture=false,0)}}};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const room='e2e'+Date.now().toString(36);
  /* Мастер входит через пирамиду, гость — по ссылке, микрофон гостю сначала не дали,
     а часы гостя отстают на 3% — как бывает у слабых телефонов */
  const M=browser('Дмитрий',BASE+'/',{platform:MP});
  M.click('[data-style="green"]');
  await wait(800);
  const G=browser('Гость55',BASE+'/?room='+M.w.location.search.split('=')[1],{denyMic:true,skew:0.03,platform:GP});
  G.$('#gate').classList.add('gone'); G.click('#enter');
  await wait(1500);

  ok('оба в одной комнате', M.$('#rbRole').textContent.includes('two')||M.$('#rbRole').textContent.includes('двое'), M.$('#rbRole').textContent);
  ok('у гостя без микрофона соединение всё равно собралось', G.log.pcs.length>0 && G.log.pcs[0].senders.length===1 && G.log.pcs[0].senders[0].track.silent);
  ok('в описании соединения включено восстановление пакетов', M.log.pcs.some(p=>p.local&&/useinbandfec=1/.test(p.local.sdp)&&/maxaveragebitrate=32000/.test(p.local.sdp)));
  ok('у обоих голос соединился', M.log.pcs.some(p=>p.iceConnectionState==='connected') && G.log.pcs.some(p=>p.iceConnectionState==='connected'));

  /* фонотека видит испорченные файлы */
  M.click('#libBtn'); await wait(100);
  const broken=[...M.$('#libMenu').querySelectorAll('.mi.broken')].map(x=>x.textContent);
  ok('фонотека помечает испорченные файлы', broken.length===4, broken.length+' шт.');
  M.click('#libClose');

  /* Мастер ставит длинный трек — 75 с, четыре куска по 20 с */
  const all=JSON.parse(await (await fetch(BASE+'/api/tracks')).text());
  const long=all.find(t=>t.title==='Long Track');
  M.w.__pyr.send({type:'select',trackId:long.id});
  await wait(4000);
  ok('у Мастера трек готов и играет кусками', M.w.__pyr.state().playing && M.w.__pyr.state().sched>=1, 'кусков в памяти '+M.w.__pyr.state().chunks);
  ok('у гостя трек готов и играет кусками', G.w.__pyr.state().playing && G.w.__pyr.state().sched>=1, 'кусков в памяти '+G.w.__pyr.state().chunks);

  /* перемотка к самому стыку: с 14-й секунды до перехода на второй кусок — 6 секунд */
  M.w.__pyr.send({type:'seek',offset:14});
  await wait(9000);
  const seam=(P)=>{ const st=P.w.__pyr.state(), it=st.schedInfo, sr=st.sr;
    const a=it.find(x=>x.k===0), b=it.find(x=>x.k===1);
    if(!a||!b) return null;
    // где был первый кусок в момент, когда вступил второй
    return Math.abs((a.from + (b.start-a.start)*sr) - b.from)/sr*1000; };
  const sM=seam(M), sG=seam(G);
  ok('у Мастера стык кусков без сдвига', sM!==null && sM<2, sM===null?'стыка не было':sM.toFixed(2)+' мс, совпадение звука '+(M.w.__pyr.state().lastScore||0).toFixed(3));
  ok('у гостя стык кусков без сдвига', sG!==null && sG<2, sG===null?'стыка не было':sG.toFixed(2)+' мс, совпадение звука '+(G.w.__pyr.state().lastScore||0).toFixed(3));
  const dM=M.w.__pyr.state(), dG=G.w.__pyr.state();
  ok('Мастер и гость звучат синхронно', Math.abs(dM.musicPos-dG.musicPos)<0.03, 'разница '+Math.abs(dM.musicPos-dG.musicPos).toFixed(3)+' с, позиция '+dM.musicPos.toFixed(1)+' с');
  ok('у гостя без рывков и подстроек скорости', dG.hardResyncs===0 && G.log.rateChanges===0, 'рывков '+dG.hardResyncs+', смен скорости '+G.log.rateChanges);
  ok('в памяти не больше трёх кусков', dM.chunks<=3 && dG.chunks<=3, dM.chunks+' и '+dG.chunks);

  /* +15 у Мастера — прыжок через кусок */
  M.click('#fwd15'); await wait(2500);
  ok('после +15 у гостя музыка играет дальше', G.w.__pyr.state().playing && G.w.__pyr.state().musicPos>30, 'позиция '+G.w.__pyr.state().musicPos.toFixed(1)+' с');

  /* ВТОРОЙ ТРЕК, пока играет первый — так и сломалось у пользователя */
  const second=all.find(t=>t.title==='Full Moon');
  M.w.__pyr.send({type:'select',trackId:second.id});
  await wait(3500);
  ok('второй трек у Мастера заиграл', M.w.__pyr.state().playing && M.w.__pyr.state().sched>=1, 'ошибок '+M.log.errs.length+' '+M.log.errs.slice(0,1));
  ok('второй трек у гостя заиграл', G.w.__pyr.state().playing && G.w.__pyr.state().sched>=1, 'ошибок '+G.log.errs.length+' '+G.log.errs.slice(0,1));
  /* пауза, снова играть, обратно на первый трек, перемотка */
  M.click('#pause'); await wait(600); M.click('#play'); await wait(1500);
  ok('пауза и продолжение на втором треке', M.w.__pyr.state().playing && G.w.__pyr.state().playing);
  M.w.__pyr.send({type:'select',trackId:long.id}); await wait(3500);
  M.click('#fwd15'); await wait(1500);
  ok('обратно на первый трек и +15 — играет у обоих', M.w.__pyr.state().playing && G.w.__pyr.state().playing && G.w.__pyr.state().musicPos>10, 'позиция '+G.w.__pyr.state().musicPos.toFixed(1));
  ok('ошибок за всё это время нет', M.log.errs.length===0 && G.log.errs.length===0, (M.log.errs.concat(G.log.errs)).slice(0,3).join(' | '));

  /* РОЛЬ МАСТЕРА: связь Мастера рвётся (ушёл в Сообщения отправить приглашение) и возвращается */
  const roleM0=M.$('#rbRole').textContent;
  M.w.__pyr.closeSocket();
  await wait(4500);
  ok('Мастер после обрыва связи снова Мастер', /Master|Мастер/.test(M.$('#rbRole').textContent) && !/Guest|Гость/i.test(M.$('#rbRole').textContent.split('·')[0]), M.$('#rbRole').textContent);
  ok('гость при этом остался гостем', /^You are a Guest|^Вы гость/.test(G.$('#rbRole').textContent), G.$('#rbRole').textContent);

  /* ПРИЗРАК: третий участник подключился и замолчал — трек всё равно должен стартовать */
  const ghost=new WS(BASE.replace('http','ws'));
  await new Promise(r=>{ghost.on('open',()=>{ghost.send(JSON.stringify({type:'hello',room:room,name:'Призрак'}));setTimeout(r,300)})});
  const t1=Date.now();
  M.w.__pyr.send({type:'select',trackId:all.find(t=>t.title==='Утро').id});
  let started=false; for(let i=0;i<40;i++){ await wait(500); if(M.w.__pyr.state().playing){started=true;break;} }
  ok('с призраком в комнате трек всё равно стартовал', started, 'через '+((Date.now()-t1)/1000).toFixed(1)+' с');
  ghost.terminate();

  /* ВТОРОЙ ТРЕК ПОСЛЕ КОНЦА ПЕРВОГО: короткий трек доигрывает до конца, потом выбираем следующий */
  await wait(13000);   // «Утро» — 12 с
  ok('первый трек дошёл до конца', !M.w.__pyr.state().playing);
  M.w.__pyr.send({type:'select',trackId:all.find(t=>t.title==='Full Moon').id});
  await wait(3500);
  ok('следующий трек после конца первого заиграл у обоих', M.w.__pyr.state().playing && G.w.__pyr.state().playing);

  /* ДЛИННЫЙ ТРЕК: 4 минуты, 4,8 МБ — стартует сразу, докачивается фоном не спеша */
  const big=all.find(t=>t.title==='Big Track');
  const t2=Date.now();
  M.w.__pyr.send({type:'select',trackId:big.id});
  let bigStarted=false; for(let i=0;i<20;i++){ await wait(500); if(G.w.__pyr.state().playing){bigStarted=true;break;} }
  const dlG=G.w.__pyr.state().download;
  ok('длинный трек стартовал, не дожидаясь полной загрузки', bigStarted && dlG<100, 'старт через '+((Date.now()-t2)/1000).toFixed(1)+' с, скачано '+dlG+'%');
  await wait(12000);
  const s2=G.w.__pyr.state();
  ok('через 12 с играет дальше, докачка идёт фоном', s2.playing && s2.download>dlG, 'скачано '+s2.download+'%, кусок '+(s2.schedInfo.length?s2.schedInfo[s2.schedInfo.length-1].k+1:'?'));

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
  const gpc=G.log.pcs[G.log.pcs.length-1], before=gpc.replaced;
  await G.w.__pyr.setMic(true); await wait(300);
  ok('гость включил микрофон позже — подменилась настоящая дорожка', gpc.replaced>before && gpc.senders[0].track.real);

  /* звуковой движок и свой микрофон */
  const ms=M.w.__pyr.state(), gs=G.w.__pyr.state();
  ok('у Мастера звуковой движок работает', ms.actxState==='running', ms.actxState);
  if(MP==='ios') ok('айфону сказано, что это звонок', ms.audioSession==='play-and-record', ms.audioSession);
  ok('у гостя звуковой движок работает', gs.actxState==='running', gs.actxState);
  await wait(400);
  ok('у Мастера свой микрофон слышен, не 0%', M.w.__pyr.state().selfLevel>0.01, (M.w.__pyr.state().selfLevel*300).toFixed(0)+'%');

  /* голос: сначала звучит обычный элемент (слышно всегда), на свой регулятор — когда движок услышал живой звук */
  ok('пока никто не говорил, голос Мастера у гостя идёт элементом и слышен', G.w.__pyr.state().voiceRoute==='element' && G.w.__pyr.state().muted===false, G.w.__pyr.state().voiceRoute+', элемент '+(G.w.__pyr.state().muted?'немой':'звучит'));
  M.log.remoteTalking=true; G.log.remoteTalking=true;
  await wait(1800);
  ok('у Мастера голос гостя ушёл на свой регулятор, элемент немой', M.w.__pyr.state().voiceRoute==='gain' && M.w.__pyr.state().muted===true, M.w.__pyr.state().voiceRoute);
  ok('у гостя голос Мастера ушёл на свой регулятор', G.w.__pyr.state().voiceRoute==='gain' && G.w.__pyr.state().muted===true, G.w.__pyr.state().voiceRoute);
  const v=M.$('#voice'); v.value=25; v.dispatchEvent(new M.w.Event('input'));
  ok('ползунок голоса у Мастера меняет громкость', Math.abs(M.w.__pyr.state().voiceGain-Math.pow(0.25,1.5))<1e-9);
  const v2=G.$('#voice'); v2.value=40; v2.dispatchEvent(new G.w.Event('input'));
  ok('ползунок голоса у гостя меняет громкость', Math.abs(G.w.__pyr.state().voiceGain-Math.pow(0.4,1.5))<1e-9);
  /* запасной путь: движок у гостя оглох, а пакеты идут и собеседник говорит — через 3 с голос идёт элементом */
  G.log.deafWebAudio=true; await wait(4200);
  ok('движок оглох — у гостя голос сам ушёл на обычный путь, звук включён', G.w.__pyr.state().voiceRoute==='element' && G.w.__pyr.state().muted===false, G.w.__pyr.state().voiceRoute);

  ok('ошибок у Мастера нет', M.log.errs.length===0, M.log.errs.slice(0,2).join(' | '));
  ok('ошибок у гостя нет', G.log.errs.length===0, G.log.errs.slice(0,2).join(' | '));

  console.log('Мастер —',MP,'| гость —',GP);
  for(const r of results) console.log(r[0],r[1],r[2]?'— '+r[2]:'');
  console.log('\nИТОГ:',results.filter(r=>r[0]==='✓').length,'из',results.length);
  process.exit(0);
})().catch(e=>{console.log('ТЕСТ УПАЛ:',e.stack);process.exit(1)});
