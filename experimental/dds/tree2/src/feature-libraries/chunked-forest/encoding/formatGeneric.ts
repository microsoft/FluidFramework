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

export const Count = Type.Number({ multipleOf: 1, minimum: 0 });

/**
 * Encoding of a discriminated union that is simply to validate data against.
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
		identifiers: Type.Array(Type.String()),
		// TreeValues mixed with indexes into "shapes" and occasional lengths (for specific shapes that require them).
		data: Type.Array(Type.Any()),
	},
	{ additionalProperties: false },
);

export const EncodedChunkGeneric = <TShapeSchema extends TSchema>(shape: TShapeSchema) =>
	Type.Composite(
		[
			EncodedChunkBase,
			Type.Object({
				shapes: Type.Array(shape),
			}),
		],
		{ additionalProperties: false },
	);

export interface EncodedChunkGeneric<TEncodedShape> extends Static<typeof EncodedChunkBase> {
	shapes: TEncodedShape[];
}
