/* Трёхмерные комнаты Pyramid.
   Один движок на три комнаты: меняются геометрия, палитра камня и свет.
   Наружу торчат четыре ручки: enter, setLevel, setPlaying, dispose.
   setLevel принимает громкость музыки от 0 до 1 — от неё разгораются прожилки. */
window.Scene = (function () {
  'use strict';

  var renderer = null, scene = null, camera = null, raf = null, clock = null;
  var kind = null, alive = false, level = 0, target = 0, playing = false;
  var mats = {}, lights = {}, extras = [], dust = null, dustSpeed = null, disc = null;
  var tgt = { x: 0, y: 0 }, smooth = { x: 0, y: 0 }, fps = 0, frames = 0, acc = 0;

  /* ноль — это значение, а не «не задано»: без этой проверки в саду
     когда-то вырастали золотые прожилки, которых там быть не должно */
  function num(v, d) { return v === undefined || v === null ? d : v; }

  function rngFactory(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(W,H){var c=document.createElement('canvas');c.width=W;c.height=H;return c}
  function hexRGB(c){c=c.replace('#','');return [parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)]}
  function rampAt(stops,u){
  u=u-Math.floor(u);
  var n=stops.length-1,i=Math.min(n-1,Math.floor(u*n)),t=u*n-i,a=stops[i],b=stops[i+1];
  return 'rgb('+Math.round(a[0]+(b[0]-a[0])*t)+','+Math.round(a[1]+(b[1]-a[1])*t)+','+Math.round(a[2]+(b[2]-a[2])*t)+')';
  }

  /* тонкие трещины: ветвящиеся линии */
  function genCracks(seed,W,H,count,base){
  var rnd=rngFactory(seed),paths=[];
  function grow(x,y,a,steps,w,depth){
    var pts=[[x,y]];
    for(var s=0;s<steps;s++){
      a+=(rnd()-.5)*.55;
      x+=Math.cos(a)*(W/170+rnd()*W/95);
      y+=Math.sin(a)*(W/170+rnd()*W/95);
      pts.push([x,y]);
    }
    paths.push({pts:pts,w:w});
    if(depth<2){
      var br=1+Math.floor(rnd()*2);
      for(var b=0;b<br;b++){
        var k=Math.floor(rnd()*Math.max(1,pts.length-4))+2;
        if(pts[k])grow(pts[k][0],pts[k][1],a+(rnd()-.5)*2.4,Math.floor(steps*(.25+rnd()*.4)),w*(.5+rnd()*.3),depth+1);
      }
    }
  }
  for(var i=0;i<count;i++)grow(rnd()*W,rnd()*H,rnd()*6.283,36+Math.floor(rnd()*70),base,0);
  return paths;
  }
  function drawPaths(ctx,paths,alpha,mul,color){
  ctx.save();ctx.lineCap='round';ctx.globalAlpha=alpha;ctx.strokeStyle=color;
  for(var i=0;i<paths.length;i++){
    var p=paths[i].pts;if(p.length<3)continue;
    ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);
    for(var j=1;j<p.length-1;j++){
      var mx=(p[j][0]+p[j+1][0])/2,my=(p[j][1]+p[j+1][1])/2;
      ctx.quadraticCurveTo(p[j][0],p[j][1],mx,my);
    }
    ctx.lineWidth=Math.max(.4,paths[i].w*mul);ctx.stroke();
  }
  ctx.restore();
  }

  /* золотые потоки: зернистая пыль вдоль блуждающего русла */
  function goldOps(seed,W,H,rivers,clump){
  clump=num(clump,.045);
  var rnd=rngFactory(seed),ops=[],clumps=[],glow=[];
  for(var r=0;r<rivers;r++){
    var x=rnd()*W,y=rnd()*H,a=rnd()*6.283;
    var steps=170+Math.floor(rnd()*200),scale=.6+rnd()*.9;
    for(var s=0;s<steps;s++){
      a+=(rnd()-.5)*.55;
      var st=W/260+rnd()*W/180;
      x+=Math.cos(a)*st;y+=Math.sin(a)*st;
      if(x<-W*.06||x>W*1.06||y<-H*.06||y>H*1.06)a+=3.14*(.6+rnd()*.8);
      var core=(W*.0028+rnd()*W*.0045)*scale,i,dd,aa;
      if(s%7===0)glow.push([x,y,W*.018*scale]);
      var k=6+Math.floor(rnd()*10);
      for(i=0;i<k;i++){
        dd=Math.pow(rnd(),1.6)*core*2.2;aa=rnd()*6.283;
        ops.push([x+Math.cos(aa)*dd,y+Math.sin(aa)*dd,(.32+rnd()*1.05)*scale,rnd()]);
      }
      var sp=3+Math.floor(rnd()*7);
      for(i=0;i<sp;i++){
        dd=core*2+Math.pow(rnd(),2.6)*W*.042*scale;aa=rnd()*6.283;
        ops.push([x+Math.cos(aa)*dd,y+Math.sin(aa)*dd,(.28+rnd()*.75)*scale,rnd()]);
      }
      if(rnd()<clump){
        var n=26+Math.floor(rnd()*44),ca=Math.cos(a),sa=Math.sin(a);
        var rx=core*(3.5+rnd()*3.5),ry=core*(1+rnd()*1.6);
        for(i=0;i<n;i++){
          var u=(rnd()*2-1),v=(rnd()*2-1);
          if(u*u+v*v>1)continue;
          var px=u*rx,py=v*ry;
          clumps.push([x+ca*px-sa*py,y+sa*px+ca*py,(.5+rnd()*1.5)*scale,rnd()]);
        }
      }
    }
  }
  return {ops:ops,clumps:clumps,glow:glow};
  }
  var GOLD=['#FFF7D8','#F7E09C','#E6C263','#CFA23A','#A87C20','#77590F'];
  var SILVER=['#FFFFFF','#EDF3F6','#CBD6DB','#A3AFB5','#77828A','#4C555B'];
  function paintGold(ctx,g,mode,pal,glow){
  pal=pal||GOLD; glow=glow||'214,168,60';
  var i,o,grd;
  if(mode!=='metal'){
    for(i=0;i<g.glow.length;i++){
      o=g.glow[i];
      grd=ctx.createRadialGradient(o[0],o[1],0,o[0],o[1],o[2]);
      if(mode==='color'){grd.addColorStop(0,'rgba('+glow+',.22)');grd.addColorStop(1,'rgba('+glow+',0)')}
      else{grd.addColorStop(0,'rgba(150,110,30,.35)');grd.addColorStop(1,'rgba(0,0,0,0)')}
      ctx.fillStyle=grd;ctx.beginPath();ctx.arc(o[0],o[1],o[2],0,6.283);ctx.fill();
    }
  }
  var all=g.clumps.concat(g.ops);
  for(i=0;i<all.length;i++){
    o=all[i];
    if(mode==='color')ctx.fillStyle=pal[Math.floor(o[3]*pal.length)];
    else if(mode==='em')ctx.fillStyle=o[3]<.45?pal[1]:pal[4];
    else ctx.fillStyle=o[3]<.7?'#ffffff':'#b4b4b4';
    ctx.beginPath();ctx.arc(o[0],o[1],o[2],0,6.283);ctx.fill();
  }
  }

  /* марблинг: вложенные текучие слои камня */
  function marbleSet(W,H,seed,P){
  var rnd=rngFactory(seed+11);
  var color=makeCanvas(W,H),cx=color.getContext('2d');
  var stops=P.ramp.map(hexRGB);
  cx.fillStyle=P.base;cx.fillRect(0,0,W,H);

  function bandPts(x0,y0,ang,len,amps,frq,phs,off,n){
    var pts=[],ca=Math.cos(ang),sa=Math.sin(ang);
    for(var i=0;i<=n;i++){
      var t=i/n,d=off,k;
      for(k=0;k<amps.length;k++)d+=amps[k]*Math.sin(frq[k]*t*6.283+phs[k]);
      var px=(t-.5)*len,py=d;
      pts.push([x0+ca*px-sa*py,y0+sa*px+ca*py]);
    }
    return pts;
  }
  function strokePts(ctx,pts,w,col,al){
    ctx.globalAlpha=al;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
    for(var j=1;j<pts.length-1;j++){
      var mx=(pts[j][0]+pts[j+1][0])/2,my=(pts[j][1]+pts[j+1][1])/2;
      ctx.quadraticCurveTo(pts[j][0],pts[j][1],mx,my);
    }
    ctx.stroke();ctx.globalAlpha=1;
  }

  function band(cfg){
    var ang=(rnd()<.5?-1:1)*(.25+rnd()*.9);
    var x0=rnd()*W,y0=rnd()*H,len=W*(1.6+rnd()*1.3);
    var amps=[W*(.03+rnd()*.09),W*(.012+rnd()*.04),W*(.004+rnd()*.016)];
    var frq=[.45+rnd()*.8,1.3+rnd()*1.7,2.8+rnd()*3.4];
    var phs=[rnd()*6.283,rnd()*6.283,rnd()*6.283];
    var thick=W*cfg.t0+W*cfg.t1*rnd(),step=cfg.s0+rnd()*cfg.s1;
    var layers=Math.max(10,Math.round(thick/step));
    var u0=rnd(),span=cfg.span*(.5+rnd()),inv=rnd()<.45;
    for(var i=0;i<layers;i++){
      var v=i/(layers-1);
      var u=u0+(inv?1-v:v)*span;
      var col=rampAt(stops,u),off=(v-.5)*thick;
      var fade=Math.pow(Math.sin(Math.PI*v),.45);
      var pts=bandPts(x0,y0,ang,len,[amps[0]*(1+(v-.5)*.4),amps[1]*(1+(v-.5)*.8),amps[2]],frq,phs,off,80);
      strokePts(cx,pts,step*3.6,col,(cfg.a0+rnd()*cfg.a1)*fade);
      if(rnd()<cfg.hair)strokePts(cx,pts,.8,P.hair,(.18+rnd()*.28)*fade);
    }
  }
  function eddy(){
    var ex0=rnd()*W,ey0=rnd()*H,R=W*(.09+rnd()*.16),rings=Math.round(R/(1+rnd()*1.6));
    var h=[[.18+rnd()*.3,2+Math.floor(rnd()*3),rnd()*6.283],
           [.10+rnd()*.16,3+Math.floor(rnd()*4),rnd()*6.283],
           [.05+rnd()*.08,6+Math.floor(rnd()*5),rnd()*6.283]];
    var u0=rnd(),span=.5+rnd()*.8,sq=.6+rnd()*.7,rot=rnd()*6.283;
    for(var i=0;i<rings;i++){
      var f=(i+1)/rings,pts=[],n=90;
      for(var j=0;j<=n;j++){
        var th=j/n*6.283,rr=R*f;
        for(var k=0;k<3;k++)rr*=1+h[k][0]*Math.sin(h[k][1]*th+h[k][2])*(0.4+f*0.6);
        var px=Math.cos(th)*rr,py=Math.sin(th)*rr*sq;
        pts.push([ex0+Math.cos(rot)*px-Math.sin(rot)*py, ey0+Math.sin(rot)*px+Math.cos(rot)*py]);
      }
      var col=rampAt(stops,u0+f*span);
      strokePts(cx,pts,1.6+rnd()*1.6,col,.14+rnd()*.2);
    }
  }

  function mass(){
    var mx0=rnd()*W,my0=rnd()*H,R=W*(.12+rnd()*.30);
    var h=[[.25+rnd()*.35,2+Math.floor(rnd()*3),rnd()*6.283],
           [.12+rnd()*.2,4+Math.floor(rnd()*4),rnd()*6.283]];
    var pts=[],n=110;
    for(var j=0;j<=n;j++){
      var th=j/n*6.283,rr=R;
      for(var k=0;k<2;k++)rr*=1+h[k][0]*Math.sin(h[k][1]*th+h[k][2]);
      pts.push([mx0+Math.cos(th)*rr,my0+Math.sin(th)*rr*(.5+rnd()*.0+.7)]);
    }
    var dark=rnd()<.70;
    var col=rampAt(stops,dark?rnd()*.13:.70+rnd()*.30);
    cx.save();cx.filter='blur('+Math.round(W/55)+'px)';
    cx.globalAlpha=dark?.42+rnd()*.30:.10+rnd()*.14;cx.fillStyle=col;
    cx.beginPath();cx.moveTo(pts[0][0],pts[0][1]);
    for(var i2=1;i2<pts.length;i2++)cx.lineTo(pts[i2][0],pts[i2][1]);
    cx.closePath();cx.fill();cx.restore();cx.globalAlpha=1;
  }

  var b;
  for(b=0;b<(num(P.masses,13));b++)mass();
  for(b=0;b<(num(P.wash,7));b++)band({t0:.20,t1:.30,s0:2.6,s1:2.0,a0:.07,a1:.10,span:.6,hair:.02});
  for(b=0;b<(num(P.bands,16));b++)band({t0:.04,t1:.14,s0:.8,s1:1.1,a0:.13,a1:.20,span:.85,hair:.03});
  for(b=0;b<(num(P.eddies,5));b++)eddy();

  /* размягчение, чтобы слои слились как в заливке */
  var tmp=makeCanvas(W,H);tmp.getContext('2d').drawImage(color,0,0);
  cx.save();cx.filter='blur('+Math.max(2,Math.round(W/400))+'px)';cx.globalAlpha=.66;
  cx.drawImage(tmp,0,0);cx.restore();cx.globalAlpha=1;

  for(b=0;b<(num(P.sharp,3));b++)band({t0:.02,t1:.06,s0:.6,s1:.6,a0:.14,a1:.16,span:1.0,hair:.07});

  for(b=0;b<Math.round((num(P.masses,13))*.45);b++)mass();

  /* тёмные и светлые волосяные трещины */
  drawPaths(cx,genCracks(seed+3,W,H,Math.round(W/150),.8),.28,1,P.crack);
  drawPaths(cx,genCracks(seed+8,W,H,Math.round(W/260),.7),.16,1,P.hair);

  cx.save();cx.filter='blur('+Math.round(W/40)+'px)';
  for(b=0;b<num(P.shade,5);b++){
    var sx0=rnd()*W,sy0=rnd()*H,sr=W*(.16+rnd()*.30);
    var sg=cx.createRadialGradient(sx0,sy0,0,sx0,sy0,sr);
    sg.addColorStop(0,'rgba('+(P.shadeRGB||'0,10,6')+','+(.16+rnd()*.24).toFixed(2)+')');
    sg.addColorStop(1,'rgba('+(P.shadeRGB||'0,10,6')+',0)');
    cx.fillStyle=sg;cx.beginPath();cx.arc(sx0,sy0,sr,0,6.283);cx.fill();
  }
  cx.restore();

  for(b=0;b<(num(P.ripples,6));b++)band({t0:.025,t1:.06,s0:.7,s1:.8,a0:.09,a1:.13,span:.32,hair:.06});
  for(b=0;b<3;b++)eddy();

  /* золото */
  var rivers=num(P.rivers,5), pal=P.vein||GOLD, glow=P.glow||'214,168,60';
  var g=goldOps(seed+21,W,H,rivers,P.clump);
  var gcr=genCracks(seed+31,W,H,Math.round(W/420),.75);
  if(rivers){
    paintGold(cx,g,'color',pal,glow);
    drawPaths(cx,gcr,.5,1,pal[3]);
    drawPaths(cx,gcr,.32,.45,pal[0]);
  }

  var em=makeCanvas(W,H),ex=em.getContext('2d');
  ex.fillStyle='#000';ex.fillRect(0,0,W,H);
  if(rivers){
    paintGold(ex,g,'em',pal,glow);
    drawPaths(ex,gcr,.6,1,pal[4]);
    drawPaths(ex,gcr,.45,.45,pal[1]);
  }

  var mt=makeCanvas(W,H),mx=mt.getContext('2d');
  mx.fillStyle='#000';mx.fillRect(0,0,W,H);
  if(rivers){
    paintGold(mx,g,'metal',pal,glow);
    drawPaths(mx,gcr,.75,1,'#d2d2d2');
  }

  return {color:color,emissive:em,metal:mt};
  }
  /* ---------- три пирамиды, три гаммы ---------- */
  var SILVER = ['#FFFFFF', '#EDF3F6', '#CBD6DB', '#A3AFB5', '#77828A', '#4C555B'];

  var PALETTE = {
    green: {
      wall: { base: '#052A1B', ramp: ['#01100A', '#04251A', '#0A4732', '#12704F', '#1F9A6C', '#63C39F', '#BCE4D0'],
              hair: '#DCF0E6', crack: '#010D08', bands: 17, rivers: 11, masses: 15, ripples: 8, clump: .075, shade: 5 },
      floor: { base: '#03190F', ramp: ['#000704', '#02150D', '#062E1E', '#0B4832', '#116348', '#2F7D60'],
               hair: '#9FC5B3', crack: '#000502', bands: 11, rivers: 5, masses: 9, ripples: 4, clump: .05 },
      fog: 0x02110A, bg: 0x010A06, ambient: 0x1A7350, amb: .5,
      key: 0xFFE6A8, accent: 0x7CF0C4, rim: 0x2FBF8E, warm: 0xE0A84A,
      veinColor: 0xE9C86E, shaftRGB: 'rgba(255,236,180,', env: ['#F6E7B8', '#3E7A5E', '#02100A'], dust: 0
    },
    gold: {
      wall: { base: '#4A3208', ramp: ['#140C01', '#332004', '#6B4A0D', '#A9761A', '#D9A63A', '#F2CE72', '#FFF3CE'],
              hair: '#FFF6DC', crack: '#180E01', bands: 15, rivers: 9, masses: 13, ripples: 8, clump: .06, shade: 5 },
      floor: { base: '#2A1B04', ramp: ['#0C0700', '#221503', '#4A3208', '#7A5510', '#B2842A', '#E0BA5E'],
               hair: '#F3DEA8', crack: '#0E0800', bands: 9, rivers: 4, masses: 8, ripples: 4 },
      fog: 0x2A1B04, bg: 0x160D02, ambient: 0xC8913A, amb: .5,
      key: 0xFFF0C8, accent: 0xFFD98A, rim: 0xD8A340, warm: 0xFFE9B0,
      veinColor: 0xFFD98A, shaftRGB: 'rgba(255,240,200,', env: ['#FFF6D8', '#C9992F', '#2A1B04'], dust: 420
    },
    silver: {
      wall: { base: '#2B3033', ramp: ['#0B0E0F', '#1B1F22', '#333A3E', '#4E575C', '#717B81', '#AAB4B9', '#E2E8EB'],
              hair: '#FFFFFF', crack: '#080A0B', bands: 16, rivers: 10, masses: 14, ripples: 8, clump: .07, shade: 5,
              vein: SILVER, glow: '200,215,222', shadeRGB: '4,6,8' },
      floor: { base: '#1A1E20', ramp: ['#050607', '#101314', '#22282B', '#363E42', '#525B60', '#7E888D'],
               hair: '#C8D2D7', crack: '#040506', bands: 10, rivers: 4, masses: 9, ripples: 4,
               vein: SILVER, glow: '200,215,222', shadeRGB: '3,4,5' },
      fog: 0x121618, bg: 0x080A0B, ambient: 0x7E97A3, amb: .46,
      key: 0xDCEAF2, accent: 0xBFD8E2, rim: 0x6E8A99, warm: 0xA8BCC6,
      veinColor: 0xCFE2EA, shaftRGB: 'rgba(224,240,248,', env: ['#EAF4FA', '#5E727C', '#0A0C0D'], dust: 260
    }
  };
  PALETTE.pyramid = PALETTE.green;   // старое имя комнаты продолжает работать

  function tex(canvas, rx, ry) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  function stoneMaterial(set, rx, ry, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      map: tex(set.color, rx, ry),
      emissiveMap: tex(set.emissive, rx, ry),
      metalnessMap: tex(set.metal, rx, ry),
      emissive: new THREE.Color(o.emissive === undefined ? 0xE9C86E : o.emissive),
      emissiveIntensity: o.ei === undefined ? .6 : o.ei,
      metalness: 1,
      roughness: o.rough === undefined ? .46 : o.rough,
      side: o.side || THREE.FrontSide
    });
  }

  function environment(c) {
    try {
      var cv = makeCanvas(512, 256), x = cv.getContext('2d');
      var g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, c[0]); g.addColorStop(.32, c[1]); g.addColorStop(1, c[2]);
      x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      var t = new THREE.CanvasTexture(cv);
      t.mapping = THREE.EquirectangularReflectionMapping;
      var p = new THREE.PMREMGenerator(renderer);
      scene.environment = p.fromEquirectangular(t).texture;
    } catch (e) { }
  }

  function particles(count, radius, height, size, color, opacity) {
    var c = makeCanvas(64, 64), x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.35, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    var pos = new Float32Array(count * 3);
    dustSpeed = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * 6.283, r = Math.random() * radius;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * height;
      pos[i * 3 + 2] = Math.sin(a) * r;
      dustSpeed[i] = .06 + Math.random() * .2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var p = new THREE.Points(geo, new THREE.PointsMaterial({
      size: size, map: new THREE.CanvasTexture(c), color: color,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: opacity
    }));
    p.userData.height = height;
    scene.add(p);
    return p;
  }

  function vinylTexture(P) {
    var c = makeCanvas(512, 512), v = c.getContext('2d');
    v.fillStyle = '#0B0E0D'; v.fillRect(0, 0, 512, 512);
    for (var r = 40; r < 250; r += 2.2) {
      v.beginPath(); v.arc(256, 256, r, 0, 6.283);
      v.strokeStyle = r % 9 < 4 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.35)';
      v.lineWidth = 1; v.stroke();
    }
    var lg = v.createRadialGradient(200, 190, 0, 256, 256, 120);
    lg.addColorStop(0, 'rgba(220,255,245,.2)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    v.fillStyle = lg; v.beginPath(); v.arc(256, 256, 250, 0, 6.283); v.fill();
    var pal = P.wall.vein || GOLD;
    v.beginPath(); v.arc(256, 256, 86, 0, 6.283);
    var g2 = v.createRadialGradient(220, 220, 4, 256, 256, 86);
    g2.addColorStop(0, pal[0]); g2.addColorStop(.5, pal[2]); g2.addColorStop(1, pal[4]);
    v.fillStyle = g2; v.fill();
    v.beginPath(); v.arc(256, 256, 7, 0, 6.283); v.fillStyle = '#04170F'; v.fill();
    return c;
  }

  /* Одна пирамида на три комнаты: разница только в камне и свете. */
  function buildPyramid(P) {
    var wall = marbleSet(2048, 2048, P.seed || 1234, P.wall);
    mats.wall = stoneMaterial(wall, 1, 1, { ei: .35, emissive: P.veinColor, side: THREE.BackSide });
    var pyr = new THREE.Mesh(new THREE.ConeGeometry(9, 12, 4, 24, true), mats.wall);
    pyr.rotation.y = Math.PI / 4; pyr.position.y = 6; scene.add(pyr);

    var flr = marbleSet(1024, 1024, (P.seed || 1234) + 646, P.floor);
    mats.floor = stoneMaterial(flr, 2, 2, { emissive: P.veinColor, ei: .1, rough: .26 });
    var floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), mats.floor);
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    lights.key = new THREE.PointLight(P.key, 12, 26, 2);
    lights.key.position.set(0, 8.4, 0); scene.add(lights.key);
    lights.accent = new THREE.PointLight(P.accent, 4, 9, 2);
    lights.accent.position.set(0, 1.9, .4); scene.add(lights.accent);
    var rim = new THREE.PointLight(P.rim, 6, 20, 2); rim.position.set(-6, 2.4, -5); scene.add(rim);
    var warm = new THREE.PointLight(P.warm, 5, 18, 2); warm.position.set(6, 3.2, -4); scene.add(warm);

    shaft(2.6, 8.4, 4.4, P.shaftRGB);
    table(P);
    if (P.dust) dust = particles(P.dust, 8, 8, .055, P.veinColor, .8);
    environment(P.env);
    camera.position.set(0, 1.75, 4.6);
  }

  /* общий световой луч сверху */
  function shaft(rad, h, y, rgba) {
    var c = makeCanvas(64, 256), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, rgba + '.85)'); g.addColorStop(.5, rgba + '.18)'); g.addColorStop(1, rgba + '0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    var m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, opacity: .2,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      }));
    m.position.y = y; scene.add(m); mats.shaft = m.material;
  }

  /* стеклянный стол с вертушкой — только в пирамиде */
  function table(P) {
    var glass = new THREE.MeshStandardMaterial({
      color: 0xBFF3E0, transparent: true, opacity: .28, metalness: .1, roughness: .06, envMapIntensity: 1.6
    });
    var top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, .07, 64), glass);
    top.position.y = 1.02; scene.add(top);
    var edge = new THREE.Mesh(new THREE.TorusGeometry(1.35, .035, 12, 64),
      new THREE.MeshStandardMaterial({ color: P.veinColor, metalness: 1, roughness: .22 }));
    edge.rotation.x = Math.PI / 2; edge.position.y = 1.02; scene.add(edge);
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(.16, .34, 1, 32), glass);
    stem.position.y = .5; scene.add(stem);

    disc = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .018, 64), [
      new THREE.MeshStandardMaterial({ color: 0x0B2A20, metalness: .5, roughness: .5 }),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(vinylTexture(P)), metalness: .55, roughness: .28 }),
      new THREE.MeshStandardMaterial({ color: 0x08201A, metalness: .5, roughness: .6 })
    ]);
    disc.position.y = 1.07; scene.add(disc);

    var arm = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.05, 12),
      new THREE.MeshStandardMaterial({ color: P.veinColor, metalness: 1, roughness: .2 }));
    arm.rotation.set(0, 0, Math.PI / 2); arm.rotation.y = -.55;
    arm.position.set(.42, 1.16, .36); scene.add(arm);
    var pivot = new THREE.Mesh(new THREE.SphereGeometry(.09, 20, 16),
      new THREE.MeshStandardMaterial({ color: P.veinColor, metalness: 1, roughness: .25 }));
    pivot.position.set(.88, 1.14, .62); scene.add(pivot);
  }

  /* ---------- цикл ---------- */
  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    var dt = Math.min(clock.getDelta(), .05), t = clock.getElapsedTime();

    // громкость подтягивается плавно: рывки в свете выглядят дёшево
    level += (target - level) * Math.min(1, dt * 9);
    var L = level;

    /* Размах нарочно большой: в тишине прожилки почти гаснут,
       на громком месте вспыхивают. Иначе реакции не видно вообще. */
    if (mats.wall) mats.wall.emissiveIntensity = .10 + L * 3.6;
    if (mats.floor) mats.floor.emissiveIntensity = .04 + L * 1.1;
    if (mats.shaft) mats.shaft.opacity = .04 + L * .42;
    if (lights.key) lights.key.intensity = 7 + L * 30;
    if (lights.accent) lights.accent.intensity = 2.2 + L * 10;
    if (disc && playing) disc.rotation.y += dt * 1.9;

    if (dust) {
      var p = dust.geometry.attributes.position.array, H = dust.userData.height;
      for (var j = 0; j < dustSpeed.length; j++) {
        p[j * 3 + 1] += dustSpeed[j] * dt * (.4 + L);
        p[j * 3] += Math.sin(t * .3 + j) * dt * .04;
        if (p[j * 3 + 1] > H) p[j * 3 + 1] = -.2;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }

    smooth.x += (tgt.x - smooth.x) * .05;
    smooth.y += (tgt.y - smooth.y) * .05;
    camera.position.x = smooth.x * -1.4 + Math.sin(t * .18) * .12;
    camera.position.y = camera.userData.baseY + smooth.y * -.6 + Math.sin(t * .24) * .06;
    camera.lookAt(0, camera.userData.lookY, 0);

    renderer.render(scene, camera);
    frames++; acc += dt;
    if (acc > 1) { fps = Math.round(frames / acc); frames = 0; acc = 0; }
  }

  function onMove(e) {
    tgt.x = e.clientX / innerWidth - .5;
    tgt.y = e.clientY / innerHeight - .5;
  }
  function onTilt(e) {
    if (e.gamma == null) return;
    tgt.x = Math.max(-1, Math.min(1, e.gamma / 45));
    tgt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 50));
  }
  function onResize() {
    if (!renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }

  return {
    _marble: marbleSet,
    supported: function () {
      try { return !!window.THREE && !!document.createElement('canvas').getContext('webgl'); }
      catch (e) { return false; }
    },
    enter: function (which, canvas) {
      this.dispose();
      if (!window.THREE) return false;
      kind = PALETTE[which] ? which : 'green';
      var P = PALETTE[kind];
      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      } catch (e) { return false; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(P.bg);
      scene.fog = new THREE.FogExp2(P.fog, .038);
      camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 200);
      scene.add(new THREE.AmbientLight(P.ambient, P.amb || .46));

      mats = {}; lights = {}; extras = []; dust = null; disc = null;
      P.seed = { green: 1234, gold: 4321, silver: 8080 }[kind] || 1234;
      buildPyramid(P);

      camera.userData.baseY = camera.position.y;
      camera.userData.lookY = 1.25;
      clock = new THREE.Clock();
      alive = true;
      onResize();
      addEventListener('resize', onResize);
      addEventListener('pointermove', onMove);
      if (window.DeviceOrientationEvent) addEventListener('deviceorientation', onTilt);
      loop();
      return true;
    },
    setLevel: function (v) { target = Math.max(0, Math.min(1, v || 0)); },
    setPlaying: function (b) { playing = !!b; },
    fps: function () { return fps; },
    level: function () { return level; },
    kind: function () { return kind; },
    dispose: function () {
      if (raf) cancelAnimationFrame(raf);
      raf = null; alive = false;
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      removeEventListener('deviceorientation', onTilt);
      if (scene) scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        var m = o.material;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach(function (mm) {
          for (var k in mm) if (mm[k] && mm[k].isTexture) mm[k].dispose();
          mm.dispose();
        });
      });
      if (renderer) renderer.dispose();
      renderer = null; scene = null; camera = null; mats = {}; lights = {}; extras = []; dust = null; disc = null;
    }
  };
})();
