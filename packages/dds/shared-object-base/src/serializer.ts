/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// RATIONALE: Many methods consume and return 'any' by necessity.
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { RemoteFluidObjectHandle } from "./remoteObjectHandle";

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
 * @internal
 */
export const isSerializedHandle = (value: any): value is ISerializedHandle =>
	value?.type === "__fluid_handle__";

/**
 * @internal
 */
export interface IFluidSerializer {
	/**
	 * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
	 * where any embedded IFluidHandles have been replaced with a serializable form.
	 *
	 * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
	 * the root to any replaced handles.  (If no handles are found, returns the original object.)
	 */
	encode(value: any, bind: IFluidHandle): any;

	/**
	 * Given a fully-jsonable object tree that may have encoded handle objects embedded within, will return an
	 * equivalent object tree where any encoded IFluidHandles have been replaced with their decoded form.
	 *
	 * The original `input` object is not mutated.  This method will shallowly clone all objects in the path from
	 * the root to any replaced handles.  (If no handles are found, returns the original object.)
	 *
	 * The decoded handles are implicitly bound to the handle context of this serializer.
	 */
	decode(input: any): any;

	/**
	 * Stringifies a given value. Converts any IFluidHandle to its stringified equivalent.
	 */
	stringify(value: any, bind: IFluidHandle): string;

	/**
	 * Parses the given JSON input string and returns the JavaScript object defined by it. Any Fluid
	 * handles will be realized as part of the parse
	 */
	parse(value: string): any;
}

/**
 * Use for readonly view of Json compatible data that can also contain {@link @fluidframework/core-interfaces#IFluidHandle}s.
 *
 * To be "Json compatible" requires that the data is acyclic.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to the json compatible subset.
 *
 * See also {@link isFluidHandle}.
 *
 * Warning: Objects with a key "type" and value "__fluid_handle__" will not round trip correctly through `FluidSerializer`
 * (due to decodeValue's use of isSerializedHandle causing them to be wrongly parsed as handles) and should be avoided.
 * @internal
 */
export type FluidSerializableReadOnly =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly FluidSerializableReadOnly[]
	| { readonly [P in string]?: FluidSerializableReadOnly };

/**
 * Check if a value in {@link FluidSerializableReadOnly} data is an {@link @fluidframework/core-interfaces#IFluidHandle}.
 *
 * Warning: Non-IFluidHandle objects with a key "IFluidHandle" will cause an assert.
 * Prior to version 2.0.0-internal.7.4.0, they were unconditionally interpreted as IFluidHandle.
 *
 * @remarks
 * Its possible to have serializable data that looks like an {@link @fluidframework/core-interfaces#IFluidHandle} but isn't one.
 * This function cannot distinguish these from real IFluidHandles in all cases: changes to the IFluidHandle would be required to ensure this is always possible.
 *
 * For now this is a best effort implementation.
 *
 * @privateRemarks
 * Any of the following changes to IFluidHandle would solve the ambiguity problem:
 *
 * - The "IFluidHandle" property could be required to be a cyclic reference back to the parent.
 *
 * - IFluidHandle could be made into a class which could be detected with `instanceof`.
 *
 * - IFluidHandle could be identified using a dedicated symbol.
 *
 * @internal
 */
export function isFluidHandle(value: undefined | FluidSerializableReadOnly): value is IFluidHandle {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const partialHandle = value as Partial<IFluidHandle>;
	const innerHandle = partialHandle.IFluidHandle;
	if (innerHandle === undefined) {
		return false;
	}

	// At this point, the value is known to be an object with an IFluidHandle.
	// This function will heuristically validate that object really is an IFluidHandle.
	// If the object fails this check, it will assert to detect problematic data that would have incorrectly been treated as a handle in previous versions of the serializer.

	// Since json compatible data shouldn't have methods, and IFluidHandle requires one, use that as a redundant check:
	const getMember = (value as Partial<IFluidHandle>).get;
	assert(
		typeof getMember === "function",
		"Fluid handle detection found IFluidHandle field, but not have a get method",
	);

	// If the handle is not a cyclic reference, validate the inner one as well:
	if (value !== innerHandle) {
		assert(
			typeof innerHandle === "object" && innerHandle !== null,
			"Fluid handle detection found IFluidHandle field, but it was not an object",
		);

		assert(
			innerHandle.IFluidHandle?.IFluidHandle?.IFluidHandle?.IFluidHandle !== undefined,
			"Fluid handle detection found IFluidHandle field, but it did not have IFluidHandle members recursively",
		);

		const innerGetMember = (innerHandle as Partial<IFluidHandle>).get;
		assert(
			typeof innerGetMember === "function",
			"Fluid handle detection found IFluidHandle field, but it did not have a get method",
		);
	}

	return true;
}

