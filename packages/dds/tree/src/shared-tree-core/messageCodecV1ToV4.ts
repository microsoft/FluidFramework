/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { CodecAndSchema, IJsonCodec, Versioned } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import {
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	type Mutable,
} from "../util/index.js";

import type { MessageDecodingContext, MessageEncodingContext } from "./messageCodecs.js";
import { MessageFormatVersion } from "./messageFormat.js";
import { Message } from "./messageFormatV1ToV4.js";
import type { CommitMessage, DecodedMessage } from "./messageTypes.js";

export function makeV1ToV4CodecWithVersion<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	version:
		| typeof MessageFormatVersion.v1
		| typeof MessageFormatVersion.v2
		| typeof MessageFormatVersion.v3
		| typeof MessageFormatVersion.v4
		| typeof MessageFormatVersion.v6
		| typeof MessageFormatVersion.v7,
): CodecAndSchema<DecodedMessage<TChangeset>, MessageEncodingContext, MessageDecodingContext> {
	const schema = Message(changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema);
	// Persisted commit metadata was introduced in v7 and must not be written by earlier formats.
	const writePersistedMetadata = version >= MessageFormatVersion.v7;
	return {
		schema,
		encode: (
			decoded: DecodedMessage<TChangeset>,
			context: MessageEncodingContext,
		): Message & JsonCompatibleReadOnlyObject & Versioned => {
			assert(decoded.type === "commit", 0xc68 /* Only commit messages are supported */);
			assert(
				decoded.branchId === "main",
				0xc69 /* Only commit messages to main are supported */,
			);
			const { commit, sessionId: originatorId } = decoded;
			const encoded: Mutable<Message> = {
				revision: revisionTagCodec.encode(commit.revision, {
					originatorId,
					idCompressor: context.idCompressor,
					revision: undefined,
					isSummary: false,
				}),
				originatorId,
				changeset: changeCodec.encode(commit.change, {
					originatorId,
					schema: context.schema,
					idCompressor: context.idCompressor,
					revision: commit.revision,
					isSummary: false,
				}),
				version,
			};
			if (writePersistedMetadata && decoded.persistedMetadata !== undefined) {
				encoded.persistedMetadata = decoded.persistedMetadata;
			}
			return encoded as Message & JsonCompatibleReadOnlyObject & Versioned;
		},
		decode: (
			encoded: Message & JsonCompatibleReadOnlyObject & Versioned,
			context: MessageDecodingContext,
		): DecodedMessage<TChangeset> => {
			const {
				revision: encodedRevision,
				originatorId,
				changeset,
				persistedMetadata,
			} = encoded;

			const revision = revisionTagCodec.decode(encodedRevision, {
				originatorId,
				revision: undefined,
				idCompressor: context.idCompressor,
				isSummary: false,
			});

			const decoded: CommitMessage<TChangeset> = {
				branchId: "main",
				type: "commit",
				commit: {
					revision,
					change: changeCodec.decode(changeset, {
						originatorId,
						revision,
						idCompressor: context.idCompressor,
						isSummary: false,
					}),
				},
				sessionId: originatorId,
			};
			if (persistedMetadata !== undefined) {
				decoded.persistedMetadata = persistedMetadata;
			}
			return decoded;
		},
	};
}
