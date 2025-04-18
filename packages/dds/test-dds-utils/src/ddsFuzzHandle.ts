/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import {
	FluidHandleBase,
	generateHandleContextPath,
} from "@fluidframework/runtime-utils/internal";
import type { IPoisonedHandle } from "./fuzzSerializer.js";

/**
 * @internal
 */
export class DDSFuzzHandle extends FluidHandleBase<string> {
	private attached: boolean = false;

	public get isAttached(): boolean {
		return this.routeContext.isAttached && this.attached;
	}

	public readonly absolutePath: string;

	constructor(
		public readonly id: string,
		public readonly routeContext: IFluidHandleContext,
	) {
		super();
		this.absolutePath = generateHandleContextPath(id, this.routeContext);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async get(): Promise<any> {
		return this.absolutePath;
	}

	public attachGraph(): void {
		if (!this.attached) {
			this.attached = true;
		}
	}

	public bind(handle: IFluidHandle): void {}
}

export class PoisonedDDSFuzzHandle extends FluidHandleBase<string> implements IPoisonedHandle {
	private attached: boolean = false;

	public get isAttached(): boolean {
		return this.routeContext.isAttached && this.attached;
	}

	public readonly absolutePath: string;

	public readonly poisoned = true;

	constructor(
		public readonly id: string,
		public readonly routeContext: IFluidHandleContext,
		public readonly creatingClientId: string,
	) {
		super();
		this.absolutePath = generateHandleContextPath(id, this.routeContext);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async get(): Promise<any> {
		return this.absolutePath;
	}

	public attachGraph(): void {
		if (!this.attached) {
			this.attached = true;
		}
	}

	public bind(handle: IFluidHandle): void {}
}