/**
 * Data Store serializer implementation.
 *
 * @privateRemarks
 * Since this type is package exported (not just the Interface above),
 * updating the types to use FluidSerializableReadOnly will be a breaking change:
 * updating these APIs, (and the IFluidSerializer), as well as possible removing this type from the package exports
 * will need to be done as a breaking change on next.
 */
export class FluidSerializer implements IFluidSerializer {
	private readonly root: IFluidHandleContext;

	public constructor(
		private readonly context: IFluidHandleContext,
		// To be called whenever a handle is parsed by this serializer.
		private readonly handleParsedCb: (handle: IFluidHandle) => void,
	) {
		this.root = this.context;
		while (this.root.routeContext !== undefined) {
			this.root = this.root.routeContext;
		}
	}

	public get IFluidSerializer() {
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
	public encode(input: any, bind: IFluidHandle) {
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
	public decode(input: any) {
		// If the given 'input' cannot contain handles, return it immediately.  Otherwise,
		// return the result of 'recursivelyReplace()'.
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		return !!input && typeof input === "object"
			? this.recursivelyReplace(input, this.decodeValue)
			: input;
	}

	public stringify(input: unknown, bind: IFluidHandle) {
		return JSON.stringify(input, (key, value) => this.encodeValue(value, bind));
	}

	// Parses the serialized data - context must match the context with which the JSON was stringified
	public parse(input: string) {
		return JSON.parse(input, (key, value) => this.decodeValue(value));
	}

	// If the given 'value' is an IFluidHandle, returns the encoded IFluidHandle.
	// Otherwise returns the original 'value'.  Used by 'encode()' and 'stringify()'.
	private readonly encodeValue = (value: FluidSerializableReadOnly, bind: IFluidHandle) => {
		// Detect if 'value' is an IFluidHandle.
		// To help detect if the limitation of this old handle detection was impacting behavior, keep it around for now:
		const isHandleLegacy = (value as Partial<IFluidHandle>)?.IFluidHandle !== undefined;
		const isHandle = isFluidHandle(value);
		assert(isHandleLegacy === isHandle, "new isFluidHandle should not change existing policy.");

		// If 'value' is an IFluidHandle return its encoded form.
		return isHandle ? this.serializeHandle(value, bind) : value;
	};

	// If the given 'value' is an encoded IFluidHandle, returns the decoded IFluidHandle.
	// Otherwise returns the original 'value'.  Used by 'decode()' and 'parse()'.
	private readonly decodeValue = (value: any) => {
		// If 'value' is a serialized IFluidHandle return the deserialized result.
		if (isSerializedHandle(value)) {
			// Old documents may have handles with relative path in their summaries. Convert these to absolute
			// paths. This will ensure that future summaries will have absolute paths for these handles.
			const absolutePath = value.url.startsWith("/")
				? value.url
				: generateHandleContextPath(value.url, this.context);

			const parsedHandle = new RemoteFluidObjectHandle(absolutePath, this.root);
			this.handleParsedCb(parsedHandle);
			return parsedHandle;
		} else {
			return value;
		}
	};

	// Invoked for non-null objects to recursively replace references to IFluidHandles.
	// Clones as-needed to avoid mutating the `input` object.  If no IFluidHandes are present,
	// returns the original `input`.
	private recursivelyReplace(
		input: any,
		replacer: (input: any, context: any) => any,
		context?: any,
	) {
		// Note: Caller is responsible for ensuring that `input` is defined / non-null.
		//       (Required for Object.keys() below.)

		// Execute the `replace` on the current input.  Note that Caller is responsible for ensuring that `input`
		// is a non-null object.
		const maybeReplaced = replacer(input, context);

		// If the replacer made a substitution there is no need to decscend further. IFluidHandles are always
		// leaves in the object graph.
		if (maybeReplaced !== input) {
			return maybeReplaced;
		}

		// Otherwise descend into the object graph looking for IFluidHandle instances.
		let clone: object | undefined;
		for (const key of Object.keys(input)) {
			const value = input[key];
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
					clone = clone ?? (Array.isArray(input) ? [...input] : { ...input });

					// Overwrite the current property `key` in the clone with the `replaced` value.
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					clone![key] = replaced;
				}
			}
		}
		return clone ?? input;
	}

	protected serializeHandle(handle: IFluidHandle, bind: IFluidHandle) {
		bind.bind(handle);
		return {
			type: "__fluid_handle__",
			url: handle.absolutePath,
		};
	}
}
