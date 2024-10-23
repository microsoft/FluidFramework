/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type TAnySchema, Type } from "@sinclair/typebox";

import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
	withSchemaValidation,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import { Message } from "./messageFormat.js";
import type { DecodedMessage } from "./messageTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

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
 * @privateRemarks - Exported for testing.
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
	const v1Codec = makeV1CodecWithVersion(
		changeCodecs.resolve(1).json,
		revisionTagCodec,
		options,
		1,
	);
	return makeCodecFamily([
		// Back-compat: messages weren't always written with an explicit version field.
		[undefined, v1Codec],
		[1, v1Codec],
		[2, makeV1CodecWithVersion(changeCodecs.resolve(2).json, revisionTagCodec, options, 2)],
		[3, makeV1CodecWithVersion(changeCodecs.resolve(3).json, revisionTagCodec, options, 3)],
		[4, makeV1CodecWithVersion(changeCodecs.resolve(4).json, revisionTagCodec, options, 4)],
	]);
}

function makeV1CodecWithVersion<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
	version: 1 | 2 | 3 | 4,
): IJsonCodec<
	DecodedMessage<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	MessageEncodingContext
> {
	return withSchemaValidation<
		DecodedMessage<TChangeset>,
		TAnySchema,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		MessageEncodingContext
	>(
		Message(changeCodec.encodedSchema ?? Type.Any()),
		{
			encode: (
				{ commit, sessionId: originatorId }: DecodedMessage<TChangeset>,
				context: MessageEncodingContext,
			) => {
				const message: Message = {
					revision: revisionTagCodec.encode(commit.revision, {
						originatorId,
						idCompressor: context.idCompressor,
						revision: undefined,
					}),
					originatorId,
					changeset: changeCodec.encode(commit.change, {
						originatorId,
						schema: context.schema,
						idCompressor: context.idCompressor,
						revision: commit.revision,
					}),
					version,
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly, context: MessageEncodingContext) => {
				const {
					revision: encodedRevision,
					originatorId,
					changeset,
				} = encoded as unknown as Message;

				const revision = revisionTagCodec.decode(encodedRevision, {
					originatorId,
					revision: undefined,
					idCompressor: context.idCompressor,
				});

				return {
					commit: {
						revision,
						change: changeCodec.decode(changeset, {
							originatorId,
							revision,
							idCompressor: context.idCompressor,
						}),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
