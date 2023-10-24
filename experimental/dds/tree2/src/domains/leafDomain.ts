/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilderInternal } from "../feature-libraries";
import { ValueSchema } from "../core";

/**
 * Names in this domain follow https://en.wikipedia.org/wiki/Reverse_domain_name_notation
 */
const builder = new SchemaBuilderInternal({ scope: "com.fluidframework.leaf" });

const number = builder.leaf("number", ValueSchema.Number);
const boolean = builder.leaf("boolean", ValueSchema.Boolean);
const string = builder.leaf("string", ValueSchema.String);
const handle = builder.leaf("handle", ValueSchema.FluidHandle);
const nullSchema = builder.leaf("null", ValueSchema.Null);

const primitives = [number, boolean, string] as const;
const all = [handle, nullSchema, ...primitives] as const;

const library = builder.intoLibrary();

/**
 * Schema for the built-in {@link Leaf} node types.
 * @alpha
 */
export const leaf = {
	/**
	 * {@link TreeNodeSchema} for a {@link Leaf} holding a JavaScript `number`.
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
	 * {@link TreeNodeSchema} for a {@link Leaf} holding a boolean.
	 */
	boolean,

	/**
	 * {@link TreeNodeSchema} for a {@link Leaf} holding a JavaScript `string`.
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
	 * {@link TreeNodeSchema} for a {@link Leaf} holding an {@link @fluidframework/core-interfaces#IFluidHandle}.
	 */
	handle,

	/**
	 * JavaScript `null`.
	 *
	 * @remarks
	 * There are good [reasons to avoid using null](https://www.npmjs.com/package/%40rushstack/eslint-plugin#rushstackno-new-null) in JavaScript, however sometimes it is desired.
	 * This {@link Leaf} node provide the option to include nulls in trees when desired.
	 * Unless directly inter-operating with existing data using null, consider other approaches, like wrapping the value in an optional field, or using a more specifically named empty object node.
	 */
	null: nullSchema,

	/**
	 * The set of leaf schema which correspond to JavaScript primitive (non-object) types.
	 */
	primitives,

	/**
	 * Types allowed as roots of Json content.
	 */
	all,

	/**
	 * {@link SchemaLibrary} of the Leaf Schema types.
	 *
	 * @remarks
	 * This is included by default in schema produced with {@link SchemaBuilder}.
	 */
	library,
};
