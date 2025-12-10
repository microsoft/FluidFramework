/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { EncodedModularChangesetV1 } from "./modularChangeFormatV1.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const EncodedNoChangeConstraint = Type.Object(
	{
		violated: Type.Boolean(),
	},
	noAdditionalProps,
);
export type EncodedNoChangeConstraint = Static<typeof EncodedNoChangeConstraint>;

export const EncodedModularChangesetV2 = Type.Composite(
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

export type EncodedModularChangesetV2 = Static<typeof EncodedModularChangesetV2>;
