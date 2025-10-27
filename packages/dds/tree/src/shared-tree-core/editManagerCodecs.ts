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
): EditManagerFormatVersion {
	// Currently, edit manager codec only writes in version 3.
	return brand(EditManagerVersion.v3);
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
	options: CodecWriteOptions,
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
	return makeVersionDispatchingCodec(family, {
		...options,
		writeVersion: clientVersionToEditManagerFormatVersion(options.minVersionForCollab),
	});
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
	v1 = 1,
	v2 = 2,
	v3 = 3,
	v4 = 4,
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
