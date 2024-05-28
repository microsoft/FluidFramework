/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { Serializable } from "@fluidframework/datastore-definitions/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";

export class MockHandleContext implements IFluidHandleContext {
	public isAttached = false;
	public get IFluidHandleContext() {
		return this;
	}

	// In real scenarios, the handle context is ContainerFluidHandleContext which has a circular reference to ContainerRuntime.
	// This has caused trouble with traversing an object with handles, so include it in the mock as well.
	public circular = this;

	constructor(
		public readonly absolutePath = "",
		public readonly routeContext?: IFluidHandleContext,
	) {}

	public attachGraph() {
		throw new Error("Method not implemented.");
	}

	public async resolveHandle(request: IRequest) {
		return create404Response(request);
	}
}

/**
 * Creates a Jsonable object graph of a specified breadth/depth.  The 'createLeaf' callback
 * is a factory that is invoked to create the leaves of the graph.
 */
export function makeJson<T>(breadth: number, depth: number, createLeaf: () => Serializable<T>) {
	let depthInternal = depth;
	if (--depthInternal === 0) {
		return createLeaf();
	}

	const o = {};
	for (let i = 0; i < breadth; i++) {
		o[`o${i}`] = makeJson(breadth, depthInternal, createLeaf);
	}
	return o;
}
