/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";

import {
	type ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
	withSchemaValidation,
} from "../codec/index.js";
import {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { JsonCompatibleReadOnly } from "../util/index.js";

import { Message } from "./messageFormat.js";
import { DecodedMessage } from "./messageTypes.js";

export interface MessageEncodingContext {
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
	const v1Codec = makeV1Codec(changeCodecs.resolve(0).json, revisionTagCodec, options);
	return makeCodecFamily([
		// Back-compat: messages weren't always written with an explicit version field.
		[undefined, v1Codec],
		[1, v1Codec],
	]);
}

function makeV1Codec<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
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
					revision: revisionTagCodec.encode(commit.revision, { originatorId }),
					originatorId,
					changeset: changeCodec.encode(commit.change, {
						originatorId,
						schema: context.schema,
					}),
					version: 1,
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;
				return {
					commit: {
						revision: revisionTagCodec.decode(revision, { originatorId }),
						change: changeCodec.decode(changeset, { originatorId }),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
