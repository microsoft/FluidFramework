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
	FluidClientVersion,
	type FormatVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeDiscontinuedCodecVersion,
	makeVersionDispatchingCodec,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { brand, type JsonCompatibleReadOnly } from "../util/index.js";

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
	writeVersionOverride?: MessageFormatVersion,
): MessageFormatVersion {
	const compatibleVersion: MessageFormatVersion =
		clientVersion < FluidClientVersion.v2_43
			? brand(MessageFormatVersion.v3)
			: brand(MessageFormatVersion.v4);
	return writeVersionOverride ?? compatibleVersion;
}

export interface MessageCodecOptions {
	readonly messageFormatSelector?: (
		minVersionForCollab: MinimumVersionForCollab,
	) => MessageFormatVersion;
}

function messageFormatVersionFromOptions(
	options: MessageCodecOptions & CodecWriteOptions,
): MessageFormatVersion {
	const selector = options.messageFormatSelector ?? clientVersionToMessageFormatVersion;
	return selector(options.minVersionForCollab);
}

/**
 * Returns the version that should be used for testing shared branches.
 */
export function messageFormatVersionSelectorForSharedBranches(
	clientVersion: MinimumVersionForCollab,
): MessageFormatVersion {
	return brand(MessageFormatVersion.v5);
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
	options: MessageCodecOptions & CodecWriteOptions,
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
	const writeVersion = messageFormatVersionFromOptions(options);
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
		switch (version) {
			case MessageFormatVersion.undefined:
			case MessageFormatVersion.v1:
			case MessageFormatVersion.v2: {
				const versionOrUndefined =
					version === MessageFormatVersion.undefined ? undefined : version;
				return [
					versionOrUndefined,
					makeDiscontinuedCodecVersion(options, versionOrUndefined, "2.73.0"),
				];
			}
			case MessageFormatVersion.v3:
			case MessageFormatVersion.v4: {
				const changeCodec = changeCodecs.resolve(
					dependentChangeFormatVersion.lookup(version),
				).json;
				return [
					version,
					makeV1ToV4CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			}
			case MessageFormatVersion.v5: {
				const changeCodec = changeCodecs.resolve(
					dependentChangeFormatVersion.lookup(version),
				).json;
				return [
					version,
					makeV5CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			}
			default:
				unreachableCase(version);
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
