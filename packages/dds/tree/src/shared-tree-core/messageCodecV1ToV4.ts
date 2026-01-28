/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type ICodecOptions, type IJsonCodec, withSchemaValidation } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import { JsonCompatibleReadOnlySchema } from "../util/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import type { MessageEncodingContext } from "./messageCodecs.js";
import type { MessageFormatVersion } from "./messageFormat.js";
import { Message } from "./messageFormatV1ToV4.js";
import type { DecodedMessage } from "./messageTypes.js";

export function makeV1ToV4CodecWithVersion<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
	version:
		| typeof MessageFormatVersion.v1
		| typeof MessageFormatVersion.v2
		| typeof MessageFormatVersion.v3
		| typeof MessageFormatVersion.v4
		| typeof MessageFormatVersion.v6,
): IJsonCodec<
	DecodedMessage<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	MessageEncodingContext
> {
	return withSchemaValidation<
		DecodedMessage<TChangeset>,
		typeof JsonCompatibleReadOnlySchema,
		MessageEncodingContext
	>(
		Message(changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema),
		{
			encode: (decoded: DecodedMessage<TChangeset>, context: MessageEncodingContext) => {
				assert(decoded.type === "commit", 0xc68 /* Only commit messages are supported */);
				assert(
					decoded.branchId === "main",
					0xc69 /* Only commit messages to main are supported */,
				);
				const { commit, sessionId: originatorId } = decoded;
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
			decode: (
				encoded: JsonCompatibleReadOnly,
				context: MessageEncodingContext,
			): DecodedMessage<TChangeset> => {
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
					branchId: "main",
					type: "commit",
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
