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
import { brand, type Brand, type JsonCompatibleReadOnly } from "../util/index.js";

import type { DecodedMessage } from "./messageTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { makeV1ToV4CodecWithVersion } from "./messageCodecV1ToV4.js";
import { makeV5CodecWithVersion } from "./messageCodecV5.js";

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
	// Currently, version 3 is the only approved format for writing in production.
	return writeVersionOverride ?? brand(MessageVersion.v3);
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
	return brand(MessageVersion.v5);
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
		const changeCodec = changeCodecs.resolve(
			dependentChangeFormatVersion.lookup(version),
		).json;
		switch (version) {
			case MessageVersion.v0:
			case MessageVersion.v1:
			case MessageVersion.v2:
			case MessageVersion.v3:
			case MessageVersion.v4:
				return [
					// The v0 message format version is equivalent to v1 except that the version field is omitted.
					version === MessageVersion.v0 ? undefined : version,
					makeV1ToV4CodecWithVersion(
						changeCodec,
						revisionTagCodec,
						options,
						// The v0 message format version is equivalent to v1 except that the version field is omitted.
						version === MessageVersion.v0 ? undefined : version,
					),
				];
			case MessageVersion.v5:
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
 * The format version for the message.
 */
export enum MessageVersion {
	/**
	 * NOTE: this is written as `undefined` rather than `0` in the wire format.
	 * Introduced and retired prior to 2.0.
	 * Reading capability is currently maintained for backwards compatibility, but it could be removed in the future.
	 * Writing capability need not be maintained.
	 */
	v0 = 0,
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
export type MessageFormatVersion = Brand<undefined | MessageVersion, "MessageFormatVersion">;
export const messageFormatVersions: ReadonlySet<MessageFormatVersion> = new Set([
	brand(MessageVersion.v0),
	brand(MessageVersion.v1),
	brand(MessageVersion.v2),
	brand(MessageVersion.v3),
	brand(MessageVersion.v4),
	brand(MessageVersion.v5),
]);

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
