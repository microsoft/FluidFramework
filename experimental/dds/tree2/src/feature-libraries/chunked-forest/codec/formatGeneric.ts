/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, TSchema, Type } from "@sinclair/typebox";

// Identifier OR Index of an identifier in the identifier list.
export const IdentifierOrIndex = Type.Union([
	Type.String(),
	Type.Number({ multipleOf: 1, minimum: 0 }),
]);

export const ShapeIndex = Type.Number({ multipleOf: 1, minimum: 0 });
export type ShapeIndex = Static<typeof ShapeIndex>;

export const Count = Type.Number({ multipleOf: 1, minimum: 0 });

/**
 * Encoding of a discriminated union that is simple to validate data against.
 *
 * See DiscriminatedUnionDispatcher for more information on this pattern.
 */
export const unionOptions = {
	additionalProperties: false,
	minProperties: 1,
	maxProperties: 1,
};

const EncodedChunkBase = Type.Object(
	{
		version: Type.String(),
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
	version: string,
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
