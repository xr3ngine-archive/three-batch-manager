import { UniformsGroup } from './UniformsGroup';

export class RawUniformsGroup extends UniformsGroup {

	constructor( data: ArrayBuffer | ArrayBufferView );

	data: ArrayBuffer | ArrayBufferView;
	autoUpdate: boolean;
	needsUpdate: boolean;

	clone(): RawUniformsGroup;
	copy( source: RawUniformsGroup ): this;

}
