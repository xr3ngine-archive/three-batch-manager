import { UniformsGroup } from './UniformsGroup';
import { IUniform } from 'three';
import { MaterialParameters, Material } from 'three';

/**
 * @deprecated Use {@link PointsMaterial THREE.PointsMaterial} instead
 */
/**
 * @deprecated Use {@link PointsMaterial THREE.PointsMaterial} instead
 */
/**
 * @deprecated Use {@link PointsMaterial THREE.PointsMaterial} instead
 */

export interface ShaderMaterialParameters extends MaterialParameters {
	defines?: any;
	uniforms?: any;
	uniformsGroups?: UniformsGroup[];
	vertexShader?: string;
	fragmentShader?: string;
	linewidth?: number;
	wireframe?: boolean;
	wireframeLinewidth?: number;
	lights?: boolean;
	clipping?: boolean;
	skinning?: boolean;
	morphTargets?: boolean;
	morphNormals?: boolean;
	extensions?: {
		derivatives?: boolean;
		fragDepth?: boolean;
		drawBuffers?: boolean;
		shaderTextureLOD?: boolean;
	};
}

export class ShaderMaterial extends Material {

	constructor( parameters?: ShaderMaterialParameters );

	defines: any;
	uniforms: { [uniform: string]: IUniform };
	uniformsGroups: UniformsGroup[];
	vertexShader: string;
	fragmentShader: string;
	linewidth: number;
	wireframe: boolean;
	wireframeLinewidth: number;
	lights: boolean;
	clipping: boolean;
	skinning: boolean;
	morphTargets: boolean;
	morphNormals: boolean;

	/**
	 * @deprecated Use {@link ShaderMaterial#extensions.derivatives extensions.derivatives} instead.
	 */
	derivatives: any;
	extensions: {
		derivatives: boolean;
		fragDepth: boolean;
		drawBuffers: boolean;
		shaderTextureLOD: boolean;
	};
	defaultAttributeValues: any;
	index0AttributeName: string | undefined;

	setValues( parameters: ShaderMaterialParameters ): void;
	toJSON( meta: any ): any;

}
