/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { type ISerializedHandle } from "@fluidframework/runtime-utils/internal";

import { FluidSerializer } from "./serializer.js";

/**
 * Implementation of IFluidSerializer used by GC to visit all the handles in the DDS to collect its outbound routes
 *
 * @remarks - This is given to DDS code that typically produces a serialization of the data, which is then ignored.
 * All that is needed is getSerializedRoutes() to get the routes. This strategy could be optimized if needed.
 */
export class GCHandleVisitor extends FluidSerializer {
	private readonly visitedHandles: Set<string> = new Set();
	public getVisitedHandles(): string[] {
		return [...this.visitedHandles];
	}

	protected bindAndEncodeHandle(
		handle: IFluidHandleInternal,
		bind: IFluidHandleInternal,
	): ISerializedHandle {
		this.visitedHandles.add(handle.absolutePath);
		return super.bindAndEncodeHandle(handle, bind);
	}
}
