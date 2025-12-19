/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type TAnySchema, Type } from "@sinclair/typebox";

import { type ICodecOptions, type IJsonCodec, withSchemaValidation } from "../codec/index.js";
import type {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import { Message } from "./messageFormatVSharedBranches.js";
import type { DecodedMessage } from "./messageTypes.js";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { MessageEncodingContext } from "./messageCodecs.js";
import { decodeBranchId, encodeBranchId } from "./branchIdCodec.js";
import type { MessageFormatVersion } from "./messageFormat.js";

export function makeSharedBranchesCodecWithVersion<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
	version: typeof MessageFormatVersion.vSharedBranches,
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
				message: DecodedMessage<TChangeset>,
				context: MessageEncodingContext,
			): JsonCompatibleReadOnly => {
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
						} satisfies Message & JsonCompatibleReadOnly;
					}
					case "branch": {
						return {
							originatorId: message.sessionId,
							branchId: encodeBranchId(context.idCompressor, message.branchId),
							version,
						} satisfies Message & JsonCompatibleReadOnly;
					}
					default: {
						unreachableCase(type);
					}
				}
			},
			decode: (
				encoded: JsonCompatibleReadOnly,
				context: MessageEncodingContext,
			): DecodedMessage<TChangeset> => {
				const {
					revision: encodedRevision,
					originatorId,
					changeset,
					branchId: encodedBranchId,
				} = encoded as unknown as Message;

				const changeContext = {
					originatorId,
					revision: undefined,
					idCompressor: context.idCompressor,
				};

				const branchId = decodeBranchId(context.idCompressor, encodedBranchId, changeContext);

				if (changeset === undefined) {
					return { type: "branch", sessionId: originatorId, branchId };
				}

				assert(
					encodedRevision !== undefined,
					0xc6a /* Commit messages must have a revision */,
				);
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
		},
		options.jsonValidator,
	);
}
