import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BikeModel } from './bikemodel.js';
import { clamp } from './core.js';

export class Showroom {
  constructor(canvas) {
    this.canvas = canvas;this.angle = 1.1;this.elevation = .24;this.distance = 3.4;this.dragging = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();this.scene.background = new THREE.Color(0x171b22);
    this.camera = new THREE.PerspectiveCamera(38, 1, .03, 30);
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(room);this.scene.environment = this.env.texture;this.scene.environmentIntensity = .8;
    room.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xdceaff, 0x363039, 1));
    const key = new THREE.DirectionalLight(0xfff0dc, 3);key.position.set(2, 5, 3);key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
    key.shadow.camera.right = key.shadow.camera.top = 2.5;key.shadow.normalBias = .012;this.scene.add(key);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, .07, 80),
      new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: .72, metalness: .25 }));
    floor.position.y = -.045;floor.receiveShadow = true;this.scene.add(floor);
    canvas.addEventListener('pointerdown', e => { this.dragging = true;this.px = e.clientX;this.py = e.clientY;canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.angle -= (e.clientX - this.px) * .009;this.elevation = clamp(this.elevation + (e.clientY - this.py) * .006, -.05, .9);
      this.px = e.clientX;this.py = e.clientY;
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { this.dragging = false; });
    canvas.addEventListener('wheel', e => { e.preventDefault();this.distance = clamp(this.distance + e.deltaY * .002, 2.1, 4.6); }, { passive: false });
  }

  select(bike, { reload = false } = {}) {
    if (this.model?.cfg.id === bike.cfg.id && !reload) return;
    if (this.model) {
      this.model.cancelAssetLoad?.();
      const materials = new Set(), textures = new Set();
      this.model.root.traverse(o => { if (o.isMesh) { o.geometry.dispose();for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
      for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);m.dispose(); }for (const t of textures) t.dispose();
      this.scene.remove(this.model.root);
    }
    this.model = new BikeModel(bike.cfg);this.scene.add(this.model.root);
    const previewPose={ ...bike, pos: { x: 0, y: bike.cfg.cgHeight, z: 0 }, yaw: 0, pitch: 0, roll: 0,
      grounded:true,frontDown:true,rearDown:true,steer: 0, speed: 0, suspF: bike.restSuspF, suspR: bike.restSuspR, wheelAngleF: 0, wheelAngleR: 0 };
    this.model.update(previewPose, 1 / 60, 0);
    this.model.rider.root.visible = false;
    for (const limb of [...this.model.rider.arms, ...this.model.rider.legs]) for (const mesh of Object.values(limb)) if (mesh?.isObject3D) mesh.visible = false;
    this.model.root.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    this.distance = bike.cfg.style === 'lightbee' ? 3 : 3.5;
    this.canvas.setAttribute('aria-busy', String(this.model.assetStatus === 'loading'));
    if (this.model.assetReady) {
      const model = this.model;
      model.assetReady.then(() => {
        if (this.model !== model) return;
        this.canvas.setAttribute('aria-busy', 'false');
        // The imported rig arrives after the initial preview pose. Reapply
        // axle/suspension transforms so it does not float over the plinth.
        model.update(previewPose,1/60,0);model.rider.root.visible=false;
        for(const limb of [...model.rider.arms,...model.rider.legs])for(const mesh of Object.values(limb))if(mesh?.isObject3D)mesh.visible=false;
        document.getElementById('showroom-spec').textContent = model.assetStatus === 'ready'
          ? bike.cfg.assetCredit
          : model.assetStatus==='built-in' ? 'Private model not added in this browser · built-in bike is rideable'
          : 'Model could not load · built-in bike is rideable. Try adding the GLB again.';
        this.render(0);
      });
    }
    document.getElementById('showroom-name').textContent = bike.cfg.name;
    document.getElementById('showroom-spec').textContent = this.model.assetStatus === 'loading'
      ? 'Loading bike model…'
      : `${Math.round(bike.cfg.wheelbase * 1000)} mm wheelbase · ${Math.round(bike.cfg.seatH * 1000)} mm seat`;
    // Clear the previous bike's canvas immediately, even before the next RAF.
    this.render(0);
  }

  render(dt) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;if (!w || !h) return;
    if (w !== this.width || h !== this.height) {
      this.width = w;this.height = h;this.renderer.setSize(w, h, false);this.camera.aspect = w / h;this.camera.updateProjectionMatrix();
    }
    if (!this.dragging) this.angle += dt * .10;
    const distance = this.distance * Math.max(1, 1.16 / this.camera.aspect);
    const radius = distance * Math.cos(this.elevation);
    this.camera.position.set(Math.sin(this.angle) * radius, .57 + Math.sin(this.elevation) * distance, Math.cos(this.angle) * radius);
    this.camera.lookAt(0, .55, 0);this.renderer.render(this.scene, this.camera);
  }
}
