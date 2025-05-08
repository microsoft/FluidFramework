/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	decodeHandles,
	generateHandleContextPath,
	SummaryTreeBuilder,
} from "@fluidframework/runtime-utils/internal";

import { IFluidSerializer, recursivelyReplace } from "./serializer.js";

/**
 * Given a mostly-plain object that may have handle objects embedded within, return a string representation of an object
 * where the handle objects have been replaced with a serializable form.
 * @param value - The mostly-plain object
 * @param serializer - The serializer that knows how to convert handles into serializable format
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns Result of strigifying an object
 * @internal
 */
export function serializeHandles(
	value: unknown,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): string | undefined {
	return value === undefined ? value : serializer.stringify(value, bind);
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
 *
 * @deprecated - There should be no need to work with encoded handles directly. No replacement is offered.
 * See {@link serializeHandles} or {@link IFluidSerializer.stringify} as functions that will serialize content with handles to a string.
 *
 * @legacy
 * @alpha
 */
export function makeHandlesSerializable(
	value: unknown,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): unknown {
	return serializer.encode(value, bind);
}

/**
 * Given a fully-plain object that may have serializable-form handles within, will return the mostly-plain object
 * with handle objects created instead.
 * @remarks Idempotent when called multiple times.
 * @param value - The fully-plain object
 * @param serializer - The serializer that knows how to convert serializable-form handles into handle objects
 * @returns The mostly-plain object with handle objects within
 *
 * @deprecated - There should be no need to work with encoded handles directly. No replacement is offered.
 * See {@link IFluidSerializer.parse} as a function that will deserialize a string, supporting content with handles.
 *
 * @privateRemarks
 * Will be made internal once we can remove it from the legacy/alpha API
 *
 * @legacy
 * @alpha
 */
export function parseHandles(value: unknown, serializer: IFluidSerializer): unknown {
	return serializer.decode(value);
}

/**
 * Curried function to convert legacy relative URLs to absolute URLs using the given IFluidHandleContext.
 */
const convertLegacyRelativeUrlToAbsoluteUrlFn =
	(context: IFluidHandleContext) => (url: string) =>
		// Old documents may have handles with relative path in their summaries. Convert these to absolute
		// paths. This will ensure that future summaries will have absolute paths for these handles.
		url.startsWith("/") ? url : generateHandleContextPath(url, context);

/**
 * Given a fully-plain object that may have serializable-form handles within, will return the mostly-plain object
 * with handle objects created instead.
 * @remarks Idempotent when called multiple times.
 * @param value - The fully-plain object
 * @param rootContext - The handle context for the container
 * @param channelsContext - The handle context for this channel's parent
 * @returns The mostly-plain object with handle objects within
 *
 * @internal
 */
export function parseHandlesInternal(
	input: unknown,
	rootContext: IFluidHandleContext,
	channelsContext: IFluidHandleContext,
): unknown {
	// If the given 'input' cannot contain handles, return it immediately.  Otherwise,
	// return the result of 'recursivelyReplace()'.
	return input !== null && typeof input === "object"
		? recursivelyReplace(input, (value) =>
				decodeHandles(
					value,
					rootContext,
					convertLegacyRelativeUrlToAbsoluteUrlFn(channelsContext),
				),
			)
		: input;
}

/**
 * Create a new summary containing one blob
 * @param key - the key for the blob in the summary
 * @param content - blob content
 * @returns The summary containing the blob
 * @internal
 */
export function createSingleBlobSummary(
	key: string,
	content: string | Uint8Array,
): ISummaryTreeWithStats {
	const builder = new SummaryTreeBuilder();
	builder.addBlob(key, content);
	return builder.getSummaryTree();
}

/**
 * Binds all handles found in `value` to `bind`. Does not modify original input.
 *
 * @internal
 */
export function bindHandles<T = unknown>(
	value: T,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): T {
	// N.B. AB#7316 this could be made more efficient by writing an ad hoc
	// implementation that doesn't clone at all. Today the distinction between
	// this function and `encode` is purely semantic -- encoding both serializes
	// handles and binds them, but sometimes we only wish to do the latter
	serializer.encode(value, bind);

	// Return the input value so this function can be swapped in for makeHandlesSerializable
	return value;
}

/**
 * Information about a Fluid channel.
 * @privateRemarks
 * This is distinct from {@link IChannel} as it omits the APIs used by the runtime to manage the channel and instead only has things which are useful (and safe) to expose to users of the channel.
 * @internal
 */
export type IChannelView = Pick<IChannel, "id" | "attributes" | "isAttached">;
