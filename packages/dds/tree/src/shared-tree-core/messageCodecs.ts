/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecTree,
	type CodecVersion,
	type DependentFormatVersion,
	FluidClientVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeDiscontinuedCodecAndSchema,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";

import { makeV1ToV4CodecWithVersion } from "./messageCodecV1ToV4.js";
import { makeSharedBranchesCodecWithVersion } from "./messageCodecVSharedBranches.js";
import { MessageFormatVersion } from "./messageFormat.js";
import type { DecodedMessage } from "./messageTypes.js";

export interface MessageEncodingContext {
	idCompressor: IIdCompressor;
	schema?: SchemaAndPolicy;
}

/**
 * Codec name used to identify the message codec, see {@link makeMessageCodecBuilder}.
 */
export const messageCodecName = "Message";

/**
 * Options for constructing a message codec, see {@link makeMessageCodecBuilder}.
 */
interface MessageCodecBuilderOptions<TChangeset> extends ICodecOptions {
	/** Codecs for encoding changesets. */
	changeCodecs: ICodecFamily<TChangeset, ChangeEncodingContext>;
	/** Maps each MessageFormatVersion to the corresponding changeset format version. */
	dependentChangeFormatVersion: DependentFormatVersion<MessageFormatVersion>;
	/** Codec for encoding revision tags within changesets. */
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>;
}

/**
 * Creates a {@link ClientVersionDispatchingCodecBuilder} for encoding/decoding messages.
 */
export function makeMessageCodecBuilder<TChangeset>(): ClientVersionDispatchingCodecBuilder<
	MessageCodecBuilderOptions<TChangeset>,
	DecodedMessage<TChangeset>,
	MessageEncodingContext,
	MessageFormatVersion | undefined,
	typeof messageCodecName
> {
	// See MessageFormatVersion and its members for documentation on what changed in each version.
	const versions: CodecVersion<
		DecodedMessage<TChangeset>,
		MessageEncodingContext,
		MessageFormatVersion | undefined,
		MessageCodecBuilderOptions<TChangeset>
	>[] = [
		// The "undefined" wire format (no version field) is discontinued.
		makeDiscontinuedCodecAndSchema(undefined, "2.73.0"),
		makeDiscontinuedCodecAndSchema(MessageFormatVersion.v1, "2.73.0"),
		makeDiscontinuedCodecAndSchema(MessageFormatVersion.v2, "2.73.0"),
		{
			minVersionForCollab: lowestMinVersionForCollab,
			formatVersion: MessageFormatVersion.v3,
			codec: (options: MessageCodecBuilderOptions<TChangeset>) =>
				makeV1ToV4CodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(MessageFormatVersion.v3),
					),
					options.revisionTagCodec,
					MessageFormatVersion.v3,
				),
		},
		{
			minVersionForCollab: FluidClientVersion.v2_43,
			formatVersion: MessageFormatVersion.v4,
			codec: (options: MessageCodecBuilderOptions<TChangeset>) =>
				makeV1ToV4CodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(MessageFormatVersion.v4),
					),
					options.revisionTagCodec,
					MessageFormatVersion.v4,
				),
		},
		makeDiscontinuedCodecAndSchema(MessageFormatVersion.v5, "2.74.0"),
		{
			minVersionForCollab: FluidClientVersion.v2_80,
			formatVersion: MessageFormatVersion.v6,
			codec: (options: MessageCodecBuilderOptions<TChangeset>) =>
				makeV1ToV4CodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(MessageFormatVersion.v6),
					),
					options.revisionTagCodec,
					MessageFormatVersion.v6,
				),
		},
		{
			minVersionForCollab: undefined,
			formatVersion: MessageFormatVersion.vSharedBranches,
			codec: (options: MessageCodecBuilderOptions<TChangeset>) =>
				makeSharedBranchesCodecWithVersion(
					options.changeCodecs.resolve(
						options.dependentChangeFormatVersion.lookup(MessageFormatVersion.vSharedBranches),
					),
					options.revisionTagCodec,
					MessageFormatVersion.vSharedBranches,
				),
		},
	];

	return ClientVersionDispatchingCodecBuilder.build(messageCodecName, versions);
}

export function getCodecTreeForMessageFormatWithChange(
	clientVersion: MinimumVersionForCollab,
	changeFormat: CodecTree,
): CodecTree {
	const builder = makeMessageCodecBuilder();
	return {
		...builder.getCodecTree(clientVersion),
		children: [changeFormat],
	};
}
