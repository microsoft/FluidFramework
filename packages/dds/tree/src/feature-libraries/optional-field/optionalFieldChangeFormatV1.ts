/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, type TSchema, Type } from "@sinclair/typebox";

import { EncodedChangeAtomId } from "../modular-schema/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// `null` signifies "self". Using undefined doesn't actually JSON round-trip conveniently, since
// undefined is converted to null when inside an array (which happens in e.g. the moves array).
export const EncodedRegisterId = Type.Union([EncodedChangeAtomId, Type.Null()]);
export type EncodedRegisterId = Static<typeof EncodedRegisterId>;

export const EncodedBuild = Type.Tuple([EncodedChangeAtomId]);
export type EncodedBuild = Static<typeof EncodedBuild>;

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			// Subtrees being created. They start as detached.
			b: Type.Optional(Type.Array(EncodedBuild)),
			// Subtrees being moved.
			m: EncodedMoves,
			// Nested changes
			c: EncodedChildChanges(tNodeChange),
			// Reserved ID for detaching the subtree from the field if it were to be populated.
			// Only specified when the field is empty.
			d: Type.Optional(EncodedRegisterId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const EncodedChildChanges = <Schema extends TSchema>(tNodeChange: Schema) =>
	// Changes to the children of the node that is in the specified register in the input context of this change.
	Type.Optional(Type.Array(Type.Tuple([EncodedRegisterId, tNodeChange])));

// A list of triplets (source, destination, isNodeTargeting) each representing a move of a node
// from its current source register to a new destination register.
// If the move is node targeting then the intention is to move a specific node which happens to be in the source register.
// Otherwise the intention is to move whatever node happens to be in the source register.
// These entries should not be interpreted as "applied one after the other", but rather as "applied simultaneously".
// As such, changesets should not contain duplicated src or dst entries.
const EncodedMoves = Type.Optional(
	Type.Array(
		Type.Tuple([EncodedRegisterId, EncodedRegisterId, Type.Optional(Type.Boolean())]),
	),
);
