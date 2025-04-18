/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandleContext, IRequest } from "@fluidframework/core-interfaces/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";
import { FluidSerializer } from "@fluidframework/shared-object-base/internal";

class MockHandleContext implements IFluidHandleContext {
	public isAttached = false;
	public get IFluidHandleContext() {
		return this;
	}

	public constructor(
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
 * A minimal test FluidSerializer which will error if on resolveHandle and attachGraph.
 *
 * Mainly useful when an IFluidSerializer is required but when handles being encoded don't need to be decoded and resolved.
 */
export const mockSerializer = new FluidSerializer(new MockHandleContext());
