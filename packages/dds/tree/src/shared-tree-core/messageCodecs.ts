/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import type { DecodedMessage } from "./messageTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { makeV1ToV4CodecWithVersion } from "./messageCodecV1ToV4.js";
import { makeV5CodecWithVersion } from "./messageCodecV5.js";

export interface MessageEncodingContext {
	idCompressor: IIdCompressor;
	schema?: SchemaAndPolicy;
}

export function makeMessageCodec<TChangeset>(
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
	DecodedMessage<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	MessageEncodingContext
> {
	const family = makeMessageCodecs(changeCodecs, revisionTagCodec, options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

/**
 * @privateRemarks Exported for testing.
 */
export function makeMessageCodecs<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): ICodecFamily<DecodedMessage<TChangeset>, MessageEncodingContext> {
	const v1Codec = makeV1ToV4CodecWithVersion(
		changeCodecs.resolve(1).json,
		revisionTagCodec,
		options,
		1,
	);
	return makeCodecFamily([
		// Back-compat: messages weren't always written with an explicit version field.
		[undefined, v1Codec],
		[1, v1Codec],
		[
			2,
			makeV1ToV4CodecWithVersion(changeCodecs.resolve(2).json, revisionTagCodec, options, 2),
		],
		[
			3,
			makeV1ToV4CodecWithVersion(changeCodecs.resolve(3).json, revisionTagCodec, options, 3),
		],
		[
			4,
			makeV1ToV4CodecWithVersion(changeCodecs.resolve(4).json, revisionTagCodec, options, 4),
		],
		[5, makeV5CodecWithVersion(changeCodecs.resolve(4).json, revisionTagCodec, options, 5)],
	]);
}
