/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { type TAnySchema, Type } from "@sinclair/typebox";

import type { CodecAndSchema, IJsonCodec, Versioned } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import { decodeBranchId, encodeBranchId } from "./branchIdCodec.js";
import type { MessageEncodingContext } from "./messageCodecs.js";
import type { MessageFormatVersion } from "./messageFormat.js";
import { Message } from "./messageFormatVSharedBranches.js";
import type { DecodedMessage } from "./messageTypes.js";

export function makeSharedBranchesCodecWithVersion<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	version: typeof MessageFormatVersion.vSharedBranches,
): CodecAndSchema<DecodedMessage<TChangeset>, MessageEncodingContext> {
	const schema: TAnySchema = Message(changeCodec.encodedSchema ?? Type.Any());

	return {
		schema,
		encode: (
			message: DecodedMessage<TChangeset>,
			context: MessageEncodingContext,
		): Message & JsonCompatibleReadOnlyObject & Versioned => {
			const type = message.type;
			switch (type) {
				case "commit": {
					const changeContext: ChangeEncodingContext = {
						originatorId: message.sessionId,
						schema: context.schema,
						idCompressor: context.idCompressor,
						revision: message.commit.revision,
					};

					return {
						revision: revisionTagCodec.encode(message.commit.revision, {
							originatorId: message.sessionId,
							idCompressor: context.idCompressor,
							revision: undefined,
						}),
						originatorId: message.sessionId,
						changeset: changeCodec.encode(message.commit.change, changeContext),
						branchId: encodeBranchId(context.idCompressor, message.branchId),
						version,
					};
				}
				case "branch": {
					return {
						originatorId: message.sessionId,
						branchId: encodeBranchId(context.idCompressor, message.branchId),
						version,
					};
				}
				default: {
					unreachableCase(type);
				}
			}
		},
		decode: (
			encoded: Message & JsonCompatibleReadOnlyObject & Versioned,
			context: MessageEncodingContext,
		): DecodedMessage<TChangeset> => {
			const {
				revision: encodedRevision,
				originatorId,
				changeset,
				branchId: encodedBranchId,
			} = encoded;

			const changeContext = {
				originatorId,
				revision: undefined,
				idCompressor: context.idCompressor,
			};

			const branchId = decodeBranchId(context.idCompressor, encodedBranchId, changeContext);

			if (changeset === undefined) {
				return { type: "branch", sessionId: originatorId, branchId };
			}

			assert(encodedRevision !== undefined, 0xc6a /* Commit messages must have a revision */);
			const revision = revisionTagCodec.decode(encodedRevision, changeContext);

			return {
				type: "commit",
				commit: {
					revision,
					change: changeCodec.decode(changeset, {
						originatorId,
						revision,
						idCompressor: context.idCompressor,
					}),
				},
				branchId,
				sessionId: originatorId,
			};
		},
	};
}
