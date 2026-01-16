/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, type TSchema, Type } from "@sinclair/typebox";
import type { FieldBatchFormatVersion } from "./format.js";

/**
 * Identifier OR Index of an identifier in the identifier list.
 */
export const IdentifierOrIndex = Type.Union([
	Type.String(),
	Type.Number({ multipleOf: 1, minimum: 0 }),
]);
export type IdentifierOrIndex = Static<typeof IdentifierOrIndex>;

/**
 * Reference to a shape, by index.
 *
 * Shapes use a dictionary encoding where they are referenced by their index in a shape array.
 */
export const ShapeIndex = Type.Number({ multipleOf: 1, minimum: 0 });
export type ShapeIndex = Static<typeof ShapeIndex>;

export const Count = Type.Number({ multipleOf: 1, minimum: 0 });

const EncodedFieldBatchBase = Type.Object(
	{
		version: Type.Number(),
		identifiers: Type.Array(Type.String()),
		/**
		 * Top level array is list of field from batch.
		 * Inner are TreeValues mixed with indexes into "shapes" and nested arrays where lengths are needed.
		 */
		data: Type.Array(Type.Array(Type.Any())),
	},
	{ additionalProperties: false },
);

/**
 * Format for encoding a tree chunk.
 * @param version - format version.
 * Must be changed if the previously existing decode logic will not correctly handle the new encoding.
 * If adding a new encoding version which does not use this format,
 * this parameter should be retyped to be a union of the subset of FieldBatchFormatVersion values which this supports.
 * @param shape - schema for union of shape format, see {@link DiscriminatedUnionDispatcher}.
 */
export const EncodedFieldBatchGeneric = <TShapeSchema extends TSchema>(
	version: FieldBatchFormatVersion,
	shape: TShapeSchema,
	// Return type is intentionally derived.
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) =>
	Type.Composite(
		[
			EncodedFieldBatchBase,
			Type.Object({
				version: Type.Literal(version),
				shapes: Type.Array(shape),
			}),
		],
		{ additionalProperties: false },
	);

export interface EncodedFieldBatchGeneric<TEncodedShape>
	extends Static<typeof EncodedFieldBatchBase> {
	shapes: TEncodedShape[];
	version: FieldBatchFormatVersion;
}
