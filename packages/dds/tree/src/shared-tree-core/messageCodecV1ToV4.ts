/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { CodecAndSchema, IJsonCodec, Versioned } from "../codec/index.js";
import type {
	ChangeDecodingContext,
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import {
	IdDecodingContext,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
} from "../util/index.js";

import type { MessageDecodingContext, MessageEncodingContext } from "./messageCodecs.js";
import type { MessageFormatVersion } from "./messageFormat.js";
import { Message } from "./messageFormatV1ToV4.js";
import type { DecodedMessage } from "./messageTypes.js";

export function makeV1ToV4CodecWithVersion<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext,
		ChangeDecodingContext
	>,
	version:
		| typeof MessageFormatVersion.v1
		| typeof MessageFormatVersion.v2
		| typeof MessageFormatVersion.v3
		| typeof MessageFormatVersion.v4
		| typeof MessageFormatVersion.v6,
): CodecAndSchema<DecodedMessage<TChangeset>, MessageEncodingContext, MessageDecodingContext> {
	const schema = Message(changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema);
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
			return {
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
		},
		decode: (
			encoded: Message & JsonCompatibleReadOnlyObject & Versioned,
			context: MessageDecodingContext,
		): DecodedMessage<TChangeset> => {
			const { revision: encodedRevision, originatorId, changeset } = encoded;

			const idDecodingContext = new IdDecodingContext({
				idCompressor: context.idCompressor,
				originatorId,
			});
			const changeContext: ChangeDecodingContext = {
				revision: undefined,
				idCompressor: context.idCompressor,
				idDecodingContext,
				// For ops the originator session resolves forest identifiers too.
				forestIdDecodingContext: idDecodingContext,
			};

			const revision = revisionTagCodec.decode(encodedRevision, changeContext);

			return {
				branchId: "main",
				type: "commit",
				commit: {
					revision,
					change: changeCodec.decode(changeset, { ...changeContext, revision }),
				},
				sessionId: originatorId,
			};
		},
	};
}
