/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, TSchema, Type } from "@sinclair/typebox";

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
 * @param version - format version. Must be changed if there is any change to the generic schema, or the `shape` schema.
 * @param shape - schema for union of shape format, see {@link DiscriminatedUnionDispatcher}.
 */
export const EncodedFieldBatchGeneric = <TShapeSchema extends TSchema>(
	version: number,
	shape: TShapeSchema,
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
}
