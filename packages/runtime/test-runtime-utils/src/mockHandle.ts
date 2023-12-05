/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";

/**
 * Mock implementation of IFluidHandle.
 * @alpha
 */
export class MockHandle<T> implements IFluidHandle {
	private graphAttachState: AttachState = AttachState.Detached;

	public get IFluidHandle(): IFluidHandle {
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

	public async get(): Promise<any> {
		return this.value;
	}
	public attachGraph(): void {
		this.graphAttachState = AttachState.Attached;
	}
	public bind() {
		throw Error("MockHandle.bind() unimplemented.");
	}
}
