import {
  Mesh,
  BufferGeometry,
  Uint32BufferAttribute,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Scene,
  WebGLRenderer,
  BufferAttribute,
  MeshBasicMaterial,
  Color,
  Vector4,
  Fog,
  FogExp2
} from "three";
import { RawShaderMaterial } from "./RawShaderMaterial"
import WebGLAtlasTexture from "./WebGLAtlasTexture";
import { vertexShader, fragmentShader, BatchRawUniformGroup } from "./UnlitBatchShader";

interface BatchableBufferGeometry extends BufferGeometry {
  attributes: {
    [name: string]: BufferAttribute;
  };
}

export interface BatchableMesh extends Mesh {
  geometry: BatchableBufferGeometry;
  material: MeshStandardMaterial | MeshBasicMaterial;
}

export { BatchRawUniformGroup };

interface UnlitBatchOptions {
  bufferSize: number;
  enableVertexColors: boolean;
  pseudoInstancing: boolean;
  maxInstances: number;
  shaders?: ShaderOverride;
  sharedUniforms: {};
}

export class UnlitBatch extends Mesh {
  bufferSize: number;
  enableVertexColors: boolean;
  maxInstances: number;
  vertCount: number;

  meshes: BatchableMesh[];

  atlas: WebGLAtlasTexture;
  ubo: BatchRawUniformGroup;

  geometry: BatchableBufferGeometry;
  material: RawShaderMaterial;

