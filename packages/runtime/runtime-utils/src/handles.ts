/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
