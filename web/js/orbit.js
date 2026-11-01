import * as THREE from '../vendor/three.module.min.js';
import { makeBumpCanvas, radialGlowCanvas } from './textures.js';

const DEG = Math.PI / 180;
const ORBIT_RADIUS = 17;
const MOON_RADIUS = 1.45;
const EARTH_RADIUS = 3.75;
const SUN_DIR = new THREE.Vector3(-1, 0.11, 0.07).normalize();

/**
 * OrbitScene — 左侧的地月轨道三维场景。
 * 阳光固定从 -X 方向照来，月球位置由月相角决定，因此
 * 轨道视角中的明暗与右侧月面、以及天文计算始终保持一致。
 */
export class OrbitScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.stage = canvas.parentElement;
    this.phase = 0;
    this.t = 0;
    this.az = -0.98;
    this.pol = 0.55;
    this.dist = 45;
    this.targetAz = this.az;
    this.targetPol = this.pol;
    this.targetDist = this.dist;
    this.autoRotate = true;
    this.dragging = false;
    this.lastPointer = null;
    this.idleSince = 0;
    this.labels = {
      earth: document.getElementById('labelEarth'),
      moon: document.getElementById('labelMoon'),
    };
    this.sunEdge = document.getElementById('sunEdge');
    this._bind();
  }

  async init() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
    this.camera = camera;

    scene.add(new THREE.AmbientLight(0x2a4666, 0.9));

    const sunLight = new THREE.DirectionalLight(0xfff1d8, 4.6);
    sunLight.position.copy(SUN_DIR).multiplyScalar(120);
    this.sunLight = sunLight;
    scene.add(sunLight);

    this._buildStars();
    await this._buildEarth();
    await this._buildMoon();
    this._buildOrbit();

    this.resize();
    this._updateCamera(0, true);
  }

  _buildStars() {
    const count = 3400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const r = 90 + Math.random() * 140;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.75;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const warm = Math.random() < 0.18;
      const hue = warm ? 0.09 + Math.random() * 0.04 : 0.56 + Math.random() * 0.08;
      const sat = warm ? 0.35 : 0.18 + Math.random() * 0.3;
      c.setHSL(hue, sat, 0.72 + Math.random() * 0.24);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      sizes[i] = Math.random() < 0.05 ? 3.4 + Math.random() * 3 : 0.9 + Math.random() * 1.6;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = aColor;
          vTwinkle = 0.55 + 0.45 * sin(uTime * 0.9 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (300.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.02, d);
          gl_FragColor = vec4(vColor, a * a * vTwinkle);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geo, mat);
    this.stars = stars;
    this.starMat = mat;
    this.scene.add(stars);
  }

  async _buildEarth() {
    const loader = new THREE.TextureLoader();
    const [day, clouds, specular] = await Promise.all([
      loader.loadAsync('assets/textures/earth_day.jpg'),
      loader.loadAsync('assets/textures/earth_clouds.png'),
      loader.loadAsync('assets/textures/earth_specular.jpg'),
    ]);
    for (const t of [day, clouds]) t.colorSpace = THREE.SRGBColorSpace;
    specular.colorSpace = THREE.NoColorSpace;
    for (const t of [day, clouds, specular]) {
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    }

    const group = new THREE.Group();
    group.rotation.z = -23.4 * DEG;
    this.earthGroup = group;

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 128, 96),
      new THREE.MeshPhongMaterial({
        map: day,
        specularMap: specular,
        specular: new THREE.Color(0x243a58),
        shininess: 26,
        emissive: new THREE.Color(0x02050c),
        emissiveIntensity: 1,
      })
    );
    earth.rotation.y = 2.9;
    this.earth = earth;
    group.add(earth);

    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.014, 96, 72),
      new THREE.MeshPhongMaterial({
        map: clouds,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        color: 0xdfe9ff,
        specular: new THREE.Color(0x0a1220),
        shininess: 4,
      })
    );
    cloudMesh.rotation.y = 3.25;
    this.clouds = cloudMesh;
    group.add(cloudMesh);

    // 柔和的边缘辉光：贴近球体、快速衰减，避免形成一圈“气泡”
    const glowTex = new THREE.CanvasTexture(
      radialGlowCanvas(256, [
        [0, 'rgba(160,200,255,0.85)'],
        [0.12, 'rgba(110,160,255,0.28)'],
        [0.26, 'rgba(70,120,230,0.06)'],
        [0.45, 'rgba(0,0,0,0)'],
        [1, 'rgba(0,0,0,0)'],
      ])
    );
    const atmosphere = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x6fa4ff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.45,
      })
    );
    atmosphere.scale.setScalar(EARTH_RADIUS * 2.2);
    group.add(atmosphere);

    this.scene.add(group);
  }

  async _buildMoon() {
    const loader = new THREE.TextureLoader();
    const map = await loader.loadAsync('assets/textures/moon.jpg');
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    const bump = new THREE.CanvasTexture(makeBumpCanvas(map.image, 1024, 512));
    bump.wrapS = THREE.RepeatWrapping;

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS, 96, 72),
      new THREE.MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 0.02,
        roughness: 1,
        metalness: 0,
      })
    );
    this.moon = moon;

    const orbitGroup = new THREE.Group();
    orbitGroup.rotation.x = 5.1 * DEG;
    this.orbitGroup = orbitGroup;
    orbitGroup.add(moon);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(radialGlowCanvas(256)),
        color: 0xffe0b0,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.4,
      })
    );
    glow.scale.setScalar(3.6);
    this.moonGlow = glow;
    orbitGroup.add(glow);

    this.scene.add(orbitGroup);
  }

  _buildOrbit() {
    const group = this.orbitGroup;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ORBIT_RADIUS, 0.024, 6, 360),
      new THREE.MeshBasicMaterial({
        color: 0x9fc4ff,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.ring = ring;

    const maxPts = 320;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3));
    trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(maxPts), 1));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd6a0) } },
      vertexShader: `
        attribute float aAlpha;
        varying float vA;
        void main() {
          vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          gl_FragColor = vec4(uColor, vA);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    this.trail = trail;
    this.trailGeo = trailGeo;
    group.add(trail);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineDashedMaterial({
        color: 0x9fc4ff,
        transparent: true,
        opacity: 0.22,
        dashSize: 0.55,
        gapSize: 0.45,
        depthWrite: false,
      })
    );
    this.earthMoonLine = line;
    this.scene.add(line);
  }

  setPhase(deg) {
    this.phase = ((deg % 360) + 360) % 360;
  }

  setView(name) {
    if (name === 'top') {
      this.targetPol = 1.02;
      this.targetAz = -0.98;
      this.targetDist = 46;
    } else {
      this.targetPol = 0.55;
      this.targetAz = -0.98;
      this.targetDist = 45;
    }
  }

  resetView() {
    this.targetAz = -0.98;
    this.targetPol = 0.55;
    this.targetDist = 45;
  }

  setAutoRotate(on) {
    this.autoRotate = on;
  }

  _bind() {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      this.idleSince = performance.now();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.lastPointer) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.targetAz -= dx * 0.0052;
      this.targetPol = Math.min(1.34, Math.max(0.1, this.targetPol + dy * 0.0036));
      this.idleSince = performance.now();
    });
    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.lastPointer = null;
      this.idleSince = performance.now();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetDist = Math.min(88, Math.max(26, this.targetDist * Math.exp(e.deltaY * 0.0011)));
      },
      { passive: false }
    );
    canvas.addEventListener('dblclick', () => this.resetView());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resize() {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
  }

  _updateCamera(dt, immediate = false) {
    if (this.autoRotate && !this.dragging) {
      const idle = performance.now() - this.idleSince;
      if (idle > 2200) this.targetAz += dt * 0.018;
    }
    const k = immediate ? 1 : 1 - Math.exp(-dt * 7);
    this.az += (this.targetAz - this.az) * k;
    this.pol += (this.targetPol - this.pol) * k;
    this.dist += (this.targetDist - this.dist) * k;

    const cp = Math.cos(this.pol);
    const sp = Math.sin(this.pol);
    this.camera.position.set(
      this.dist * cp * Math.sin(this.az),
      this.dist * sp,
      this.dist * cp * Math.cos(this.az)
    );
    this.camera.lookAt(0, 0, 0);
  }

  _updateOrbit() {
    const a = this.phase * DEG;
    const x = -ORBIT_RADIUS * Math.cos(a);
    const z = ORBIT_RADIUS * Math.sin(a);

    this.moon.position.set(x, 0, z);
    this.moon.rotation.y = a;
    this.moonGlow.position.set(x, 0, z);
    const illum = (1 - Math.cos(a)) / 2;
    this.moonGlow.material.opacity = 0.1 + illum * 0.46;
    this.moonGlow.scale.setScalar(3.0 + illum * 2.1);

    // 行进轨迹：从新月位置到月球当前位置，越靠近月球越亮
    const n = Math.max(2, Math.round((this.phase / 360) * 300));
    const pos = this.trailGeo.attributes.position.array;
    const alpha = this.trailGeo.attributes.aAlpha.array;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ang = t * this.phase * DEG;
      pos[i * 3] = -ORBIT_RADIUS * Math.cos(ang);
      pos[i * 3 + 1] = 0.02;
      pos[i * 3 + 2] = ORBIT_RADIUS * Math.sin(ang);
      alpha[i] = 0.04 + Math.pow(t, 1.35) * 0.86;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.aAlpha.needsUpdate = true;
    this.trailGeo.setDrawRange(0, n);

    // 地月连线
    const moonWorld = new THREE.Vector3();
    this.moon.getWorldPosition(moonWorld);
    const dir = moonWorld.clone().normalize();
    const p0 = dir.clone().multiplyScalar(EARTH_RADIUS * 1.02);
    const p1 = moonWorld.clone().sub(dir.multiplyScalar(MOON_RADIUS * 1.05));
    const attr = this.earthMoonLine.geometry.attributes.position;
    attr.setXYZ(0, p0.x, p0.y, p0.z);
    attr.setXYZ(1, p1.x, p1.y, p1.z);
    attr.needsUpdate = true;
    this.earthMoonLine.computeLineDistances();

    return moonWorld;
  }

  update(dt) {
    this.t += dt;
    this._updateCamera(dt);
    const moonWorld = this._updateOrbit();

    this.starMat.uniforms.uTime.value = this.t;

    this.earth.rotation.y += dt * 0.018;
    this.clouds.rotation.y += dt * 0.023;

    this.renderer.render(this.scene, this.camera);
    this._updateLabels(moonWorld);
    this._updateSunIndicator();
  }

  _updateSunIndicator() {
    if (!this.sunEdge) return;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).negate();

    const dx = SUN_DIR.dot(right);
    const dy = -SUN_DIR.dot(up);
    const len = Math.hypot(dx, dy);
    if (len < 0.02) {
      this.sunEdge.style.opacity = '0';
      return;
    }

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const margin = 12;
    let x;
    let y;

    // 选择太阳在屏幕上更偏向的那条边，并把高光限制在边中段，
    // 避免落进圆角死角，同时保留方向感。
    if (Math.abs(dx) >= Math.abs(dy) * 0.55) {
      x = halfW + Math.sign(dx) * (halfW - margin);
      const offset = (dy / Math.max(1e-4, Math.abs(dx))) * halfW;
      y = Math.min(this.height * 0.72, Math.max(this.height * 0.28, halfH + offset));
    } else {
      y = halfH + Math.sign(dy) * (halfH - margin);
      const offset = (dx / Math.max(1e-4, Math.abs(dy))) * halfH;
      x = Math.min(this.width * 0.72, Math.max(this.width * 0.28, halfW + offset));
    }

    const facing = Math.max(0, SUN_DIR.dot(forward));
    this.sunEdge.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    this.sunEdge.style.opacity = String(0.5 + facing * 0.5);
  }

  _updateLabels(moonWorld) {
    const project = (v) => {
      const p = v.clone().project(this.camera);
      return {
        x: (p.x * 0.5 + 0.5) * this.width,
        y: (-p.y * 0.5 + 0.5) * this.height,
        visible: p.z < 1 && p.z > -1,
      };
    };

    const pxPerUnit = this.height / 2 / (this.dist * Math.tan((this.camera.fov * DEG) / 2));
    if (this.labels.earth) {
      const p = project(new THREE.Vector3(0, 0, 0));
      const onScreen = p.x > -80 && p.x < this.width + 80 && p.y > -80 && p.y < this.height + 80;
      const offset = EARTH_RADIUS * pxPerUnit + 8;
      this.labels.earth.style.transform = `translate3d(${p.x}px, ${p.y + offset}px, 0) translate(-50%, 0)`;
      this.labels.earth.style.opacity = p.visible && onScreen ? '1' : '0';
    }
    if (this.labels.moon) {
      const p = project(moonWorld);
      const onScreen = p.x > -80 && p.x < this.width + 80 && p.y > -80 && p.y < this.height + 80;
      const offset = MOON_RADIUS * pxPerUnit + 10;
      this.labels.moon.style.transform = `translate3d(${p.x}px, ${p.y - offset}px, 0) translate(-50%, -100%)`;
      this.labels.moon.style.opacity = p.visible && onScreen ? '1' : '0';
    }
  }
}
