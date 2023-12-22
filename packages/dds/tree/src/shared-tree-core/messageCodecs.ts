/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util";
import { ICodecOptions, IJsonCodec, SessionAwareCodec, withSchemaValidation } from "../codec";
import { ChangeFamilyCodec, EncodedRevisionTag, RevisionTag } from "../core";
import { DecodedMessage } from "./messageTypes";
import { Message } from "./messageFormat";

export function makeMessageCodec<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
	options: ICodecOptions,
): IJsonCodec<DecodedMessage<TChangeset>> {
	// TODO: consider adding version and using makeVersionedValidatedCodec
	return withSchemaValidation<DecodedMessage<TChangeset>, TAnySchema>(
		Message(changeCodec.encodedSchema ?? Type.Any()),
		{
			encode: ({ commit, sessionId: originatorId }: DecodedMessage<TChangeset>) => {
				const message: Message = {
					revision: revisionTagCodec.encode(commit.revision, originatorId),
					originatorId,
					changeset: changeCodec.encode(commit.change, { originatorId }),
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;
				return {
					commit: {
						revision: revisionTagCodec.decode(revision, originatorId),
						change: changeCodec.decode(changeset, { originatorId }),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
