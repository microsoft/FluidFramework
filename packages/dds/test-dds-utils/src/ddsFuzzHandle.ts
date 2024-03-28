/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { v4 as uuid } from "uuid";

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
		// public readonly path: string,
		public readonly routeContext: IFluidHandleContext,
		// public get: () => Promise<any>,
		private readonly onAttachGraph?: () => void,
	) {
		this.absolutePath = generateHandleContextPath(uuid() as string, this.routeContext);
	}

	public async get(): Promise<any> {
		return this.absolutePath;
	}

	public attachGraph() {
		if (!this.attached) {
			this.attached = true;
			this.onAttachGraph?.();
		}
	}

	public bind(handle: IFluidHandle) {
		throw new Error("Cannot bind to blob handle");
	}
}
