/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	fluidHandleSymbol,
	toFluidHandleErased,
	type IFluidHandle,
	type IFluidHandleContext,
	type IFluidHandleErased,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { generateHandleContextPath } from "@fluidframework/runtime-utils/internal";

/**
 * @internal
 */
export class DDSFuzzHandle implements IFluidHandleInternal<string> {
	private attached: boolean = false;

	public get IFluidHandle(): IFluidHandleInternal<string> {
		return this;
	}

	public get isAttached(): boolean {
		return this.routeContext.isAttached && this.attached;
	}

	public readonly absolutePath: string;

	constructor(
		public readonly id: string,
		public readonly routeContext: IFluidHandleContext,
	) {
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

	public get [fluidHandleSymbol](): IFluidHandleErased<string> {
		return toFluidHandleErased(this);
	}
}
