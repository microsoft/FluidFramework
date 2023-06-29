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

/**
 * Top level length is implied from length of data array.
 * All content are of this shape.
 */
export const EncodedNestedArray = ShapeIndex;

/**
 * Inline array.
 */
export const EncodedInlineArray = Type.Object(
	{
		length: Count,
		/**
		 * All entries are this shape.
		 */
		shape: ShapeIndex,
	},
	{ additionalProperties: false },
);

/**
 * Encoded as `shape, ...[data for shape]`.
 *
 * Used for polymorphism.
 */
export const EncodedAnyShape = Type.Literal(0);

// Content of the field is:
// [shape if not provided in fieldShape], [data for one chunk of specified shape]
// If data is in multiple chunks needs to be converted into a single chunk, for example via an array chunk.
export const EncodedFieldShape = Type.Object(
	{
		/**
		 * Field key for this field.
		 */
		key: IdentifierOrIndex,
		/**
		 * Shape of data in this field.
		 */
		shape: ShapeIndex,
	},
	{ additionalProperties: false },
);
export type EncodedFieldShape = Static<typeof EncodedFieldShape>;

enum CounterRelativeTo {
	// Relative to previous node of same type in depth first pre-order traversal.
	PreviousNodeOfType_DepthFirstPreOrder,
	// TODO: add alternative relative mode relative to previous note at a path to allow delta encoded sequences (like points where x and y are delta encoded relative to previous points).
}

enum CounterMode {
	Number,
	// TODO: document wrap modes and bit skipping. Note UUID subVersion here (ex: UUIDv4)
	UUID,
}

/**
 * Delta encoded value relative to a previous node's value.
 */
export const EncodedCounter = Type.Object(
	{
		relativeTo: Type.Enum(CounterRelativeTo),
		// If not provided, delta inline in data.
		delta: Type.Optional(Type.Number()),
		mode: Type.Enum(CounterMode),
	},
	{ additionalProperties: false },
);

/**
 * If not specified, encoded data will contain a boolean to indicate if there is a value or not.
 * If array, content is the value on the node.
 */
export const EncodedValueShape = Type.Union([
	Type.Boolean(),
	Type.Array(Type.Any(), { minItems: 1, maxItems: 1 }),
	// TODO: support delta encoding and/or special node identifier handling
	// EncodedCounter,
]);
export type EncodedValueShape = undefined | Static<typeof EncodedValueShape>;

export const EncodedTreeShape = Type.Object(
	{
		/**
		 * If not provided, inline in data.
		 */
		type: Type.Optional(IdentifierOrIndex),
		value: Type.Optional(EncodedValueShape),
		local: Type.Array(EncodedFieldShape),
		global: Type.Array(EncodedFieldShape),
		/**
		 * If undefined, no data. Otherwise, nested array of `[key, ...data]*`
		 */
		extraLocal: Type.Optional(ShapeIndex),
		/**
		 * If undefined, no data. Otherwise, nested array of `[key, ...data]*`
		 */
		extraGlobal: Type.Optional(ShapeIndex),
	},
	{ additionalProperties: false },
);

/**
 * Discriminated union of chunk shapes.
 *
 * See DiscriminatedUnionDispatcher for more information on this pattern.
 */
export const EncodedChunkShape = Type.Object(
	{
		/**
		 * {@link EncodedNestedArray} union member.
		 */
		a: Type.Optional(EncodedNestedArray),
		/**
		 * {@link EncodedInlineArray} union member.
		 */
		b: Type.Optional(EncodedInlineArray),
		/**
		 * {@link EncodedTreeShape} union member.
		 */
		c: Type.Optional(EncodedTreeShape),
		/**
		 * {@link EncodedAnyShape} union member.
		 */
		d: Type.Optional(EncodedAnyShape),
	},
	unionOptions,
);

export type EncodedChunkShape = Static<typeof EncodedChunkShape>;

export type EncodedNestedArray = Static<typeof EncodedNestedArray>;
export type EncodedInlineArray = Static<typeof EncodedInlineArray>;
export type EncodedTreeShape = Static<typeof EncodedTreeShape>;
export type EncodedAnyShape = Static<typeof EncodedAnyShape>;

export const EncodedChunk = EncodedChunkGeneric(version, EncodedChunkShape);
export type EncodedChunk = Static<typeof EncodedChunk>;
