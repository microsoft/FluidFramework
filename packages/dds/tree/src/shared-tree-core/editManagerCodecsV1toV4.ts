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
import {
	decodeSharedBranch,
	encodeSharedBranch,
	type EditManagerDecodingContext,
	type EditManagerEncodingContext,
	type PersistedCommitMetadataOptions,
} from "./editManagerCodecsCommons.js";
import { EditManagerFormatVersion } from "./editManagerFormatCommons.js";
import { EncodedEditManager } from "./editManagerFormatV1toV4.js";
import type { PersistedCommitMetadataIndex } from "./persistedCommitMetadata.js";

/**
 * Create the provided version of the {@link EditManager} codec (which encodes it's {@link SummaryData}).
 * @remarks
 * The changeCodec and revisionTagCodec are not explicitly versioned, so the exact right version of them must be provided here
 * or data will be incompatible.
 *
 * TODO: this file should be renamed as this is used for v6 as well.
 */
export function makeV1toV4andV6CodecWithVersion<TChangeset>(
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
	version: EncodedEditManager<TChangeset>["version"],
	persistedMetadataIndex: PersistedCommitMetadataIndex | undefined,
): CodecAndSchema<
	SummaryData<TChangeset>,
	EditManagerEncodingContext,
	EditManagerDecodingContext
> {
	const schema = EncodedEditManager(changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema);
	const persistedMetadata: PersistedCommitMetadataOptions | undefined =
		persistedMetadataIndex === undefined
			? undefined
			: {
					index: persistedMetadataIndex,
					writeMetadata: version >= EditManagerFormatVersion.v7,
				};

	const codec: CodecAndSchema<
		SummaryData<TChangeset>,
		EditManagerEncodingContext,
		EditManagerDecodingContext
	> = {
		schema,
		encode: (
			data: SummaryData<TChangeset>,
			context: EditManagerEncodingContext,
		): EncodedEditManager<TChangeset> & Versioned & JsonCompatibleReadOnlyObject => {
			const mainBranch = encodeSharedBranch(
				changeCodec,
				revisionTagCodec,
				data.main,
				context,
				data.originator,
				persistedMetadata,
			);
			const encoded: EncodedEditManager<TChangeset> = {
				trunk: mainBranch.trunk,
				branches: mainBranch.peers,
				version,
			};
			return encoded as EncodedEditManager<TChangeset> &
				Versioned &
				JsonCompatibleReadOnlyObject;
		},
		decode: (
			json: EncodedEditManager<TChangeset> & JsonCompatibleReadOnly,
			context: EditManagerDecodingContext,
		): SummaryData<TChangeset> => {
			return {
				main: decodeSharedBranch(
					changeCodec,
					revisionTagCodec,
					{
						trunk: json.trunk,
						peers: json.branches,
					},
					context,
					undefined, // Non "vSharedBranches" versions do not encode the summary originatorId.
					persistedMetadata,
				),
			};
		},
	};
	return codec;
}
