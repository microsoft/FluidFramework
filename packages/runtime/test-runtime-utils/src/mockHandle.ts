/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidHandleSymbol, toFluidHandleErased } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import type { IFluidHandleErased, IFluidHandleInternal } from "@fluidframework/core-interfaces";

/**
 * Mock implementation of IFluidHandle.
 * @alpha
 */
export class MockHandle<T> implements IFluidHandleInternal<T> {
	private graphAttachState: AttachState = AttachState.Detached;

	public get IFluidHandle(): IFluidHandleInternal {
		return this;
	}
	public get isAttached(): boolean {
		return this.graphAttachState === AttachState.Attached;
	}

	constructor(
		protected readonly value: T,
		public readonly path = `mock-handle-${Math.random().toString(36).slice(2)}`,
		public readonly absolutePath: string = `/${path}`,
	) {}

	public get [fluidHandleSymbol](): IFluidHandleErased<T> {
		return toFluidHandleErased(this);
	}

	public async get(): Promise<T> {
		return this.value;
	}
	public attachGraph(): void {
		this.graphAttachState = AttachState.Attached;
	}
	public bind() {
		throw Error("MockHandle.bind() unimplemented.");
	}
}
