/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { generateHandleContextPath } from "@fluidframework/runtime-utils/internal";

export interface IContainerHandleContextRuntime {
	attachState: AttachState;
	resolveHandle(request: IRequest): Promise<IResponse>;
}

export class ContainerFluidHandleContext implements IFluidHandleContext {
	public get IFluidHandleContext(): IFluidHandleContext {
		return this;
	}
	public readonly absolutePath: string;

	/**
	 * Creates a new ContainerFluidHandleContext.
	 * @param path - The path to this handle relative to the routeContext.
	 * @param runtime - The IRuntime object this context represents.
	 * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
	 */
	constructor(
		public readonly path: string,
		private readonly runtime: IContainerHandleContextRuntime,
		public readonly routeContext?: IFluidHandleContext,
	) {
		this.absolutePath = generateHandleContextPath(path, this.routeContext);
	}

	public attachGraph(): void {
		throw new Error("can't attach container runtime form within container!");
	}

	public get isAttached(): boolean {
		return this.runtime.attachState !== AttachState.Detached;
	}

	public async resolveHandle(request: IRequest): Promise<IResponse> {
		return this.runtime.resolveHandle(request);
	}
}
