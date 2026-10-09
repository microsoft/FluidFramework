/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import type { TObjectOptions, Static } from "typebox";

import { typeboxInterface, typeboxOptional } from "../../util/index.js";

import { EncodedModularChangesetV1 } from "./modularChangeFormatV1.js";

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

const EncodedNoChangeConstraint = Type.Object(
	{
		violated: Type.Boolean(),
	},
	noAdditionalProps,
);
export type EncodedNoChangeConstraint = Static<typeof EncodedNoChangeConstraint>;

export const EncodedModularChangesetV2 = typeboxInterface(
	[
		EncodedModularChangesetV1,
		Type.Object(
			{
				/** Global no change constraint that gets violated whenever the changeset is rebased */
				noChangeConstraint: typeboxOptional(EncodedNoChangeConstraint),
			},
			noAdditionalProps,
		),
	],
	{},
	noAdditionalProps,
);

export type EncodedModularChangesetV2 = Static<typeof EncodedModularChangesetV2>;
