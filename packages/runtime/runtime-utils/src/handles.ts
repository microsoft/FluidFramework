/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * JSON serialized form of an IFluidHandle
 * @internal
 */
export interface ISerializedHandle {
	// Marker to indicate to JSON.parse that the object is a Fluid handle
	type: "__fluid_handle__";

	// URL to the object. Relative URLs are relative to the handle context passed to the stringify.
	url: string;
}

/**
 * Is the input object a @see ISerializedHandle?
 * @internal
 */
export const isSerializedHandle = (value: any): value is ISerializedHandle =>
	value?.type === "__fluid_handle__";

/**
 * Check if a value is an IFluidHandle.
 * @remarks
 * Objects which have a field named `IFluidHandle` can in some cases produce a false positive.
 * @internal
 */
export function isFluidHandle(value: unknown): value is IFluidHandle {
	// `in` gives a type error on non-objects and null, so filter them out
	if (typeof value !== "object" || value === null) {
		return false;
	}

	if (IFluidHandle in value) {
		// Since this check can have false positives, make it a bit more robust by checking value[IFluidHandle][IFluidHandle]
		const inner = value[IFluidHandle] as IFluidHandle;
		if (typeof inner !== "object" || inner === null) {
			return false;
		}
		return IFluidHandle in inner;
	}
	return false;
}
