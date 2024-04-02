/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

/**
 * @internal
 */
export class DDSFuzzHandle implements IFluidHandle {
	private attached: boolean = false;

	public get IFluidHandle(): IFluidHandle {
		return this;
	}

	public get isAttached(): boolean {
		return this.routeContext.isAttached && this.attached;
	}

	public readonly absolutePath: string;

	constructor(
		public readonly id: string,
		public readonly routeContext: IFluidHandleContext,
		// public get: () => Promise<any>,
		private readonly onAttachGraph?: () => void,
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
			this.onAttachGraph?.();
		}
	}

	public bind(handle: IFluidHandle): void {
		throw new Error("Cannot bind to blob handle");
	}
}
