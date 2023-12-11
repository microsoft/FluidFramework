/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, ObjectOptions, TSchema, Type } from "@sinclair/typebox";
import { EncodedChangeAtomId } from "../modular-schema";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// 0 signifies "self". Using undefined doesn't actually JSON round-trip conveniently, since
// undefined is converted to null when inside an array (which happens in e.g. the moves array).
export const EncodedRegisterId = Type.Union([EncodedChangeAtomId, Type.Literal(0)]);
export type EncodedRegisterId = Static<typeof EncodedRegisterId>;

export const EncodedBuild = Type.Tuple([EncodedChangeAtomId]);
export type EncodedBuild = Static<typeof EncodedBuild>;

export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			b: Type.Optional(Type.Array(EncodedBuild)),
			m: Type.Optional(
				Type.Array(
					Type.Tuple([
						EncodedRegisterId,
						EncodedRegisterId,
						Type.Optional(Type.Boolean()),
					]),
				),
			),
			c: Type.Optional(Type.Array(Type.Tuple([EncodedRegisterId, tNodeChange]))),
			d: Type.Optional(EncodedRegisterId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;
