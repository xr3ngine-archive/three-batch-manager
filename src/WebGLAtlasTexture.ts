import { Texture, Math as ThreeMath, WebGLRenderer, CanvasTexture } from "three";

export type TileID = number;
export type LayerID = number;
// export type TextureID = [LayerID, TileID];
export interface TextureID extends Array<number> {
  0: LayerID;
  1: TileID;
}
export type UVTransform = [number, number, number, number];

type UploadableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

class Layer {
  freed: TileID[];
  size: number;
  nextIdx: TileID;
  rows: number;
  colls: number;
  maxIdx: TileID;

  constructor(size: number, rows: number, colls: number) {
    this.freed = [];
    this.recycle(size, rows, colls);
  }

  recycle(size: number, rows: number, colls: number) {
    this.size = size;
    this.nextIdx = 0;
    this.freed.length = 0;
    this.rows = rows;
    this.colls = colls;
    this.maxIdx = rows * colls - 1;
  }

  nextId() {
    return this.freed.length ? this.freed.pop() : this.nextIdx++;
  }

  freeId(idx: TileID) {
    this.freed.push(idx);
  }

  isFull() {
    return !this.freed.length && this.nextIdx >= this.maxIdx;
  }

  isEmpty() {
    return this.nextIdx === this.freed.length;
  }
}

export default class WebGLAtlasTexture extends Texture {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  textureResolution: number;
  minAtlasSize: number;
  freeLayers: LayerID[];
  layers: Layer[];
  nullTextureIndex: TextureID;
  glTexture: WebGLTexture;
  arrayDepth: number;
  nullTextureTransform: UVTransform;
  textures: Map<Texture, { count: number; id: TextureID; uvTransform: number[] }>;

  constructor(renderer: WebGLRenderer, textureResolution = 4096, minAtlasSize = 512) {
    super();

    this.renderer = renderer;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = textureResolution;
    this.canvasCtx = this.canvas.getContext("2d");

    this.textures = new Map();

    this.textureResolution = textureResolution;
    this.minAtlasSize = minAtlasSize;

    this.freeLayers = [];
    this.layers = [];

    this.flipY = false;

    this.createTextureArray(3);

    this.nullTextureTransform = [0, 0, 0, 0];
    this.nullTextureIndex = this.addColorRect(this.minAtlasSize, "white", this.nullTextureTransform);
  }

