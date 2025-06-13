/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { FluidHandleBase } from "@fluidframework/runtime-utils/internal";

/**
 * Mock implementation of IFluidHandle.
 * @legacy
 * @alpha
 */
export class MockHandle<T> extends FluidHandleBase<T> {
	private graphAttachState: AttachState = AttachState.Detached;

	public get isAttached(): boolean {
		return this.graphAttachState === AttachState.Attached;
	}

	constructor(
		protected readonly value: T,
		public readonly path = `mock-handle-${Math.random().toString(36).slice(2)}`,
		public readonly absolutePath: string = `/${path}`,
	) {
		super();
	}

	public async get(): Promise<T> {
		return this.value;
	}
	public attachGraph(): void {
		this.graphAttachState = AttachState.Attached;
	}
	/**
	 * @deprecated No replacement provided. Arbitrary handles may not serve as a bind source.
	 */
	public bind() {
		throw Error("MockHandle.bind() unimplemented.");
	}
}
