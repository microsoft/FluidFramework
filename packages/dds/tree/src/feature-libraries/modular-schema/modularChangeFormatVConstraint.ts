/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { EncodedFieldChange, EncodedModularChangesetV1 } from "./modularChangeFormatV1.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const EncodedNoChangeConstraint = Type.Object(
	{
		violated: Type.Boolean(),
	},
	noAdditionalProps,
);
export type EncodedNoChangeConstraint = Static<typeof EncodedNoChangeConstraint>;

const EncodedFieldShallowChangeConstraint = Type.Object(
	{
		violated: Type.Boolean(),
	},
	noAdditionalProps,
);
export type EncodedFieldShallowChangeConstraint = Static<
	typeof EncodedFieldShallowChangeConstraint
>;

export const EncodedFieldChangeVConstraint = Type.Composite(
	[
		EncodedFieldChange,
		Type.Object(
			{
				fieldShallowChangeConstraint: Type.Optional(EncodedFieldShallowChangeConstraint),
				hasIntermediateShallowChanges: Type.Optional(Type.Boolean()),
			},
			noAdditionalProps,
		),
	],
	noAdditionalProps,
);
export interface EncodedFieldChangeVConstraint
	extends Static<typeof EncodedFieldChangeVConstraint> {}

export const EncodedFieldChangeMapVConstraint = Type.Array(EncodedFieldChangeVConstraint);
export type EncodedFieldChangeMapVConstraint = Static<typeof EncodedFieldChangeMapVConstraint>;

export const EncodedModularChangesetVConstraint = Type.Composite(
	[
		EncodedModularChangesetV1,
		Type.Object(
			{
				/** Global no change constraint that gets violated whenever the changeset is rebased */
				noChangeConstraint: Type.Optional(EncodedNoChangeConstraint),
			},
			noAdditionalProps,
		),
	],
	noAdditionalProps,
);

export type EncodedModularChangesetVConstraint = Static<
	typeof EncodedModularChangesetVConstraint
>;