  getLayerWithSpace(size: number) {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.size === size && !layer.isFull()) {
        return i;
      }
    }
    return this.allocLayer(size);
  }

  allocLayer(size: number) {
    const rows = this.textureResolution / size;
    if (this.freeLayers.length) {
      const layerIdx = this.freeLayers.pop();
      this.layers[layerIdx].recycle(size, rows, rows);
      return layerIdx;
    } else {
      if (this.layers.length === this.arrayDepth) {
        this.growTextureArray(Math.ceil(this.arrayDepth * 1.5));
      }
      this.layers.push(new Layer(size, rows, rows));
      return this.layers.length - 1;
    }
  }

  nextId(size: number): TextureID {
    const layerIdx = this.getLayerWithSpace(Math.max(size, this.minAtlasSize));
    return [layerIdx, this.layers[layerIdx].nextId()];
  }

  createTextureArray(arrayDepth: number) {
    const slot = 0;

    const { state, properties } = this.renderer;
    const gl = this.renderer.context as WebGL2RenderingContext;
    const textureProperties = properties.get(this);

    // console.log("Allocating texture array, depth", arrayDepth);
    this.glTexture = gl.createTexture();
    this.arrayDepth = arrayDepth;
    textureProperties.__webglTexture = this.glTexture;
    textureProperties.__webglInit = true;

    state.activeTexture(gl.TEXTURE0 + slot);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, this.textureResolution, this.textureResolution, arrayDepth);

    state.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA,
      this.textureResolution,
      this.textureResolution,
      arrayDepth,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );

    textureProperties.__maxMipLevel = 0;
  }

  growTextureArray(newDepth: number) {
    console.log("Growing array", newDepth);
    const gl = this.renderer.context as WebGL2RenderingContext;

    const prevGlTexture = this.glTexture;
    const prevArrayDepth = this.arrayDepth;

    const src = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    const dest = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dest);

    this.createTextureArray(newDepth);

    const res = this.textureResolution;
    for (let i = 0; i < prevArrayDepth; i++) {
      gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, prevGlTexture, 0, i);
      gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, 0, i);
      gl.blitFramebuffer(0, 0, res, res, 0, 0, res, res, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    gl.deleteTexture(prevGlTexture);
    gl.deleteFramebuffer(src);
    gl.deleteFramebuffer(dest);
  }

  addTexture(texture: Texture, uvTransform: UVTransform) {
    const textureInfo = this.textures.get(texture);

    if (textureInfo) {
      textureInfo.count++;

      for (let i = 0; i < 4; i++) {
        uvTransform[i] = textureInfo.uvTransform[i];
      }

      return textureInfo.id;
    }

    const img = texture.image;
    let width = img.width;
    let height = img.height;
    let size;

    if (width > height) {
      const ratio = height / width;
      width = Math.min(ThreeMath.floorPowerOfTwo(width), this.textureResolution);
      height = Math.round(width * ratio);
      size = width;
    } else {
      const ratio = width / height;
      height = Math.min(ThreeMath.floorPowerOfTwo(height), this.textureResolution);
      width = Math.round(height * ratio);
      size = height;
    }

    let imgToUpload = img;

    if (width !== img.width || height !== img.height) {
      // console.warn("resizing image from", img.width, img.height, "to", width, height);
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvasCtx.clearRect(0, 0, width, height);
      this.canvasCtx.drawImage(img, 0, 0, width, height);
      imgToUpload = this.canvas;
    }

    const id = this.nextId(size);
    const [layerIdx, atlasIdx] = id;

    this.uploadImage(layerIdx, atlasIdx, imgToUpload);

    const layer = this.layers[layerIdx];

    uvTransform[0] = (atlasIdx % layer.colls) / layer.colls;
    uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows;
    uvTransform[2] = (1 / layer.colls) * (width / layer.size);
    uvTransform[3] = (1 / layer.rows) * (height / layer.size);

    if (texture.flipY) {
      uvTransform[1] = uvTransform[1] + uvTransform[3];
      uvTransform[3] = -uvTransform[3];
    }

    this.textures.set(texture, {
      id,
      count: 1,
      uvTransform: uvTransform.slice()
    });

    // console.log("layerIdx: ", layerIdx, "atlasIdx: ", atlasIdx, "uvtransform: ", uvTransform, "layer: ", layer);

    return id;
  }

  addColorRect(size: number, color: string, uvTransform: UVTransform) {
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvasCtx.fillStyle = color;
    this.canvasCtx.fillRect(0, 0, size, size);
    return this.addTexture(new CanvasTexture(this.canvas), uvTransform);
  }

  uploadImage(layerIdx: LayerID, atlasIdx: TileID, img: UploadableImage) {
    const state = this.renderer.state;
    const gl = this.renderer.context as WebGL2RenderingContext;
    const slot = 0;

    state.activeTexture(gl.TEXTURE0 + slot);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    const layer = this.layers[layerIdx];
    // console.log("Uploading image", layerIdx, atlasIdx, img.width, img.height);
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY, // target
      0, // level
      (atlasIdx % layer.colls) * layer.size, // xoffset
      Math.floor(atlasIdx / layer.rows) * layer.size, // yoffset
      layerIdx, // zoffset
      img.width, // width
      img.height, // height
      1, // depth
      gl.RGBA, // format
      gl.UNSIGNED_BYTE, // type
      img // pixels
    );
  }

  removeTexture(texture: Texture) {
    const textureInfo = this.textures.get(texture);

    textureInfo.count--;

    if (textureInfo.count !== 0) {
      return;
    }

    const [layerIdx, atlasIdx] = textureInfo.id;

    const layer = this.layers[layerIdx];

    this.canvas.width = this.canvas.height = layer.size;
    this.canvasCtx.clearRect(0, 0, layer.size, layer.size);
    this.uploadImage(layerIdx, atlasIdx, this.canvas);

    layer.freeId(atlasIdx);
    if (layer.isEmpty()) {
      // console.log("Freeing layer", layer);
      this.freeLayers.push(layerIdx);
    }

    this.textures.delete(texture);

    // console.log("Remove", layerIdx, atlasIdx, layer, this.freeLayers);
  }
}

Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
  set() {
    console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
  }
});
