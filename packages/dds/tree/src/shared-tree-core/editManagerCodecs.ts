/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
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
	const family = makeEditManagerCodecs(changeCodecs, revisionTagCodec, options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

export function makeEditManagerCodecs<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): ICodecFamily<SummaryData<TChangeset>, EditManagerEncodingContext> {
	return makeCodecFamily([
		[1, makeV1CodecWithVersion(changeCodecs.resolve(1), revisionTagCodec, options, 1)],
		[2, makeV1CodecWithVersion(changeCodecs.resolve(2), revisionTagCodec, options, 2)],
		[3, makeV1CodecWithVersion(changeCodecs.resolve(3), revisionTagCodec, options, 3)],
		[4, makeV1CodecWithVersion(changeCodecs.resolve(4), revisionTagCodec, options, 4)],
		[5, makeV5CodecWithVersion(changeCodecs.resolve(4), revisionTagCodec, options, 5)],
	]);
}
