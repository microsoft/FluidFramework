/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CodecAndSchema, IJsonCodec, Versioned } from "../codec/index.js";
import type { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../core/index.js";
import {
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
} from "../util/index.js";

import type { SummaryData } from "./editManager.js";
import type {
	EditManagerDecodingContext,
	EditManagerEncodingContext,
} from "./editManagerCodecsCommons.js";
import { makeV1toV4andV6CodecWithVersion } from "./editManagerCodecsV1toV4.js";
import { EditManagerFormatVersion } from "./editManagerFormatCommons.js";
import { EncodedEditManager } from "./editManagerFormatVHistoryCompaction.js";

/**
 * Creates the {@link EditManager} codec for {@link EditManagerFormatVersion.vHistoryCompaction}.
 * @remarks
 * Encodes the same data as {@link EditManagerFormatVersion.v7},
 * plus {@link SummaryData.preservedRevisions} stored as indices into the encoded trunk.
 * Preserved revisions that are not in the summarized trunk are dropped.
 */
export function makeHistoryCompactionEditManagerCodec<TChangeset>(
	changeCodec: IJsonCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): CodecAndSchema<
	SummaryData<TChangeset>,
	EditManagerEncodingContext<TChangeset>,
	EditManagerDecodingContext
> {
	const inner = makeV1toV4andV6CodecWithVersion(
		changeCodec,
		revisionTagCodec,
		EditManagerFormatVersion.v7,
	);
	return {
		schema: EncodedEditManager(changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema),
		encode: (
			data: SummaryData<TChangeset>,
			context: EditManagerEncodingContext<TChangeset>,
		): EncodedEditManager<TChangeset> & Versioned & JsonCompatibleReadOnlyObject => {
			const encoded = inner.encode(data, context) as unknown as EncodedEditManager<TChangeset>;
			const preserved = new Set(data.preservedRevisions ?? []);
			const preservedTrunkIndices: number[] = [];
			for (const [index, commit] of data.main.trunk.entries()) {
				if (preserved.has(commit.revision)) {
					preservedTrunkIndices.push(index);
				}
			}
			return {
				...encoded,
				version: EditManagerFormatVersion.vHistoryCompaction,
				preservedTrunkIndices,
			} as unknown as EncodedEditManager<TChangeset> &
				Versioned &
				JsonCompatibleReadOnlyObject;
		},
		decode: (
			json: EncodedEditManager<TChangeset> & JsonCompatibleReadOnly,
			context: EditManagerDecodingContext,
		): SummaryData<TChangeset> => {
			const { preservedTrunkIndices, ...rest } = json as EncodedEditManager<TChangeset>;
			const decoded = inner.decode(
				{ ...rest, version: EditManagerFormatVersion.v7 } as unknown as Parameters<
					typeof inner.decode
				>[0],
				context,
			);
			const preservedRevisions = preservedTrunkIndices.map((index) => {
				const commit = decoded.main.trunk[index];
				if (commit === undefined) {
					throw new Error("Preserved trunk index is out of range");
				}
				return commit.revision;
			});
			return preservedRevisions.length === 0 ? decoded : { ...decoded, preservedRevisions };
		},
	};
}
