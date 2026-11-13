/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CodecAndSchema, IJsonCodec } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import {
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
} from "../util/index.js";

import type { MessageDecodingContext, MessageEncodingContext } from "./messageCodecs.js";
import { makeV1ToV4CodecWithVersion } from "./messageCodecV1ToV4.js";
import { MessageFormatVersion } from "./messageFormat.js";
import { Message } from "./messageFormatVHistoryCompaction.js";
import type { DecodedMessage } from "./messageTypes.js";

/**
 * Creates the codec for {@link MessageFormatVersion.vHistoryCompaction}.
 * @remarks
 * Commit messages are encoded exactly like {@link MessageFormatVersion.v7}, only with a different version.
 * The version adds the "preserveRevision" message used by history compaction's `setRevisionPreserved`.
 * Shared branch messages are not supported in this format.
 */
export function makeHistoryCompactionMessageCodec<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): CodecAndSchema<DecodedMessage<TChangeset>, MessageEncodingContext, MessageDecodingContext> {
	const commitCodec = makeV1ToV4CodecWithVersion(
		changeCodec,
		revisionTagCodec,
		MessageFormatVersion.v7,
	);
	return {
		schema: Message(changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema),
		encode: (
			decoded: DecodedMessage<TChangeset>,
			context: MessageEncodingContext,
		): Message & JsonCompatibleReadOnlyObject => {
			switch (decoded.type) {
				case "commit": {
					const encoded = commitCodec.encode(decoded, context);
					return {
						...encoded,
						version: MessageFormatVersion.vHistoryCompaction,
					} as unknown as Message & JsonCompatibleReadOnlyObject;
				}
				case "preserveRevision": {
					const message: Message & JsonCompatibleReadOnlyObject = {
						version: MessageFormatVersion.vHistoryCompaction,
						type: "preserveRevision",
						originatorId: decoded.sessionId,
						revision: revisionTagCodec.encode(decoded.revision, {
							originatorId: decoded.sessionId,
							idCompressor: context.idCompressor,
							revision: undefined,
							isSummary: false,
						}),
						preserved: decoded.preserved,
					};
					return message;
				}
				default: {
					throw new Error(
						`Message type "${decoded.type}" is not supported by the history compaction message format`,
					);
				}
			}
		},
		decode: (
			json: Message & JsonCompatibleReadOnly,
			context: MessageDecodingContext,
		): DecodedMessage<TChangeset> => {
			const encoded = json as Message;
			if ("type" in encoded) {
				return {
					type: "preserveRevision",
					sessionId: encoded.originatorId,
					revision: revisionTagCodec.decode(encoded.revision, {
						originatorId: encoded.originatorId,
						idCompressor: context.idCompressor,
						revision: undefined,
						isSummary: false,
					}),
					preserved: encoded.preserved,
				};
			}
			const asV7: Parameters<typeof commitCodec.decode>[0] = {
				...encoded,
				version: MessageFormatVersion.v7,
			};
			return commitCodec.decode(asV7, context);
		},
	};
}
