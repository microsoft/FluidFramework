/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, type TSchema, Type } from "@sinclair/typebox";

import { EncodedChangeAtomId } from "../modular-schema/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// Type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			// Moves between detached fields.
			// These entries should not be interpreted as "applied one after the other", but rather as
			// "applied simultaneously". As such, this list should not contain duplicated src or dst entries.
			m: Type.Optional(Type.Array(EncodedMove)),
			// Nested changes
			c: Type.Optional(tNodeChange),
			// How to replace the current value of the field.
			r: Type.Optional(EncodedReplace),

			// The detach ID for a node targeting detach, if any.
			d: Type.Optional(EncodedChangeAtomId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;

// A list of triplets (source, destination, isNodeTargeting) each representing a move of a node
// from its current source register to a new destination register.
// If the move is node targeting then the intention is to move a specific node which happens to be in the source register.
// Otherwise the intention is to move whatever node happens to be in the source register.
// These entries should not be interpreted as "applied one after the other", but rather as "applied simultaneously".
// As such, changesets should not contain duplicated src or dst entries.
const EncodedMove = Type.Tuple([EncodedChangeAtomId, EncodedChangeAtomId]);

const EncodedReplace = Type.Object(
	{
		// Whether the field is empty in the input context of this change.
		e: Type.Boolean(),
		// The ID for the node to put in this field, or undefined if the field should be emptied.
		s: Type.Optional(EncodedChangeAtomId),
		// An ID to associate with the node (if any) which is detached by this edit.
		d: EncodedChangeAtomId,
	},
	noAdditionalProps,
);
export type EncodedReplace = Static<typeof EncodedReplace>;