  constructor(ubo: BatchRawUniformGroup, atlas: WebGLAtlasTexture, options = {}) {
    const opts: UnlitBatchOptions = Object.assign(
      {
        bufferSize: 65536,
        enableVertexColors: true,
        pseudoInstancing: true,
        maxInstances: 512,
        sharedUniforms: {}
      },
      options
    );

    const geometry = new BufferGeometry();
    geometry.setAttribute("instance", new Float32BufferAttribute(new Float32Array(opts.bufferSize), 1));
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(opts.bufferSize * 3), 3));

    if (opts.enableVertexColors) {
      geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(opts.bufferSize * 3).fill(1), 3));
    }

    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(opts.bufferSize * 2), 2));
    geometry.setIndex(new Uint32BufferAttribute(new Uint32Array(opts.bufferSize), 1));
    geometry.setDrawRange(0, 0);

    const material = new RawShaderMaterial({
      vertexShader: (opts.shaders && opts.shaders.vertexShader) || vertexShader,
      fragmentShader: (opts.shaders && opts.shaders.fragmentShader) || fragmentShader,
      defines: {
        MAX_INSTANCES: opts.maxInstances,
        PSEUDO_INSTANCING: opts.pseudoInstancing,
        VERTEX_COLORS: opts.enableVertexColors
      },
      uniforms: {
        ...opts.sharedUniforms,
        map: { value: atlas }
      }
    });

    material.uniformsGroups = [ubo];

    super(geometry, material);

    this.bufferSize = opts.bufferSize;
    this.enableVertexColors = opts.enableVertexColors;
    this.maxInstances = opts.maxInstances;

    this.vertCount = 0;

    this.meshes = [];

    this.frustumCulled = false;

    this.atlas = atlas;
    this.ubo = ubo;
  }

  addMesh(mesh: BatchableMesh): boolean {
    const geometry = mesh.geometry;

    mesh.updateMatrixWorld(true);

    const instanceId = this.ubo.addMesh(mesh, this.atlas);
    if (instanceId === false) {
      return false;
    }
    this.material.needsUpdate = true;

    // TODO this is how we are excluding the original mesh from renderlist for now, maybe do something better?
    mesh.layers.disable(0);

    const meshIndices = geometry.index.array;
    const meshIndicesCount = geometry.index.count;
    const meshVertCount = geometry.attributes.position.count;
    const batchIndicesArray = this.geometry.index.array as Uint32Array;
    const batchIndicesOffset = this.geometry.drawRange.count;

    for (let i = 0; i < meshIndicesCount; i++) {
      batchIndicesArray[batchIndicesOffset + i] = meshIndices[i] + this.vertCount;
    }
    // meshIndiciesAttribute.setArray(batchIndicesArray.subarray(batchIndicesOffset, batchIndicesOffset + meshIndicesCount))

    const batchInstancesArray = this.geometry.attributes.instance.array as Float32Array;
    batchInstancesArray.fill(instanceId, this.vertCount, this.vertCount + meshVertCount);
    this.geometry.attributes.instance.needsUpdate = true;

    const meshPositionsAttribute = geometry.attributes.position;
    const batchPositionsArray = this.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < meshVertCount; i++) {
      batchPositionsArray[(this.vertCount + i) * 3] = meshPositionsAttribute.getX(i);
      batchPositionsArray[(this.vertCount + i) * 3 + 1] = meshPositionsAttribute.getY(i);
      batchPositionsArray[(this.vertCount + i) * 3 + 2] = meshPositionsAttribute.getZ(i);
    }

    // meshPositionsAttribute.setArray(batchPositionsArray.subarray(this.vertCount * 3, this.vertCount * 3 + meshVertCount * 3))
    this.geometry.attributes.position.needsUpdate = true;

    if (this.enableVertexColors && geometry.attributes.color) {
      const meshColorAttribute = geometry.attributes.color;
      const batchColorArray = this.geometry.attributes.color.array as Float32Array;

      for (let i = 0; i < meshVertCount; i++) {
        batchColorArray[(this.vertCount + i) * 3] = meshColorAttribute.getX(i);
        batchColorArray[(this.vertCount + i) * 3 + 1] = meshColorAttribute.getY(i);
        batchColorArray[(this.vertCount + i) * 3 + 2] = meshColorAttribute.getZ(i);
      }

      // meshColorAttribute.setArray(batchColorArray.subarray(this.vertCount * 3, this.vertCount * 3 + meshVertCount * 3 ))
      this.geometry.attributes.color.needsUpdate = true;
    }

    if (geometry.attributes.uv) {
      const batchUvArray = this.geometry.attributes.uv.array as Float32Array;
      const meshUvAttribute = geometry.attributes.uv;
      const uvCount = geometry.attributes.uv.count;

      for (let i = 0; i < uvCount; i++) {
        batchUvArray[(this.vertCount + i) * 2] = meshUvAttribute.getX(i);
        batchUvArray[(this.vertCount + i) * 2 + 1] = meshUvAttribute.getY(i);
      }

      // meshUvAttribute.setArray(batchUvArray.subarray(this.vertCount * 2, this.vertCount * 2 + uvCount * 2))
      this.geometry.attributes.uv.needsUpdate = true;
    }

    this.vertCount += meshVertCount;

    this.geometry.setDrawRange(0, this.geometry.drawRange.count + geometry.index.count);

    this.geometry.index.needsUpdate = true;

    this.meshes.push(mesh);

    return true;
  }

  removeMesh(mesh: BatchableMesh) {
    const indexInBatch = this.meshes.indexOf(mesh);

    let preVertCount = 0;
    let preIndexCount = 0;
    for (let i = 0; i < indexInBatch; i++) {
      const geometry = this.meshes[i].geometry;
      preVertCount += geometry.attributes.position.count;
      preIndexCount += geometry.index.count;
    }

    const vertCount = mesh.geometry.attributes.position.count;
    const batchAttributes = this.geometry.attributes;
    (batchAttributes.instance.array as Float32Array).copyWithin(preVertCount, preVertCount + vertCount);
    batchAttributes.instance.needsUpdate = true;
    (batchAttributes.position.array as Float32Array).copyWithin(preVertCount * 3, (preVertCount + vertCount) * 3);
    batchAttributes.position.needsUpdate = true;
    (batchAttributes.color.array as Float32Array).copyWithin(preVertCount * 3, (preVertCount + vertCount) * 3);
    batchAttributes.color.needsUpdate = true;
    (batchAttributes.uv.array as Float32Array).copyWithin(preVertCount * 2, (preVertCount + vertCount) * 2);
    batchAttributes.uv.needsUpdate = true;
    this.vertCount -= vertCount;

    const indexCount = mesh.geometry.index.count;
    const batchIndexArray = this.geometry.index.array as Uint32Array;
    this.geometry.setDrawRange(0, this.geometry.drawRange.count - indexCount);
    for (let i = preIndexCount; i < this.geometry.drawRange.count; i++) {
      batchIndexArray[i] = batchIndexArray[i + indexCount] - vertCount;
    }
    this.geometry.index.needsUpdate = true;

    this.ubo.removeMesh(mesh, this.atlas);
    this.material.needsUpdate = true;

    this.meshes.splice(indexInBatch, 1);
  }
}

interface ShaderOverride {
  vertexShader: string;
  fragmentShader: string;
}

interface ShaderOverrides {
  unlit?: ShaderOverride;
}

interface BatchManagerOptions {
  maxInstances?: number;
  maxBufferSize?: number;
  ubo?: BatchRawUniformGroup;
  shaders?: ShaderOverrides;
}

export class BatchManager {
  scene: Scene;
  renderer: WebGLRenderer;

  maxInstances: number;
  instanceCount: number;

  maxBufferSize: number;

  batchForMesh: WeakMap<BatchableMesh, UnlitBatch>;
  batches: UnlitBatch[];

