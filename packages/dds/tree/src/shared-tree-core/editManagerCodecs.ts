/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecTree,
	type CodecVersion,
	type DependentFormatVersion,
	FluidClientVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeDiscontinuedCodecAndSchema,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";

import type { SummaryData } from "./editManager.js";
import { makeV1toV4andV6CodecWithVersion } from "./editManagerCodecsV1toV4.js";
import { makeSharedBranchesCodecWithVersion } from "./editManagerCodecsVSharedBranches.js";
import { EditManagerFormatVersion } from "./editManagerFormatCommons.js";

/**
 * Context required for encoding/decoding the {@link EditManager}'s {@link SummaryData}.
 */
export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

/**
 * Codec name used to identify the {@link EditManager} codec, see {@link makeEditManagerCodecBuilder}.
 */
export const editManagerCodecName = "EditManager";

/**
 * Options for constructing an {@link EditManager} codec, see {@link makeEditManagerCodecBuilder}.
 */
interface EditManagerCodecOptions<TChangeset> extends ICodecOptions {
	/** Codecs for encoding changesets. */
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>;
	/** Maps each EditManager format version to the corresponding changeset format version. */
	dependentChangeFormatVersion: DependentFormatVersion<EditManagerFormatVersion>;
	/** Codec for encoding revision tags within changesets. */
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>;
}

/**
 * Creates a {@link ClientVersionDispatchingCodecBuilder} encoding for {@link SummaryData}.
 */
export function makeEditManagerCodecBuilder<
	TChangeset,
>(): ClientVersionDispatchingCodecBuilder<
	EditManagerCodecOptions<TChangeset>,
	SummaryData<TChangeset>,
	EditManagerEncodingContext,
	EditManagerFormatVersion,
	typeof editManagerCodecName
> {
	// See EditManagerFormatVersion and its members for documentation on what changed in each version.
	const versions: CodecVersion<
		SummaryData<TChangeset>,
		EditManagerEncodingContext,
		EditManagerFormatVersion,
		EditManagerCodecOptions<TChangeset>
	>[] = [
		makeDiscontinuedCodecAndSchema(EditManagerFormatVersion.v1, "2.73.0"),
		makeDiscontinuedCodecAndSchema(EditManagerFormatVersion.v2, "2.73.0"),
		{
			minVersionForCollab: lowestMinVersionForCollab,
			formatVersion: EditManagerFormatVersion.v3,
			codec: (options: EditManagerCodecOptions<TChangeset>) =>
				makeV1toV4andV6CodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(EditManagerFormatVersion.v3),
					),
					options.revisionTagCodec,
					EditManagerFormatVersion.v3,
				),
		},
		{
			minVersionForCollab: FluidClientVersion.v2_43,
			formatVersion: EditManagerFormatVersion.v4,
			codec: (options: EditManagerCodecOptions<TChangeset>) =>
				makeV1toV4andV6CodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(EditManagerFormatVersion.v4),
					),
					options.revisionTagCodec,
					EditManagerFormatVersion.v4,
				),
		},
		makeDiscontinuedCodecAndSchema(EditManagerFormatVersion.v5, "2.74.0"),
		{
			minVersionForCollab: FluidClientVersion.v2_80,
			formatVersion: EditManagerFormatVersion.v6,
			codec: (options: EditManagerCodecOptions<TChangeset>) =>
				makeV1toV4andV6CodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(EditManagerFormatVersion.v6),
					),
					options.revisionTagCodec,
					EditManagerFormatVersion.v6,
				),
		},
		{
			minVersionForCollab: undefined,
			formatVersion: EditManagerFormatVersion.vSharedBranches,
			codec: (options: EditManagerCodecOptions<TChangeset>) =>
				makeSharedBranchesCodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(
							EditManagerFormatVersion.vSharedBranches,
						),
					),
					options.revisionTagCodec,
					EditManagerFormatVersion.vSharedBranches,
				),
		},
	];

	return ClientVersionDispatchingCodecBuilder.build(editManagerCodecName, versions);
}

/**
 * Returns a {@link CodecTree} for the EditManager format at the given client version,
 * with the provided change codec tree as a child.
 */
export function getCodecTreeForEditManagerFormatWithChange(
	clientVersion: MinimumVersionForCollab,
	changeFormat: CodecTree,
): CodecTree {
	const builder = makeEditManagerCodecBuilder();
	return {
		...builder.getCodecTree(clientVersion),
		children: [changeFormat],
	};
}
