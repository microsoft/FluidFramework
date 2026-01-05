/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
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
	makeVersionDispatchingCodec,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { brand, unbrand, type JsonCompatibleReadOnly } from "../util/index.js";

import type { DecodedMessage } from "./messageTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { makeV1ToV4CodecWithVersion } from "./messageCodecV1ToV4.js";
import { makeSharedBranchesCodecWithVersion } from "./messageCodecVSharedBranches.js";
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
	const compatibleVersion: MessageFormatVersion = brand(
		getConfigForMinVersionForCollab(clientVersion, {
			[lowestMinVersionForCollab]: MessageFormatVersion.v3,
			[FluidClientVersion.v2_43]: MessageFormatVersion.v4,
		}),
	);
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
	return brand(MessageFormatVersion.vSharedBranches);
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
	][] = [...messageFormatVersions].map((version) => {
		switch (version) {
			case unbrand(MessageFormatVersion.undefined):
			case unbrand(MessageFormatVersion.v1):
			case unbrand(MessageFormatVersion.v2): {
				const versionOrUndefined =
					version === unbrand(MessageFormatVersion.undefined) ? undefined : version;
				return [
					versionOrUndefined,
					makeDiscontinuedCodecVersion(options, versionOrUndefined, "2.73.0"),
				];
			}
			case unbrand(MessageFormatVersion.v3):
			case unbrand(MessageFormatVersion.v4): {
				const changeCodec = changeCodecs.resolve(
					dependentChangeFormatVersion.lookup(version),
				).json;
				return [
					version,
					makeV1ToV4CodecWithVersion(changeCodec, revisionTagCodec, options, version),
				];
			}
			case unbrand(MessageFormatVersion.v5): {
				return [version, makeDiscontinuedCodecVersion(options, version, "2.74.0")];
			}
			case unbrand(MessageFormatVersion.vSharedBranches): {
				const changeCodec = changeCodecs.resolve(
					dependentChangeFormatVersion.lookup(version),
				).json;
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
