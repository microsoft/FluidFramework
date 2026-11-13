/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import * as Type from "typebox/type";
import type { TObjectOptions, TSchema } from "typebox";

import { SessionIdSchema } from "../core/index.js";

import {
	EditManagerFormatVersion,
	type EncodedSequencedCommit,
	type EncodedSummarySessionBranch,
	SequencedCommit,
	SummarySessionBranch,
} from "./editManagerFormatCommons.js";

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

/**
 * The EditManager summary in {@link EditManagerFormatVersion.vHistoryCompaction}.
 * @remarks
 * Same as {@link EditManagerFormatVersion.v7}, plus the commits preserved from history compaction.
 */
export interface EncodedEditManager<TChangeset> {
	readonly trunk: readonly Readonly<EncodedSequencedCommit<TChangeset>>[];
	readonly branches: readonly [SessionId, Readonly<EncodedSummarySessionBranch<TChangeset>>][];
	readonly version: typeof EditManagerFormatVersion.vHistoryCompaction;
	/**
	 * Indices into {@link EncodedEditManager.trunk} of the commits that are preserved from history compaction.
	 * @remarks
	 * Indices are used instead of revision tags because they are compact and can only refer to commits that are in the summary.
	 */
	readonly preservedTrunkIndices: readonly number[];
}

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const EncodedEditManager = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			version: Type.Literal(EditManagerFormatVersion.vHistoryCompaction),
			trunk: Type.Array(SequencedCommit(tChange, true)),
			branches: Type.Array(Type.Tuple([SessionIdSchema, SummarySessionBranch(tChange, true)])),
			preservedTrunkIndices: Type.Array(Type.Integer({ minimum: 0 })),
		},
		noAdditionalProps,
	);
