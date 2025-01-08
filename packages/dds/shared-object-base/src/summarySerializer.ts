/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import type { ISerializedHandle } from "@fluidframework/runtime-utils/internal";

import { FluidSerializer } from "./serializer.js";

/**
 * Serializer implementation for serializing handles during summary.
 * @internal
 */
export class SummarySerializer extends FluidSerializer {
	private readonly serializedRoutes: Set<string> = new Set();
	public getSerializedRoutes(): string[] {
		return [...this.serializedRoutes];
	}

	protected serializeHandle(
		handle: IFluidHandleInternal,
		bind: IFluidHandleInternal,
	): ISerializedHandle {
		this.serializedRoutes.add(handle.absolutePath);
		return super.serializeHandle(handle, bind);
	}
}
