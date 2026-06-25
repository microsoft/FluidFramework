/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "@sinclair/typebox";

import { EncodedChangeAtomId } from "../../core/index.js";

const noAdditionalProps: Type.ObjectOptions = { additionalProperties: false };

// Type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const EncodedOptionalChangeset = <Schema extends Type.TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			/**
			 * Nested changes
			 */
			c: Type.Optional(tNodeChange),

			/**
			 * How to replace the current value of the field.
			 */
			r: Type.Optional(EncodedReplace),

			/**
			 * The ID of the node-targeting detach, if any.
			 */
			d: Type.Optional(EncodedChangeAtomId),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends Type.TSchema> = Type.Static<
	ReturnType<typeof EncodedOptionalChangeset<Schema>>
>;

const EncodedReplace = Type.Object(
	{
		/**
		 * Whether the field is empty in the input context of this change.
		 */
		e: Type.Boolean(),

		/**
		 * The ID for the node to put in this field, or undefined if the field should be emptied.
		 */
		s: Type.Optional(EncodedChangeAtomId),

		/**
		 * An ID to associate with the node (if any) which is detached by this edit.
		 */
		d: EncodedChangeAtomId,
	},
	noAdditionalProps,
);
export type EncodedReplace = Type.Static<typeof EncodedReplace>;
