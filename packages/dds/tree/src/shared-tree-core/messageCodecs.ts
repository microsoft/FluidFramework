/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	type CodecTree,
	type CodecWriteOptions,
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
import { MessageFormatVersion, messageFormatVersions } from "./messageFormat.js";

export interface MessageEncodingContext {
	idCompressor: IIdCompressor;
	schema?: SchemaAndPolicy;
}

/**
 * Convert a MinimumVersionForCollab to a MessageFormatVersion.
 * @param clientVersion - The MinimumVersionForCollab to convert.
 * @returns The MessageFormatVersion that corresponds to the provided MinimumVersionForCollab.
 */
export function clientVersionToMessageFormatVersion(
	clientVersion: MinimumVersionForCollab,
): MessageFormatVersion {
	// Currently, message codec only writes in version 3.
	return MessageFormatVersion.v3;
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
	options: CodecWriteOptions,
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
	return makeVersionDispatchingCodec(family, {
		...options,
		writeVersion: clientVersionToMessageFormatVersion(options.minVersionForCollab),
	});
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
			case MessageFormatVersion.undefined:
			case MessageFormatVersion.v1:
			case MessageFormatVersion.v2:
			case MessageFormatVersion.v3:
			case MessageFormatVersion.v4:
				return [
					version,
					makeV1ToV4CodecWithVersion(
						changeCodec,
						revisionTagCodec,
						options,
						version ?? MessageFormatVersion.v1,
					),
				];
			case MessageFormatVersion.v5:
				return [version, makeV5CodecWithVersion(changeCodec, revisionTagCodec, options)];
			default:
				unreachableCase(version as never);
		}
	});
	return makeCodecFamily(registry);
}

export function getCodecTreeForMessageFormatWithChange(
	clientVersion: MinimumVersionForCollab,
	changeFormat: CodecTree,
): CodecTree {
	return {
		name: "Message",
		version: clientVersionToMessageFormatVersion(clientVersion),
		children: [changeFormat],
	};
}
