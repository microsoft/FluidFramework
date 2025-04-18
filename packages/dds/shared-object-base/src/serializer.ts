/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	IFluidHandleContext,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { assert, shallowCloneObject } from "@fluidframework/core-utils/internal";
// eslint-disable-next-line import/no-deprecated
import type { IFluidDataStoreRuntimeExperimental } from "@fluidframework/datastore-definitions/internal";
import {
	encodeHandleForSerialization,
	generateHandleContextPath,
	isSerializedHandle,
	isFluidHandle,
	toFluidHandleInternal,
	type ISerializedHandle,
	RemoteFluidObjectHandle,
} from "@fluidframework/runtime-utils/internal";

/**
 * @legacy
 * @alpha
 */
export interface IFluidSerializer {
	/**
	 * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
	 * where any embedded IFluidHandles have been replaced with a serializable form.
	 *
	 * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
	 * the root to any replaced handles.  (If no handles are found, returns the original object.)
	 */
	encode(value: unknown, bind: IFluidHandle): unknown;

	/**
	 * Given a fully-jsonable object tree that may have encoded handle objects embedded within, will return an
	 * equivalent object tree where any encoded IFluidHandles have been replaced with their decoded form.
	 *
	 * The original `input` object is not mutated.  This method will shallowly clone all objects in the path from
	 * the root to any replaced handles.  (If no handles are found, returns the original object.)
	 *
	 * The decoded handles are implicitly bound to the handle context of this serializer.
	 */
	decode(input: unknown): unknown;

	/**
	 * Stringifies a given value. Converts any IFluidHandle to its stringified equivalent.
	 */
	stringify(value: unknown, bind: IFluidHandle): string;

	/**
	 * Parses the given JSON input string and returns the JavaScript object defined by it. Any Fluid
	 * handles will be realized as part of the parse
	 */
	parse(value: string): unknown;
}

/**
 * Data Store serializer implementation
 * @internal
 */
export class FluidSerializer implements IFluidSerializer {
	private readonly root: IFluidHandleContext;

	public constructor(
		private readonly runtime: Pick<
			// eslint-disable-next-line import/no-deprecated
			IFluidDataStoreRuntimeExperimental,
			"inStagingMode" | "channelsRoutingContext"
		>,
	) {
		this.root = this.runtime.channelsRoutingContext;
		while (this.root.routeContext !== undefined) {
			this.root = this.root.routeContext;
		}
	}

	public get IFluidSerializer(): IFluidSerializer {
		return this;
	}

	/**
	 * Given a mostly-jsonable object tree that may have handle objects embedded within, will return a
	 * fully-jsonable object tree where any embedded IFluidHandles have been replaced with a serializable form.
	 *
	 * The original `input` object is not mutated.  This method will shallowly clone all objects in the path from
	 * the root to any replaced handles.  (If no handles are found, returns the original object.)
	 *
	 * Any unbound handles encountered are bound to the provided IFluidHandle.
	 */
	public encode(input: unknown, bind: IFluidHandleInternal): unknown {
		// If the given 'input' cannot contain handles, return it immediately.  Otherwise,
		// return the result of 'recursivelyReplace()'.
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		return !!input && typeof input === "object"
			? this.recursivelyReplace(input, this.encodeValue, bind)
			: input;
	}

	/**
	 * Given a fully-jsonable object tree that may have encoded handle objects embedded within, will return an
	 * equivalent object tree where any encoded IFluidHandles have been replaced with their decoded form.
	 *
	 * The original `input` object is not mutated.  This method will shallowly clone all objects in the path from
	 * the root to any replaced handles.  (If no handles are found, returns the original object.)
	 *
	 * The decoded handles are implicitly bound to the handle context of this serializer.
	 */
	public decode(input: unknown): unknown {
		// If the given 'input' cannot contain handles, return it immediately.  Otherwise,
		// return the result of 'recursivelyReplace()'.
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		return !!input && typeof input === "object"
			? this.recursivelyReplace(input, this.decodeValue)
			: input;
	}

	/**
	 * Serializes the input object into a JSON string.
	 * Any IFluidHandles in the object will be replaced with their serialized form before stringify,
	 * being bound to the given bind context in the process.
	 */
	public stringify(input: unknown, bind: IFluidHandle): string {
		const bindInternal = toFluidHandleInternal(bind);
		return JSON.stringify(input, (key, value) => this.encodeValue(value, bindInternal));
	}

	/**
	 * Parses the serialized data - context must match the context with which the JSON was stringified
	 */
	public parse(input: string): unknown {
		return JSON.parse(input, (key, value) => this.decodeValue(value));
	}

