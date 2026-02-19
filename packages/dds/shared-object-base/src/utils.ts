/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, isObject } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	isFluidHandle,
	SummaryTreeBuilder,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";

import { isISharedObjectHandle } from "./handle.js";
import type { IFluidSerializer } from "./serializer.js";

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
 * @legacy @beta
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
 * @param context - The handle context for the container
 * @returns The mostly-plain object with handle objects within
 * @legacy @beta
 */
export function parseHandles(value: unknown, serializer: IFluidSerializer): unknown {
	return serializer.decode(value);
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
export function bindHandles<T = unknown>(value: T, bind: IFluidHandle): T {
	const nodesToProcess: unknown[] = [value];
	const visitedNodes = new Set<unknown>();

	assert(isISharedObjectHandle(bind), 0xc85 /* bind must be an ISharedObjectHandle */);

	while (nodesToProcess.length > 0) {
		const node = nodesToProcess.pop();

		if (isFluidHandle(node)) {
			visitedNodes.add(node);
			bind.bind(toFluidHandleInternal(node));
		} else if (Array.isArray(node) && !visitedNodes.has(node)) {
			visitedNodes.add(node);
			for (const item of node) {
				if (isObject(item)) {
					nodesToProcess.push(item);
				}
			}
		} else if (isObject(node) && !visitedNodes.has(node)) {
			visitedNodes.add(node);
			for (const val of Object.values(node)) {
				if (isObject(val)) {
					nodesToProcess.push(val);
				}
			}
		}
	}

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
