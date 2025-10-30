/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	type DependentFormatVersion,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
} from "../codec/index.js";
import { makeVersionDispatchingCodec } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { brand, type Brand, type JsonCompatibleReadOnly } from "../util/index.js";

import type { SummaryData } from "./editManager.js";
import { makeV1CodecWithVersion } from "./editManagerCodecsV1toV4.js";
import { makeV5CodecWithVersion } from "./editManagerCodecsV5.js";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

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
	// Currently, version 3 is the only approved format for writing in production.
	return writeVersionOverride ?? brand(EditManagerVersion.v3);
}

/**
 * Returns the version that should be used for testing shared branches.
 */
export function editManagerFormatVersionSelectorForSharedBranches(
	clientVersion: MinimumVersionForCollab,
): EditManagerFormatVersion {
	return brand(EditManagerVersion.v5);
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
		const changeCodec = changeCodecs.resolve(dependentChangeFormatVersion.lookup(version));
		switch (version) {
			case EditManagerVersion.v1:
			case EditManagerVersion.v2:
			case EditManagerVersion.v3:
			case EditManagerVersion.v4:
				return [
					version,
					makeV1CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			case EditManagerVersion.v5:
				return [
					version,
					makeV5CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			default:
				unreachableCase(version);
		}
	});
	return makeCodecFamily(registry);
}

/**
 * The format version for the EditManager.
 */
export enum EditManagerVersion {
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability need not be maintained.
	 */
	v1 = 1,
	/**
	 * Introduced and retired prior to 2.0.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability need not be maintained.
	 */
	v2 = 2,
	/**
	 * Introduced prior to 2.0 and used beyond.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability needs to be maintained.
	 */
	v3 = 3,
	/**
	 * Was inadvertently released in 2.43.0 (through usages of configuredSharedTree) and remained available as a write format until 2.71.
	 * Reading capability must be maintained for backwards compatibility.
	 * Writing capability need not be maintained.
	 */
	v4 = 4,
	/**
	 * Not yet released.
	 * Only used for testing shared branches.
	 */
	v5 = 5,
}
export type EditManagerFormatVersion = Brand<EditManagerVersion, "EditManagerFormatVersion">;
export const editManagerFormatVersions: ReadonlySet<EditManagerFormatVersion> = new Set([
	brand(EditManagerVersion.v1),
	brand(EditManagerVersion.v2),
	brand(EditManagerVersion.v3),
	brand(EditManagerVersion.v4),
	brand(EditManagerVersion.v5),
]);

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
