/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, TSchema, Type } from "@sinclair/typebox";

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

/**
 * Options to configure a TypeBox schema as a discriminated union that is simple to validate data against.
 *
 * See DiscriminatedUnionDispatcher for more information on this pattern.
 */
export const unionOptions: ObjectOptions = {
	additionalProperties: false,
	minProperties: 1,
	maxProperties: 1,
};

const EncodedChunkBase = Type.Object(
	{
		version: Type.Number(),
		identifiers: Type.Array(Type.String()),
		// TreeValues mixed with indexes into "shapes" and occasional lengths (for specific shapes that require them).
		data: Type.Array(Type.Any()),
	},
	{ additionalProperties: false },
);

/**
 * Format for encoding a tree chunk.
 * @param version - format version. Must be changed if there is any change to the generic schema, or the `shape` schema.
 * @param shape - schema for union of shape format, see {@link DiscriminatedUnionDispatcher}.
 */
export const EncodedChunkGeneric = <TShapeSchema extends TSchema>(
	version: number,
	shape: TShapeSchema,
) =>
	Type.Composite(
		[
			EncodedChunkBase,
			Type.Object({
				version: Type.Literal(version),
				shapes: Type.Array(shape),
			}),
		],
		{ additionalProperties: false },
	);

export interface EncodedChunkGeneric<TEncodedShape> extends Static<typeof EncodedChunkBase> {
	shapes: TEncodedShape[];
}
