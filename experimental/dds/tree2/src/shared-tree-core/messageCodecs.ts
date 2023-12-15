/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util";
import { ICodecOptions, IJsonCodec, SessionAwareCodec, withSchemaValidation } from "../codec";
import { EncodedRevisionTag, RevisionTag } from "../core";
import { DecodedMessage } from "./messageTypes";
import { Message } from "./messageFormat";

export function makeMessageCodec<TChangeset>(
	changesetCodec: SessionAwareCodec<TChangeset>,
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
	options: ICodecOptions,
): IJsonCodec<DecodedMessage<TChangeset>> {
	return withSchemaValidation<DecodedMessage<TChangeset>, TAnySchema>(
		Message(changesetCodec.encodedSchema ?? Type.Any()),
		{
			encode: ({ commit, sessionId: originatorId }: DecodedMessage<TChangeset>) => {
				const message: Message = {
					revision: revisionTagCodec.encode(commit.revision, originatorId),
					originatorId,
					changeset: changesetCodec.encode(commit.change, originatorId),
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;
				return {
					commit: {
						revision: revisionTagCodec.decode(revision, originatorId),
						change: changesetCodec.decode(changeset, originatorId),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
