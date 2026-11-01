import * as THREE from '../vendor/three.module.min.js';
import { makeBumpCanvas } from './textures.js';

/**
 * HeroMoon — 右侧的大月亮。
 * 使用真实月面纹理 + 平行光，通过光照方位精确复现月相；
 * 月面保持潮汐锁定，仅以极缓慢的天平动保持呼吸感。
 */
export class HeroMoon {
  constructor(canvas) {
    this.canvas = canvas;
    this.size = 640;
    this.angle = 0;
    this.pointer = { x: 0, y: 0 };
    this.parallax = { x: 0, y: 0 };
    this.spriteURL = null;
    this.time = 0;
  }

  async init() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(this.size, this.size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0, 4.45);
    this.camera = camera;

    const loader = new THREE.TextureLoader();
    const map = await loader.loadAsync('assets/textures/moon.jpg');
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.map = map;

    const bump = new THREE.CanvasTexture(makeBumpCanvas(map.image, 1024, 512));
    bump.wrapS = THREE.RepeatWrapping;
    this.bump = bump;

    const material = new THREE.MeshStandardMaterial({
      map,
      color: 0xfff4e6,
      bumpMap: bump,
      bumpScale: 0.032,
      roughness: 1,
      metalness: 0,
    });
    this.material = material;

    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 96), material);
    moon.rotation.y = -Math.PI / 2;
    this.moon = moon;
    scene.add(moon);

    // 极薄的菲涅尔边缘光，让暗侧的轮廓不至于消失在背景里
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.004, 128, 80),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0xffe4bd) },
          uIntensity: { value: 0.3 },
        },
        vertexShader: `
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.4);
            gl_FragColor = vec4(uColor, rim * uIntensity);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    scene.add(rim);

    const sun = new THREE.DirectionalLight(0xfff2dc, 4.0);
    sun.position.set(0, 0, 10);
    this.sun = sun;
    scene.add(sun);

    const earthshine = new THREE.DirectionalLight(0x5c7fbb, 0.5);
    earthshine.position.set(0.3, 0.2, 1);
    scene.add(earthshine);

    scene.add(new THREE.AmbientLight(0x22314d, 0.4));

    // 一次性的满月渲染，作为日历中迷你月亮的贴图
    this.setLightAlpha(0);
    this.renderer.render(scene, camera);
    this.spriteURL = renderer.domElement.toDataURL('image/png');
  }

  setLightAlpha(alpha) {
    const r = 10;
    this.sun.position.set(Math.sin(alpha) * r, 1.1, Math.cos(alpha) * r);
  }

  setPhase(angleDeg) {
    this.angle = angleDeg;
    const alpha = Math.PI - (angleDeg * Math.PI) / 180;
    this.setLightAlpha(alpha);
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  render(dt) {
    this.time += dt;
    const p = this.parallax;
    p.x += (this.pointer.x - p.x) * Math.min(1, dt * 6);
    p.y += (this.pointer.y - p.y) * Math.min(1, dt * 6);

    // 极轻微的天平动，而不是自转 —— 月球始终以同一面朝向地球
    this.moon.rotation.y = -Math.PI / 2 + Math.sin(this.time * 0.055) * 0.05;
    this.moon.rotation.x = 0.035 + Math.sin(this.time * 0.037) * 0.018;

    this.camera.position.x = p.x * 0.1;
    this.camera.position.y = p.y * 0.07;
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
