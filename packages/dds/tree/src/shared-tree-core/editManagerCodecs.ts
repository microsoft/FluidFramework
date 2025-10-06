/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	type CodecTree,
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
import type { JsonCompatibleReadOnly } from "../util/index.js";

import type { SummaryData } from "./editManager.js";
import { makeV1CodecWithVersion } from "./editManagerCodecsV1toV4.js";
import { makeV5CodecWithVersion } from "./editManagerCodecsV5.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
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
	options: ICodecOptions,
	writeVersion: number,
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
			case 1:
			case 2:
			case 3:
			case 4:
				return [
					version,
					makeV1CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			case 5:
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

export type EditManagerFormatVersion = 1 | 2 | 3 | 4 | 5;
export const editManagerFormatVersions: ReadonlySet<EditManagerFormatVersion> = new Set([
	1, 2, 3, 4, 5,
]);

export function getCodecTreeForEditManagerFormatWithChange(
	version: EditManagerFormatVersion,
	changeFormat: CodecTree,
): CodecTree {
	return {
		name: "EditManager",
		version,
		children: [changeFormat],
	};
}