  atlas: WebGLAtlasTexture;
  ubo: BatchRawUniformGroup;
  shaders: ShaderOverrides;

  fogOptions: Vector4;
  fogColor: Color;
  sharedUniforms: {};

  constructor(scene: Scene, renderer: WebGLRenderer, options: BatchManagerOptions = {}) {
    this.scene = scene;
    this.renderer = renderer;

    this.fogOptions = new Vector4();
    this.fogColor = new Color();
    this.sharedUniforms = {
      fogOptions: { value: this.fogOptions },
      fogColor: { value: this.fogColor }
    };

    this.maxInstances = options.maxInstances || 512;
    this.maxBufferSize = options.maxBufferSize || 65536;

    this.batches = [];
    this.batchForMesh = new WeakMap();

    this.atlas = new WebGLAtlasTexture(renderer);
    this.ubo = options.ubo || new BatchRawUniformGroup(this.maxInstances);
    this.shaders = options.shaders || {};

    this.instanceCount = 0;
  }

  addMesh(mesh: Mesh) {
    if (this.instanceCount >= this.maxInstances) {
      console.warn("Batch is full, not batching", mesh);
      return false;
    }

    if ((mesh as any).isSkinnedMesh) {
      console.warn("SkinnedMesh is not supported, skipping.", mesh);
      return false;
    }

    if (!(mesh.geometry as BufferGeometry)) {
      console.warn("Mesh does not use BufferGeometry, skipping.", mesh);
      return false;
    }

    const attributes = (mesh.geometry as BufferGeometry).attributes;

    for (const attributeName in attributes) {
      const attribute = attributes[attributeName];

      if ((attribute as any).isInterleavedBufferAttribute) {
        console.warn("Mesh uses unsupported InterleavedBufferAttribute, skipping.", mesh);
        return false;
      }
    }

    const batchableMesh = mesh as BatchableMesh;

    if (this.batchForMesh.has(batchableMesh)) {
      console.warn("Mesh is already in the batch, skipping.", mesh);
      return false;
    }

    if (Array.isArray(mesh.material)) {
      console.warn("Mesh uses unsupported multi-material, skipping.", mesh);
      return false;
    }

    if (mesh.material.transparent || mesh.material.alphaTest !== 0) {
      console.warn("Mesh uses unsupported transparency, skipping.", mesh);
      return false;
    }

    let nextBatch = null;

    const batches = this.batches;

    if (!batchableMesh.geometry.index) {
      console.warn("Non-indexed mesh, skipping.", mesh);
      return false;
    }

    const indexCount = batchableMesh.geometry.index.count;
    const vertCount = batchableMesh.geometry.attributes.position.count;

    if (indexCount > this.maxBufferSize || vertCount > this.maxBufferSize) {
      return false;
    }

    for (let i = 0; i < this.batches.length; i++) {
      const batch = batches[i];

      if (
        batchableMesh.material.side === batch.material.side &&
        batch.geometry.drawRange.count + indexCount < batch.bufferSize &&
        batch.vertCount + batchableMesh.geometry.attributes.position.count < batch.bufferSize
      ) {
        nextBatch = batch;
        break;
      }
    }

    if (nextBatch === null) {
      nextBatch = new UnlitBatch(this.ubo, this.atlas, {
        maxInstances: this.maxInstances,
        bufferSize: this.maxBufferSize,
        shaders: this.shaders.unlit,
        sharedUniforms: this.sharedUniforms
      });
      nextBatch.material.side = batchableMesh.material.side;
      this.scene.add(nextBatch);
      this.batches.push(nextBatch);
    }

    if (!nextBatch.addMesh(batchableMesh)) {
      return false;
    }

    this.batchForMesh.set(batchableMesh, nextBatch);
    this.instanceCount++;

    return true;
  }

  removeMesh(mesh: Mesh) {
    const batchableMesh = mesh as BatchableMesh;
    const batch = this.batchForMesh.get(batchableMesh);

    if (!batch) {
      return false;
    }

    batch.removeMesh(batchableMesh);
    this.batchForMesh.delete(batchableMesh);
    this.instanceCount--;
    return true;
  }

  updateFog() {
    const fog: any = this.scene.fog;

    if (!fog) {
      this.fogOptions.x = 0; // FogType = disabled
      return;
    }

    this.fogColor.copy(fog.color);

    if (fog.isFog) {
      this.fogOptions.x = 1; // FogType = linear
      this.fogOptions.z = fog.near;
      this.fogOptions.w = fog.far;
    } else {
      this.fogOptions.x = 2; // FogType = exponential
      this.fogOptions.y = fog.density;
    }
  }

  update(time: number) {
    this.updateFog();
    this.ubo.update(time);
  }
}
