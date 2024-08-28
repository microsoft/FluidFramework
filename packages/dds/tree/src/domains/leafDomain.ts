/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema } from "../core/index.js";
import { LeafNodeSchema } from "../feature-libraries/index.js";

/**
 * Define a {@link TreeNodeSchema} for a node that wraps a value.
 * Such nodes will be implicitly unwrapped to the value in some APIs.
 *
 * The name must be unique among all TreeNodeSchema in the the document schema.
 *
 * In addition to the normal properties of all nodes (having a schema for example),
 * Leaf nodes only contain a value.
 * Leaf nodes cannot have fields.
 *
 * TODO: Maybe ban undefined from allowed values here.
 * TODO: Decide and document how unwrapping works for non-primitive terminals.
 */
function makeLeaf(name: string, t: ValueSchema): LeafNodeSchema {
	// Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation
	return new LeafNodeSchema({ name: "makeLeaf" }, `com.fluidframework.leaf.${name}`, t);
}

const number = makeLeaf("number", ValueSchema.Number);
const boolean = makeLeaf("boolean", ValueSchema.Boolean);
const string = makeLeaf("string", ValueSchema.String);
const handle = makeLeaf("handle", ValueSchema.FluidHandle);
const nullSchema = makeLeaf("null", ValueSchema.Null);

const primitives = [number, boolean, string] as const;
const all = [handle, nullSchema, ...primitives] as const;

/**
 * Built-in {@link LeafNodeSchema}.
 */
export const leaf = {
	/**
	 * {@link LeafNodeSchema} for holding a JavaScript `number`.
	 *
	 * @remarks
	 * The number is a [double-precision 64-bit binary format IEEE 754](https://en.wikipedia.org/wiki/Double-precision_floating-point_format) value, however there are some exceptions:
	 * - `NaN`, and the infinities should not be used.
	 * - `-0` may be converted to `0` in some cases.
	 *
	 * These limitations match the limitations of JSON.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	number,

	/**
	 * {@link LeafNodeSchema} for holding a boolean.
	 */
	boolean,

	/**
	 * {@link LeafNodeSchema} for holding a JavaScript `string`.
	 *
	 * @remarks
	 * Strings containing unpaired UTF-16 surrogate pair code units may not be handled correctly.
	 *
	 * These limitations come from the use of UTF-8 encoding of the strings, which requires them to be valid unicode.
	 * JavaScript does not make this requirement for its strings so not all possible JavaScript strings are supported.
	 * @privateRemarks
	 * TODO:
	 * We should be much more clear about what happens if you use problematic values.
	 * We should validate and/or normalize them when inserting content.
	 */
	string,

	/**
	 * {@link LeafNodeSchema} for holding an {@link @fluidframework/core-interfaces#(IFluidHandle:interface)}.
	 */
	handle,

	/**
	 * {@link LeafNodeSchema} for JavaScript `null`.
	 *
	 * @remarks
	 * There are good [reasons to avoid using null](https://www.npmjs.com/package/%40rushstack/eslint-plugin#rushstackno-new-null) in JavaScript, however sometimes it is desired.
	 * This {@link LeafNodeSchema} node provides the option to include nulls in trees when desired.
	 * Unless directly inter-operating with existing data using null, consider other approaches, like wrapping the value in an optional field, or using a more specifically named empty object node.
	 */
	null: nullSchema,

	/**
	 * The set of {@link LeafNodeSchema} which correspond to JavaScript primitive (non-object) types.
	 */
	primitives,

	/**
	 * All {@link LeafNodeSchema} defined in this library..
	 */
	all,
};
