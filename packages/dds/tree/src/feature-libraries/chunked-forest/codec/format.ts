/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { unionOptions } from "../../../codec/index.js";

import {
	Count,
	EncodedFieldBatchGeneric,
	IdentifierOrIndex,
	ShapeIndex,
} from "./formatGeneric.js";

export const version = 1;

// Compatible versions used for format/version validation.
// TODO: A proper version update policy will need to be documented.
export const validVersions = new Set([version]);

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

/**
 * Content of the encoded field is specified by the Shape referenced by the ShapeIndex.
 * This is a tuple for conciseness.
 */
export const EncodedFieldShape = Type.Tuple([
	/**
	 * Field key for this field.
	 */
	IdentifierOrIndex,
	/**
	 * Shape of data in this field.
	 */
	ShapeIndex,
]);

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
 * Used in {@link EncodedValueShape} for special field kind handling.
 */
export enum SpecialField {
	/**
	 * Special case for Identifier field kind.
	 */
	Identifier = 0,
}

/**
 * Shape of a value on a node.
 *
 * Due to limitations of TypeBox and differences between JavaScript objects, TypeScript types and JSON,
 * the case where no information about the value is captured in the shape is a bit confusing.
 * In TypeBox this is allowed by the user of this type putting it in an optional property.
 * In TypeScript it is modeled using `undefined`.
 * In JavaScript the property may be missing or explicitly `undefined`.
 * In JSON this will serialize as the property being omitted.
 * In this case, the value will be encoded as either:
 *
 * - `false` (when there is no value) OR
 *
 * - `true, value` when there is a value.
 *
 * For a more compact encoding, there are 4 options for the shape:
 *
 * - `true`: there is a value, and it will simply be encoded by putting it in the output buffer (so `value`).
 *
 * - `false`: there is never a value, and it takes up no space in the output buffer.
 *
 * - `[value]`: there is a value, and its always the same.
 * Takes up no space in the output buffer: the value comes from the shape arrays's content.
 * It is wrapped in an array to differentiate value shape types.
 *
 * - `SpecialField.Identifier`: special case for node identifier handling.
 * It takes up 1 space in the output buffer.
 * If it's a string, it is a decompressed identifier.
 * If it's a number, it is an OpSpaceCompressedId.
 *
 * In the future other value shape formats may be added, likely as objects.
 *
 * @remarks
 * See {@link EncodedTreeShape} for usage.
 */
export const EncodedValueShape = Type.Union([
	Type.Boolean(),
	Type.Array(Type.Any(), { minItems: 1, maxItems: 1 }),
	Type.Enum(SpecialField),
	// TODO: support delta encoding and/or special node identifier handling
	// EncodedCounter,
]);
export type EncodedValueShape = undefined | Static<typeof EncodedValueShape>;

export const EncodedTreeShape = Type.Object(
	{
		/**
		 * If not provided, inlined in data.
		 */
		type: Type.Optional(IdentifierOrIndex),
		value: Type.Optional(EncodedValueShape),
		/**
		 * Fields with fixed (per key) shapes.
		 * They are encoded in the order they are specified here.
		 * To ensure the order is preserved, this is an array instead of an object with keys.
		 */
		fields: Type.Optional(Type.Array(EncodedFieldShape)),
		/**
		 * If undefined, no data. Otherwise, nested array of `[key, ...data]*`
		 * Covers any fields beyond those in `fields`.
		 */
		extraFields: Type.Optional(ShapeIndex),
	},
	{ additionalProperties: false },
);

/**
 * Discriminated union of chunk shapes.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
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

export const EncodedFieldBatch = EncodedFieldBatchGeneric(version, EncodedChunkShape);
export type EncodedFieldBatch = Static<typeof EncodedFieldBatch>;
