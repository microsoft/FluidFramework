/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import {
	EncodedChunkGeneric,
	IdentifierOrIndex,
	ShapeIndex,
	unionOptions,
	Count,
} from "./formatGeneric";

export const version = "unstable-development";

export const EncodedUniformFieldShape = Type.Object(
	{
		key: IdentifierOrIndex,
		count: Count,
		// Currently this shape must correspond to a EncodedUniformTreeShape.
		shape: ShapeIndex,
	},
	{ additionalProperties: false },
);

/**
 * Top level length is implied from length of data array.
 */
export const EncodedUniformChunkShape = Type.Object(
	{
		type: IdentifierOrIndex,
		hasValue: Type.Boolean(),
		local: Type.Array(EncodedUniformFieldShape),
		global: Type.Array(EncodedUniformFieldShape),
	},
	{ additionalProperties: false },
);

// Content of the field is:
// [shape if not provided in fieldShape], [data for one chunk of specified shape]
// If data is in multiple chunks needs to be converted into a single chunk, for example via an array chunk.
export const EncodedFieldShape = Type.Object(
	// If shape is not provided here, it will be provided in the data array.
	{ key: IdentifierOrIndex, shape: Type.Optional(ShapeIndex) },
	{ additionalProperties: false },
);
export type EncodedFieldShape = Static<typeof EncodedFieldShape>;

// Single node.
// Data for this shape starts is in the form:
// [value if present], number of fields, [field identifier index, field chunk count, chunk shape, ...chunk data]*number of fields
export const EncodedBasicShape = Type.Object(
	{
		type: IdentifierOrIndex,
		// TODO: consider replacing booleans with something smaller (optional true value (default false), or even optional numbers)
		// If not specified, encoded data will contain a boolean to indicate if there is a value or not.
		value: Type.Optional(Type.Boolean()),
		local: Type.Array(EncodedFieldShape),
		global: Type.Array(EncodedFieldShape),
		extraGlobalFields: Type.Boolean(),
		extraLocalFields: Type.Boolean(),
	},
	{ additionalProperties: false },
);

// Data in the format:
// length, [shape index, ...[data for shape]]*length
export const EncodedArrayShape = Type.Literal(0);

/**
 * Encoding of a discriminated union that is simply to validate data against.
 *
 * See DiscriminatedUnionDispatcher for more information on this pattern.
 */
export const EncodedChunkShape = Type.Object(
	{
		a: Type.Optional(EncodedUniformChunkShape),
		b: Type.Optional(EncodedBasicShape),
		c: Type.Optional(EncodedArrayShape),
	},
	unionOptions,
);

export type EncodedChunkShape = Static<typeof EncodedChunkShape>;

export type EncodedUniformChunkShape = Static<typeof EncodedUniformChunkShape>;
export type EncodedBasicShape = Static<typeof EncodedBasicShape>;
export type EncodedArrayShape = Static<typeof EncodedArrayShape>;

export const EncodedChunk = EncodedChunkGeneric(version, EncodedChunkShape);
export type EncodedChunk = Static<typeof EncodedChunk>;
