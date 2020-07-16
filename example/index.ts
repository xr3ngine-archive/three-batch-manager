import {
  TextureLoader,
  MeshBasicMaterial,
  PlaneBufferGeometry,
  Mesh,
  DoubleSide,
  AnimationMixer,
  WebGLRenderer,
  Scene,
  PCFSoftShadowMap,
  AmbientLight,
  PerspectiveCamera,
  Clock,
  DirectionalLight,
  Texture,
  AxesHelper,
  Color
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { BatchManager } from "../src/index";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("webgl2", { antialias: true });

const renderer = new WebGLRenderer({ canvas, context });
renderer.debug.checkShaderErrors = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = PCFSoftShadowMap;

const scene = new Scene();

scene.add(new AmbientLight(0x404040));

const directionalLight = new DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 10, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.bias = -0.00025;
scene.add(directionalLight);

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3.42, 3.4, 2.38);
camera.lookAt(0, 0, 0);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

const batchManager = new BatchManager(scene, renderer);

const mixers: AnimationMixer[] = [];

function loadGLTF(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) =>
    new GLTFLoader().load(url, resolve, undefined, () => reject(new Error(`Failed to load glTF: "${url}"`)))
  );
}

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) =>
    new TextureLoader().load(url, resolve, undefined, () => reject(new Error(`Failed to load image: "${url}"`)))
  );
}

let lastFrame = 0;
const nonBatchedColor = new Color().setRGB(Math.random() * 10, Math.random() * 10, Math.random() * 10);
const nonBatchedMatrials: MeshBasicMaterial[] = [];

function addImage(texture: Texture) {
  const imageGeometry = new PlaneBufferGeometry();
  const imageMaterial = new MeshBasicMaterial({ map: texture });
  imageMaterial.side = DoubleSide;
  const imageMesh = new Mesh(imageGeometry, imageMaterial);
  scene.add(imageMesh);

  if (!batchManager.addMesh(imageMesh)) {
    const material = imageMesh.material as MeshBasicMaterial;
    nonBatchedMatrials.push(material);
  }

  return imageMesh;
}

function addGlTF(gltf: GLTF) {
  scene.add(gltf.scene);

  gltf.scene.traverse((object: any) => {
    if (object.isMesh) {
      if (!batchManager.addMesh(object)) {
        if (Array.isArray(object.material)) {
          for (const material of object.material) {
            nonBatchedMatrials.push(material);
          }
        } else {
          nonBatchedMatrials.push(object.material);
        }
      }
    }
  });

  if (gltf.animations && gltf.animations.length > 0) {
    const mixer = new AnimationMixer(gltf.scene);

    gltf.animations.forEach(clip => {
      mixer.clipAction(clip).play();
    });

    mixers.push(mixer);
  }

  return gltf.scene;
}

(async function loadScene() {
  const atriumGltf = await loadGLTF("./MozAtrium.glb");
  const blocksTruckGltf = await loadGLTF("./BlocksTruck/model.gltf");
  const firefoxLogoTexture = await loadTexture("./FirefoxLogo.png");

  addGlTF(atriumGltf);

  const logo1 = addImage(firefoxLogoTexture);
  logo1.position.set(4, 1.5, 1.5);
  logo1.rotateY(-Math.PI / 2);

  const logo2 = addImage(firefoxLogoTexture);
  logo2.position.set(4, 1.5, 2.75);
  logo2.rotateY(-Math.PI / 2);

  scene.add(new AxesHelper(1));
})().catch(console.error);

const clock = new Clock();

function render() {
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();

  for (let i = 0; i < mixers.length; i++) {
    mixers[i].update(dt);
  }

  const curFrame = Math.round(time) % 2;

  if (lastFrame !== curFrame) {
    lastFrame = curFrame;
    nonBatchedColor.setRGB(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  }

  for (let i = 0; i < nonBatchedMatrials.length; i++) {
    nonBatchedMatrials[i].color.copy(nonBatchedColor);
  }

  batchManager.update(time);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);

(window as any).renderer = renderer;
(window as any).scene = scene;
(window as any).batchManager = batchManager;
