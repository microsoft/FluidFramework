/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import { type ObjectOptions, type TSchema, Type } from "@sinclair/typebox";

import { SessionIdSchema } from "../core/index.js";
import {
	type EncodedSummarySessionBranch,
	SequencedCommit,
	SummarySessionBranch,
} from "./editManagerFormatCommons.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

export interface EncodedEditManager<TChangeset> {
	readonly trunk: readonly Readonly<SequencedCommit<TChangeset>>[];
	readonly branches: readonly [SessionId, Readonly<EncodedSummarySessionBranch<TChangeset>>][];
	readonly version: 1 | 2 | 3 | 4;
}

export const EncodedEditManager = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			version: Type.Union([
				Type.Literal(1),
				Type.Literal(2),
				Type.Literal(3),
				Type.Literal(4),
			]),
			trunk: Type.Array(SequencedCommit(tChange)),
			branches: Type.Array(Type.Tuple([SessionIdSchema, SummarySessionBranch(tChange)])),
		},
		noAdditionalProps,
	);

/* eslint-enable @typescript-eslint/explicit-function-return-type */
