/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, TSchema, Type } from "@sinclair/typebox";
import { EncodedChangeAtomId } from "../modular-schema/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// `null` signifies "self". Using undefined doesn't actually JSON round-trip conveniently, since
// undefined is converted to null when inside an array (which happens in e.g. the moves array).
export const EncodedRegisterId = Type.Union([EncodedChangeAtomId, Type.Null()]);
export type EncodedRegisterId = Static<typeof EncodedRegisterId>;

export const EncodedBuild = Type.Tuple([EncodedChangeAtomId]);
export type EncodedBuild = Static<typeof EncodedBuild>;

export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			b: Type.Optional(Type.Array(EncodedBuild)),
			m: EncodedMoves,
			c: EncodedChildChanges(tNodeChange),
			d: Type.Optional(EncodedRegisterId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;

const EncodedChildChanges = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Optional(Type.Array(Type.Tuple([EncodedRegisterId, tNodeChange])));

// A list of triplets (source, destination, isNodeTargeting) each representing a move of a node
// from its current source register to a new destination register.
// If the move is node targeting then the intention is to move a specific node which happens to be in the source register.
// Otherwise the intention is to move whatever node happens to be in the source register.
const EncodedMoves = Type.Optional(
	Type.Array(Type.Tuple([EncodedRegisterId, EncodedRegisterId, Type.Optional(Type.Boolean())])),
);
