/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IFluidSerializer, JsonString, Primitive, serializeJson } from "./serializer";
import { HandlesDecoded, HandlesEncoded } from "./sharedObject";

/**
 * Given a mostly-plain object that may have handle objects embedded within, return a string representation of an object
 * where the handle objects have been replaced with a serializable form.
 * @param value - The mostly-plain object
 * @param serializer - The serializer that knows how to convert handles into serializable format
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns Result of strigifying an object
 */
export function serializeHandles<T extends HandlesEncoded | HandlesDecoded>(
	value: T | Primitive,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): JsonString<HandlesEncoded<T> | Primitive> | undefined {
	return value !== undefined ? serializer.stringify(value, bind) : value;
}

/**
 * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
 * where any embedded IFluidHandles have been replaced with a serializable form.
 *
 * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
 * the root to any replaced handles.  (If no handles are found, returns the original object.)
 *
 * @param input - The mostly-plain object
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns The fully-plain object
 */
export function makeHandlesSerializable<T extends HandlesDecoded>(
	value: T | Primitive,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): HandlesEncoded<T> | Primitive {
	return serializer.encode(value, bind);
}

/**
 * Given a fully-plain object that may have serializable-form handles within, will return the mostly-plain object
 * with handle objects created instead.
 * @param value - The fully-plain object
 * @param serializer - The serializer that knows how to convert serializable-form handles into handle objects
 * @param context - The handle context for the container
 * @returns The mostly-plain object with handle objects within
 */
export function parseHandles<T extends HandlesEncoded>(
	value: T,
	serializer: IFluidSerializer,
): HandlesDecoded<T> | Primitive {
	return value !== undefined ? serializer.parse(serializeJson(value)) : value;
}

/**
 * Create a new summary containing one blob
 * @param key - the key for the blob in the summary
 * @param content - blob content
 * @returns The summary containing the blob
 */
export function createSingleBlobSummary(
	key: string,
	content: string | Uint8Array,
): ISummaryTreeWithStats {
	const builder = new SummaryTreeBuilder();
	builder.addBlob(key, content);
	return builder.getSummaryTree();
}
