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
			// Nested changes
			c: Type.Optional(tNodeChange),

			// How to replace the current value of the field.
			r: Type.Optional(EncodedReplace),

			// Node detach
			d: Type.Optional(EncodedChangeAtomId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;

const EncodedReplace = Type.Object(
	{
		// Whether the field is empty in the input context of this change.
		e: Type.Boolean(),
		// The ID for the node to put in this field, or undefined if the field should be emptied.
		// Will be "self" when the intention is to keep the current node in this field.
		s: Type.Optional(EncodedChangeAtomId),
		// An ID to associate with the node (if any) which is detached by this edit.
		d: EncodedChangeAtomId,
	},
	noAdditionalProps,
);
export type EncodedReplace = Static<typeof EncodedReplace>;