	/**
	 * If the given 'value' is an IFluidHandle, returns the encoded IFluidHandle.
	 * Otherwise returns the original 'value'.  Used by 'encode()' and 'stringify()'.
	 */
	private readonly encodeValue = (value: unknown, bind?: IFluidHandleInternal): unknown => {
		let result = value;
		if (isSerializedHandle(result)) {
			const deferred = this.deferedHandleMap.get(result.url);
			if (deferred !== undefined) {
				this.deferedHandleMap.delete(result.url);
				result = deferred;
			}
		}

		// If 'value' is an IFluidHandle return its encoded form.
		if (isFluidHandle(result)) {
			assert(bind !== undefined, 0xa93 /* Cannot encode a handle without a bind context */);
			return this.bindAndEncodeHandle(toFluidHandleInternal(result), bind);
		}

		return result;
	};

	/**
	 * If the given 'value' is an encoded IFluidHandle, returns the decoded IFluidHandle.
	 * Otherwise returns the original 'value'.  Used by 'decode()' and 'parse()'.
	 */
	private readonly decodeValue = (value: unknown): unknown => {
		// If 'value' is a serialized IFluidHandle return the deserialized result.
		if (isSerializedHandle(value)) {
			// Old documents may have handles with relative path in their summaries. Convert these to absolute
			// paths. This will ensure that future summaries will have absolute paths for these handles.
			const absolutePath = value.url.startsWith("/")
				? value.url
				: generateHandleContextPath(value.url, this.runtime.channelsRoutingContext);

			return new RemoteFluidObjectHandle(absolutePath, this.root);
		} else {
			return value;
		}
	};

	/**
	 * Invoked for non-null objects to recursively replace references to IFluidHandles.
	 * Clones as-needed to avoid mutating the `input` object.  If no IFluidHandles are present,
	 * returns the original `input`.
	 */
	private recursivelyReplace<TContext = unknown>(
		input: object,
		replacer: (input: unknown, context?: TContext) => unknown,
		context?: TContext,
	): unknown {
		// Note: Caller is responsible for ensuring that `input` is defined / non-null.
		//       (Required for Object.keys() below.)

		// Execute the `replace` on the current input.  Note that Caller is responsible for ensuring that `input`
		// is a non-null object.
		const maybeReplaced = replacer(input, context);

		// If either input or the replaced result is a Fluid Handle, there is no need to descend further.
		// IFluidHandles are always leaves in the object graph, and the code below cannot deal with IFluidHandle's structure.
		if (isFluidHandle(input) || isFluidHandle(maybeReplaced)) {
			return maybeReplaced;
		}

		// Otherwise descend into the object graph looking for IFluidHandle instances.
		let clone: object | undefined;
		for (const key of Object.keys(input)) {
			const value: unknown = input[key];
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (!!value && typeof value === "object") {
				// Note: Except for IFluidHandle, `input` must not contain circular references (as object must
				//       be JSON serializable.)  Therefore, guarding against infinite recursion here would only
				//       lead to a later error when attempting to stringify().
				const replaced = this.recursivelyReplace(value, replacer, context);

				// If the `replaced` object is different than the original `value` then the subgraph contained one
				// or more handles.  If this happens, we need to return a clone of the `input` object where the
				// current property is replaced by the `replaced` value.
				if (replaced !== value) {
					// Lazily create a shallow clone of the `input` object if we haven't done so already.
					clone ??= shallowCloneObject(input);

					// Overwrite the current property `key` in the clone with the `replaced` value.
					clone[key] = replaced;
				}
			}
		}
		return clone ?? input;
	}

	private readonly deferedHandleMap = new Map<string, IFluidHandleInternal>();

	protected bindAndEncodeHandle(
		handle: IFluidHandleInternal,
		bind: IFluidHandleInternal,
	): ISerializedHandle {
		// this passes some basic testing which makes sense. By skipping bind, we basically skip the whole attach flow that a happens at serialization.
		// this is similar to what happens when a handle is stored in a detached dds, as in that case the handle isn't serialized, it's just in the memory
		// of the detached dds. at some point the detached dds is attached. and it produces a summary, which is serialized, and only at that point are
		// all the internal handles to that summary serialized and bound.
		// in staging mode we will see ops that have handles, but since all ops in staging mode could rollback, we don't want to bind those handles, as
		// not binding them prevent attach ops from being created, so rollback is a no-op. On acceptance of the staging mode changes we do a re-submit/rebase
		// of all changes, and at that point we are out of staging mode, so the bind happens then, which basically defers attach op creation until all
		// changes are accepted.
		if (this.runtime.inStagingMode === true) {
			this.deferedHandleMap.set(handle.absolutePath, handle);
		} else {
			//* NEXT: Remove this if-else, since SharedObjectHandle is handling this in its bind method
			bind.bind(handle);
		}
		return encodeHandleForSerialization(handle);
	}
}
