/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, ObjectOptions, TSchema, Type } from "@sinclair/typebox";
import { EncodedJsonableTree } from "../../core";
import { EncodedChangeAtomId } from "../modular-schema";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// When undefined, signifies "self"
export const EncodedContentId = Type.Union([EncodedChangeAtomId, Type.Literal(0)]);
export type EncodedContentId = Static<typeof EncodedContentId>;

export const EncodedBuild = Type.Object(
	{
		id: EncodedChangeAtomId,
		set: EncodedJsonableTree,
	},
	noAdditionalProps,
);
export type EncodedBuild = Static<typeof EncodedBuild>;

export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			b: Type.Optional(Type.Array(EncodedBuild)),
			m: Type.Optional(
				Type.Array(
					Type.Tuple([EncodedContentId, EncodedContentId, Type.Optional(Type.Boolean())]),
				),
			),
			c: Type.Optional(Type.Array(Type.Tuple([EncodedContentId, tNodeChange]))),
			d: Type.Optional(EncodedContentId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;
