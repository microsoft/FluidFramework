/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
} from "@fluidframework/runtime-utils/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	type DependentFormatVersion,
	FluidClientVersion,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeDiscontinuedCodecVersion,
} from "../codec/index.js";
import { makeVersionDispatchingCodec } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { brand, unbrand, type JsonCompatibleReadOnly } from "../util/index.js";

import type { SummaryData } from "./editManager.js";
import { makeV1CodecWithVersion } from "./editManagerCodecsV1toV4.js";
import { makeSharedBranchesCodecWithVersion } from "./editManagerCodecsVSharedBranches.js";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	EditManagerFormatVersion,
	editManagerFormatVersions,
} from "./editManagerFormatCommons.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

/**
 * Convert a MinimumVersionForCollab to an EditManagerFormatVersion.
 * @param clientVersion - The MinimumVersionForCollab to convert.
 * @returns The EditManagerFormatVersion that corresponds to the provided MinimumVersionForCollab.
 */
export function clientVersionToEditManagerFormatVersion(
	clientVersion: MinimumVersionForCollab,
	writeVersionOverride?: EditManagerFormatVersion,
): EditManagerFormatVersion {
	const compatibleVersion: EditManagerFormatVersion = brand(
		getConfigForMinVersionForCollab(clientVersion, {
			[lowestMinVersionForCollab]: EditManagerFormatVersion.v3,
			[FluidClientVersion.v2_43]: EditManagerFormatVersion.v4,
			[FluidClientVersion.v2_80]: EditManagerFormatVersion.v6,
		}),
	);

	return writeVersionOverride ?? compatibleVersion;
}

/**
 * Returns the version that should be used for testing shared branches.
 */
export function editManagerFormatVersionSelectorForSharedBranches(
	clientVersion: MinimumVersionForCollab,
): EditManagerFormatVersion {
	return brand(EditManagerFormatVersion.vSharedBranches);
}

export interface EditManagerCodecOptions {
	readonly editManagerFormatSelector?: (
		minVersionForCollab: MinimumVersionForCollab,
	) => EditManagerFormatVersion;
}

function editManagerFormatVersionFromOptions(
	options: EditManagerCodecOptions & CodecWriteOptions,
): EditManagerFormatVersion {
	const selector =
		options.editManagerFormatSelector ?? clientVersionToEditManagerFormatVersion;
	return selector(options.minVersionForCollab);
}

export function makeEditManagerCodec<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	dependentChangeFormatVersion: DependentFormatVersion<EditManagerFormatVersion>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: EditManagerCodecOptions & CodecWriteOptions,
): IJsonCodec<
	SummaryData<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	EditManagerEncodingContext
> {
	const family = makeEditManagerCodecs(
		changeCodecs,
		dependentChangeFormatVersion,
		revisionTagCodec,
		options,
	);
	const writeVersion = editManagerFormatVersionFromOptions(options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

export function makeEditManagerCodecs<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	dependentChangeFormatVersion: DependentFormatVersion<EditManagerFormatVersion>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): ICodecFamily<SummaryData<TChangeset>, EditManagerEncodingContext> {
	const registry: [
		FormatVersion,
		IJsonCodec<
			SummaryData<TChangeset>,
			JsonCompatibleReadOnly,
			JsonCompatibleReadOnly,
			EditManagerEncodingContext
		>,
	][] = Array.from(editManagerFormatVersions, (version) => {
		switch (version) {
			case unbrand(EditManagerFormatVersion.v1):
			case unbrand(EditManagerFormatVersion.v2): {
				return [version, makeDiscontinuedCodecVersion(options, version, "2.73.0")];
			}
			case unbrand(EditManagerFormatVersion.v3):
			case unbrand(EditManagerFormatVersion.v4):
			case unbrand(EditManagerFormatVersion.v6): {
				const changeCodec = changeCodecs.resolve(dependentChangeFormatVersion.lookup(version));
				return [
					version,
					makeV1CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			}
			case unbrand(EditManagerFormatVersion.v5): {
				return [version, makeDiscontinuedCodecVersion(options, version, "2.74.0")];
			}
			case unbrand(EditManagerFormatVersion.vSharedBranches): {
				const changeCodec = changeCodecs.resolve(dependentChangeFormatVersion.lookup(version));
				return [
					version,
					makeSharedBranchesCodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			}
			default: {
				unreachableCase(version);
			}
		}
	});
	return makeCodecFamily(registry);
}

export function getCodecTreeForEditManagerFormatWithChange(
	clientVersion: MinimumVersionForCollab,
	changeFormat: CodecTree,
): CodecTree {
	return {
		name: "EditManager",
		version: clientVersionToEditManagerFormatVersion(clientVersion),
		children: [changeFormat],
	};
}
