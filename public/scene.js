/* Трёхмерные комнаты Pyramid.
   Камень больше не рисуется на процессоре и не хранится картинками.
   Его считает видеокарта по формуле: синусоида, изогнутая шумом, плюс
   двойное искажение области — приём Перлина и Килеза. Один раз при входе
   результат запекается в небольшую текстуру: цвет в трёх каналах,
   маска прожилок в четвёртом. Отсюда и свечение под музыку — светятся
   только прожилки, свет в комнате остаётся постоянным. */
window.Scene = (function () {
  'use strict';

  var renderer = null, scene = null, camera = null, raf = null, clock = null;
  var kind = null, level = 0, target = 0, playing = false;
  var mats = {}, lights = {}, dust = null, dustSpeed = null, disc = null;
  var tgt = { x: 0, y: 0 }, smooth = { x: 0, y: 0 }, fps = 0, frames = 0, acc = 0;
  var lost = 0, builds = 0, canvasEl = null;

  function num(v, d) { return v === undefined || v === null ? d : v; }
  function hex(h) {
    return new THREE.Color(
      parseInt(h.slice(1, 3), 16) / 255,
      parseInt(h.slice(3, 5), 16) / 255,
      parseInt(h.slice(5, 7), 16) / 255);
  }

  /* ---------- гаммы камня ---------- */
  var MARBLE = {
    green: {
      ramp: ['#000704', '#010F09', '#032015', '#063422', '#0A4B33', '#116548', '#2C8A66'],
      vein: '#C9992F', veinHot: '#FFF3CE', seed: 0.0,
      fog: 0x02110A, bg: 0x010A06, ambient: 0x1A7350, amb: .5,
      key: 0xFFE6A8, accent: 0x7CF0C4, rim: 0x2FBF8E, warm: 0xE0A84A,
      veinColor: 0xE9C86E, shaft: 'rgba(255,236,180,', env: ['#F6E7B8', '#3E7A5E', '#02100A'],
      dustColor: 0xFFF4D8
    },
    gold: {
      ramp: ['#0E0800', '#231603', '#3E2A06', '#61430C', '#8A6317', '#B98A28', '#E0B85A'],
      vein: '#FFD98A', veinHot: '#FFF8DC', seed: 11.3,
      fog: 0x2A1B04, bg: 0x160D02, ambient: 0xC8913A, amb: .5,
      key: 0xFFF0C8, accent: 0xFFD98A, rim: 0xD8A340, warm: 0xFFE9B0,
      veinColor: 0xFFD98A, shaft: 'rgba(255,240,200,', env: ['#FFF6D8', '#C9992F', '#2A1B04'],
      dustColor: 0xFFF6E0
    },
    silver: {
      ramp: ['#050607', '#0C0F10', '#191E21', '#2A3134', '#3E474C', '#59646A', '#7D888F'],
      vein: '#C9D8DF', veinHot: '#FFFFFF', seed: 23.7,
      fog: 0x121618, bg: 0x080A0B, ambient: 0x7E97A3, amb: .46,
      key: 0xDCEAF2, accent: 0xBFD8E2, rim: 0x6E8A99, warm: 0xA8BCC6,
      veinColor: 0xCFE2EA, shaft: 'rgba(224,240,248,', env: ['#EAF4FA', '#5E727C', '#0A0C0D'],
      dustColor: 0xFFFFFF
    }
  };
  MARBLE.pyramid = MARBLE.green;

  /* ---------- шейдер камня ---------- */
  var MARBLE_GLSL = [
    'precision highp float;',
    'uniform vec3 uRamp[7];',
    'uniform vec3 uVein, uVeinHot;',
    'uniform float uSeed, uScale, uWarp, uFreq, uBend, uBend2, uSharp, uCut, uAmount;',
    'uniform float uDens0, uDens1, uGrain, uBandY;',
    'varying vec2 vP;',
    'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453123); }',
    'float noise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),',
    '             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y);',
    '}',
    'float fbm(vec2 p, int oct){',
    '  float v=0.0, a=0.5; mat2 m=mat2(1.62,1.18,-1.18,1.62);',
    '  for(int i=0;i<6;i++){ if(i>=oct) break; v+=a*noise(p); p=m*p; a*=0.5; }',
    '  return v;',
    '}',
    'vec3 rampAt(float u){',
    '  u=clamp(u,0.0,0.999)*6.0; vec3 c=uRamp[0];',
    '  for(int i=0;i<6;i++){ float lo=float(i);',
    '    if(u>=lo && u<lo+1.0) c=mix(uRamp[i],uRamp[i+1],u-lo); }',
    '  return c;',
    '}',
    'vec4 marble(vec2 uv){',
    '  vec2 p = uv*uScale;',
    '  float qx=fbm(p,4), qy=fbm(p+vec2(5.2,1.3),4);',
    '  float rx=fbm(p+uWarp*vec2(qx,qy)+vec2(1.7,9.2),4);',
    '  float ry=fbm(p+uWarp*vec2(qx,qy)+vec2(8.3,2.8),4);',
    '  float f=fbm(p+uWarp*vec2(rx,ry),5);',
    '  float macro=fbm(p*0.38+vec2(11.5,7.3),3);',
    '  float shade=0.45+1.25*macro;',
    '  vec3 col=rampAt(pow(max(0.0,f*1.25*shade),1.25));',
    '  col=mix(col,rampAt(qx*qy*2.4),0.35);',
    '  col=mix(col,rampAt(ry*1.6),0.25);',
    '  float band=(p.x+p.y*uBandY)*uFreq+(f-0.5)*uBend+(rx-0.5)*uBend2;',
    '  float s=sin(band);',
    '  float v=pow(1.0-abs(s),uSharp);',
    '  float s2=sin(band*0.37+2.1);',
    '  v=max(v,pow(1.0-abs(s2),uSharp*1.6)*0.9);',
    '  v*= (0.55+0.45*noise(p*uGrain));',
    '  v=max(0.0,(v-uCut)/(1.0-uCut));',
    '  float hot=pow(v,2.2);',
    '  float dens=fbm(p*0.52+vec2(31.4,17.9),3);',
    '  float dm=clamp((dens-uDens0)/(uDens1-uDens0),0.0,1.0);',
    '  float amt=uAmount*(0.12+1.35*dm*dm);',
    '  col=mix(col,uVein,min(1.0,v*amt));',
    '  col=mix(col,uVeinHot,min(1.0,hot*amt));',
    '  return vec4(col, clamp(v*amt,0.0,1.0));',
    '}'
  ].join('\n');

  function marbleUniforms(P) {
    return {
      uRamp: { value: P.ramp.map(hex) },
      uVein: { value: hex(P.vein) },
      uVeinHot: { value: hex(P.veinHot) },
      uSeed: { value: P.seed || 0 },
      uScale: { value: 3.2 }, uWarp: { value: 4.0 },
      uFreq: { value: 8.0 }, uBend: { value: 8.0 }, uBend2: { value: 5.0 },
      uSharp: { value: 2.8 }, uCut: { value: 0.28 }, uAmount: { value: 1.7 },
      uDens0: { value: 0.24 }, uDens1: { value: 0.66 },
      uGrain: { value: 60.0 }, uBandY: { value: 0.35 }
    };
  }

  /* Запекаем камень один раз в текстуру: цвет в RGB, прожилки в альфе.
     Одна текстура на комнату вместо трёх холстов — памяти в разы меньше,
     и процессор больше не замирает на полторы секунды. */
  function bake(P, size) {
    var u = marbleUniforms(P);
    var mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: 'varying vec2 vP;\nvoid main(){ vP=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: MARBLE_GLSL + '\nvoid main(){ gl_FragColor = marble(vP); }'
    });
    var rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      format: THREE.RGBAFormat, generateMipmaps: true
    });
    rt.texture.encoding = THREE.sRGBEncoding;
    var s = new THREE.Scene();
    var c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    s.add(q);
    var prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(s, c);
    renderer.setRenderTarget(prev);
    q.geometry.dispose(); mat.dispose();
    rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return rt;
  }

  /* Камень как обычный материал, но свечение берётся из альфы —
     значит под музыку вспыхивают именно прожилки, а не вся комната. */
  function stone(tex, veinColor, opts) {
    opts = opts || {};
    var m = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      metalness: num(opts.metalness, .25),
      roughness: num(opts.roughness, .55),
      emissive: new THREE.Color(veinColor),
      emissiveIntensity: 1,
      side: opts.side || THREE.FrontSide
    });
    m.userData.glow = { value: 0.35 };
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uGlow = m.userData.glow;
      sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader
        .replace('#include <map_fragment>',
          '#include <map_fragment>\n  diffuseColor.a = 1.0;')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= texture2D(map, vUv).a * uGlow;');
    };
    return m;
  }

  function environment(c) {
    try {
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
      var x = cv.getContext('2d');
      var g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, c[0]); g.addColorStop(.32, c[1]); g.addColorStop(1, c[2]);
      x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      var t = new THREE.CanvasTexture(cv);
      t.mapping = THREE.EquirectangularReflectionMapping;
      var p = new THREE.PMREMGenerator(renderer);
      scene.environment = p.fromEquirectangular(t).texture;
    } catch (e) { }
  }

  /* белая пыль — теперь во всех комнатах */
  function particles(count, radius, height, size, color, opacity) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d');
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

  function shaft(rad, h, y, rgba) {
    var c = document.createElement('canvas'); c.width = 64; c.height = 256;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, rgba + '.85)'); g.addColorStop(.5, rgba + '.18)'); g.addColorStop(1, rgba + '0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    var m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, opacity: .16,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      }));
    m.position.y = y; scene.add(m); mats.shaft = m.material;
  }

  /* Стеклянный стол с вертушкой. Золотого обода по краю больше нет —
     он читался как кольцо посреди комнаты. */
  function table(P, tex) {
    var glass = new THREE.MeshStandardMaterial({
      color: 0xBFF3E0, transparent: true, opacity: .26,
      metalness: .1, roughness: .06, envMapIntensity: 1.6
    });
    var top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, .06, 64), glass);
    top.position.y = 1.02; scene.add(top);
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(.16, .34, 1, 32), glass);
    stem.position.y = .5; scene.add(stem);

    var c = document.createElement('canvas'); c.width = c.height = 512;
    var v = c.getContext('2d');
    v.fillStyle = '#0B0E0D'; v.fillRect(0, 0, 512, 512);
    for (var r = 40; r < 250; r += 2.2) {
      v.beginPath(); v.arc(256, 256, r, 0, 6.283);
      v.strokeStyle = r % 9 < 4 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.35)';
      v.lineWidth = 1; v.stroke();
    }
    v.beginPath(); v.arc(256, 256, 84, 0, 6.283);
    var g2 = v.createRadialGradient(220, 220, 4, 256, 256, 84);
    g2.addColorStop(0, '#FFF3CF'); g2.addColorStop(.5, '#E3C878'); g2.addColorStop(1, '#8A6B18');
    v.fillStyle = g2; v.fill();
    v.beginPath(); v.arc(256, 256, 7, 0, 6.283); v.fillStyle = '#04170F'; v.fill();

    disc = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .018, 64), [
      new THREE.MeshStandardMaterial({ color: 0x0B2A20, metalness: .5, roughness: .5 }),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), metalness: .55, roughness: .28 }),
      new THREE.MeshStandardMaterial({ color: 0x08201A, metalness: .5, roughness: .6 })
    ]);
    disc.position.y = 1.06; scene.add(disc);

    var arm = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1, 10),
      new THREE.MeshStandardMaterial({ color: P.veinColor, metalness: 1, roughness: .2 }));
    arm.rotation.set(0, 0, Math.PI / 2); arm.rotation.y = -.55;
    arm.position.set(.4, 1.15, .34); scene.add(arm);
  }

  function build(P) {
    builds++;
    var wallRT = bake(P, 1536);
    mats.wall = stone(wallRT.texture, P.veinColor, { side: THREE.BackSide, metalness: .3, roughness: .5 });
    var pyr = new THREE.Mesh(new THREE.ConeGeometry(9, 12, 4, 24, true), mats.wall);
    pyr.rotation.y = Math.PI / 4; pyr.position.y = 6; scene.add(pyr);
    mats.wallRT = wallRT;

    var floorRT = bake(P, 768);
    floorRT.texture.repeat.set(2, 2);
    mats.floor = stone(floorRT.texture, P.veinColor, { metalness: .6, roughness: .3 });
    var floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), mats.floor);
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    mats.floorRT = floorRT;

    lights.key = new THREE.PointLight(P.key, 15, 26, 2);
    lights.key.position.set(0, 8.4, 0); scene.add(lights.key);
    lights.accent = new THREE.PointLight(P.accent, 5, 10, 2);
    lights.accent.position.set(0, 1.9, .4); scene.add(lights.accent);
    var rim = new THREE.PointLight(P.rim, 6, 20, 2); rim.position.set(-6, 2.4, -5); scene.add(rim);
    var warm = new THREE.PointLight(P.warm, 5, 18, 2); warm.position.set(6, 3.2, -4); scene.add(warm);

    shaft(2.6, 8.4, 4.4, P.shaft);
    table(P, wallRT.texture);
    dust = particles(340, 8, 8, .055, P.dustColor, .75);
    environment(P.env);
    camera.position.set(0, 1.75, 4.6);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    var dt = Math.min(clock.getDelta(), .05), t = clock.getElapsedTime();
    level += (target - level) * Math.min(1, dt * 9);
    var L = level;

    /* под музыку меняется только свечение прожилок */
    if (mats.wall) mats.wall.userData.glow.value = 0.18 + L * 3.4;
    if (mats.floor) mats.floor.userData.glow.value = 0.06 + L * 1.0;
    if (mats.shaft) mats.shaft.opacity = .06 + L * .3;
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
    camera.position.y = 1.75 + smooth.y * -.6 + Math.sin(t * .24) * .06;
    camera.lookAt(0, 1.25, 0);

    renderer.render(scene, camera);
    frames++; acc += dt;
    if (acc > 1) { fps = Math.round(frames / acc); frames = 0; acc = 0; }
  }

  function onMove(e) { tgt.x = e.clientX / innerWidth - .5; tgt.y = e.clientY / innerHeight - .5; }
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
  function onLost(e) { e.preventDefault(); lost++; }
  function onRestored() { if (kind && canvasEl) api.enter(kind, canvasEl); }

  var api = {
    supported: function () {
      try { return !!window.THREE && !!document.createElement('canvas').getContext('webgl'); }
      catch (e) { return false; }
    },
    /* картинка камня для логотипа и главной страницы — печём тем же шейдером */
    image: function (which, w, h) {
      var P = MARBLE[which] || MARBLE.green, own = false, r = renderer;
      try {
        if (!r) { r = new THREE.WebGLRenderer({ antialias: false }); own = true; renderer = r; }
        var u = marbleUniforms(P);
        var mat = new THREE.ShaderMaterial({
          uniforms: u,
          vertexShader: 'varying vec2 vP;\nvoid main(){ vP=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
          fragmentShader: MARBLE_GLSL + '\nvoid main(){ vec4 m=marble(vP); gl_FragColor=vec4(m.rgb,1.0); }'
        });
        var rt = new THREE.WebGLRenderTarget(w, h);
        var s = new THREE.Scene(), c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); s.add(q);
        r.setRenderTarget(rt); r.render(s, c); 
        var buf = new Uint8Array(w * h * 4);
        r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        r.setRenderTarget(null);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
        // видеокарта отдаёт снизу вверх — переворачиваем
        for (var y = 0; y < h; y++) {
          var src = (h - 1 - y) * w * 4, dst = y * w * 4;
          for (var i = 0; i < w * 4; i++) img.data[dst + i] = buf[src + i];
        }
        ctx.putImageData(img, 0, 0);
        q.geometry.dispose(); mat.dispose(); rt.dispose();
        if (own) { r.dispose(); renderer = null; }
        return cv;
      } catch (e) { if (own) { try { r.dispose(); } catch (e2) { } renderer = null; } return null; }
    },
    enter: function (which, canvas) {
      this.dispose();
      if (!window.THREE) return false;
      kind = MARBLE[which] ? which : 'green';
      canvasEl = canvas;
      var P = MARBLE[kind];
      try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); }
      catch (e) { return false; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(P.bg);
      scene.fog = new THREE.FogExp2(P.fog, .038);
      camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 200);
      scene.add(new THREE.AmbientLight(P.ambient, P.amb));

      mats = {}; lights = {}; dust = null; disc = null;
      build(P);

      clock = new THREE.Clock();
      onResize();
      addEventListener('resize', onResize);
      addEventListener('pointermove', onMove);
      if (window.DeviceOrientationEvent) addEventListener('deviceorientation', onTilt);
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);
      loop();
      return true;
    },
    setLevel: function (v) { target = Math.max(0, Math.min(1, v || 0)); },
    setPlaying: function (b) { playing = !!b; },
    level: function () { return level; },
    fps: function () { return fps; },
    kind: function () { return kind; },
    stats: function () { return { lost: lost, builds: builds }; },
    dispose: function () {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      removeEventListener('deviceorientation', onTilt);
      if (canvasEl) {
        canvasEl.removeEventListener('webglcontextlost', onLost);
        canvasEl.removeEventListener('webglcontextrestored', onRestored);
      }
      if (mats.wallRT) mats.wallRT.dispose();
      if (mats.floorRT) mats.floorRT.dispose();
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
      renderer = null; scene = null; camera = null; mats = {}; lights = {}; dust = null; disc = null;
    }
  };
  return api;
})();
