/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	type CodecTree,
	type DependentFormatVersion,
	type FormatVersion,
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
	dependentChangeFormatVersion: DependentFormatVersion<MessageFormatVersion>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
	writeVersion: MessageFormatVersion = 1,
): IJsonCodec<
	DecodedMessage<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	MessageEncodingContext
> {
	const family = makeMessageCodecs(
		changeCodecs,
		dependentChangeFormatVersion,
		revisionTagCodec,
		options,
	);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

/**
 * @privateRemarks Exported for testing.
 */
export function makeMessageCodecs<TChangeset>(
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>,
	dependentChangeFormatVersion: DependentFormatVersion<MessageFormatVersion>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): ICodecFamily<DecodedMessage<TChangeset>, MessageEncodingContext> {
	const registry: [
		FormatVersion,
		IJsonCodec<
			DecodedMessage<TChangeset>,
			JsonCompatibleReadOnly,
			JsonCompatibleReadOnly,
			MessageEncodingContext
		>,
	][] = Array.from(messageFormatVersions).map((version) => {
		const changeCodec = changeCodecs.resolve(
			dependentChangeFormatVersion.lookup(version),
		).json;
		switch (version) {
			case undefined:
			case 1:
			case 2:
			case 3:
			case 4:
				return [
					version,
					makeV1ToV4CodecWithVersion(changeCodec, revisionTagCodec, options, version ?? 1),
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

export type MessageFormatVersion = undefined | 1 | 2 | 3 | 4 | 5;
export const messageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set([
	undefined,
	1,
	2,
	3,
	4,
	5,
]);

export function getCodecTreeForMessageFormatWithChange(
	version: MessageFormatVersion,
	changeFormat: CodecTree,
): CodecTree {
	return {
		name: "Message",
		version,
		children: [changeFormat],
	};
}
