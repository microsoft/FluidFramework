/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandleInternal } from '@fluidframework/core-interfaces/internal';
import { FluidHandleBase, toFluidHandleInternal } from '@fluidframework/runtime-utils/internal';

import { type IShim } from './types.js';

/**
 * ShimHandle is a special class to handle the fact that we are essentially creating a proxy for a DDS.
 *
 * ShimHandle is designed for MigrationShim and SharedTreeShim.
 *
 * Local handles such as the FluidObjectHandle and the SharedObjectHandle don't work as they do not properly bind the
 * Shim's underlying DDS.
 */
export class ShimHandle<TShim extends IShim> extends FluidHandleBase<TShim> {
	public constructor(private readonly shim: TShim) {
		super();
	}

	public get absolutePath(): string {
		return toFluidHandleInternal(this.shim.currentTree.handle).absolutePath;
	}
	public get isAttached(): boolean {
		return this.shim.currentTree.handle.isAttached;
	}
	public attachGraph(): void {
		return toFluidHandleInternal(this.shim.currentTree.handle).attachGraph();
	}
	public async get(): Promise<TShim> {
		return this.shim;
	}
	/**
	 * @deprecated No replacement provided. Arbitrary handles may not serve as a bind source.
	 */
	public bind(handle: IFluidHandleInternal): void {
		return toFluidHandleInternal(this.shim.currentTree.handle).bind(handle);
	}
}
