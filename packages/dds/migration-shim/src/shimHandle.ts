/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type SharedTreeShim } from "./sharedTreeShim";
import { type Shim } from "./shim";

/**
 * ShimHandle is a special class to handle the fact that we are essentially creating a proxy for a DDS.
 *
 * ShimHandle is designed for MigrationShim and SharedTreeShim.
 *
 * Local handles such as the FluidObjectHandle and the SharedObjectHandle don't work as they do not properly bind the
 * Shim's underlying DDS.
 */
export class ShimHandle<T extends SharedTreeShim | Shim> implements IFluidHandle<T> {
	public constructor(private readonly shim: T) {}

	public get absolutePath(): string {
		return this.shim.currentTree.handle.absolutePath;
	}
	public get isAttached(): boolean {
		return this.shim.currentTree.handle.isAttached;
	}
	public attachGraph(): void {
		return this.shim.currentTree.handle.attachGraph();
	}
	public async get(): Promise<T> {
		return this.shim;
	}
	public bind(handle: IFluidHandle): void {
		return this.shim.currentTree.handle.bind(handle);
	}
	public get IFluidHandle(): IFluidHandle<T> {
		return this;
	}
}
