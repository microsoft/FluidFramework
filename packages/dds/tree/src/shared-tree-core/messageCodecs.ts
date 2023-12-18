/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util";
import { ICodecOptions, IJsonCodec, withSchemaValidation } from "../codec";
import { EncodedRevisionTag, RevisionTag } from "../core";
import { DecodedMessage } from "./messageTypes";
import { Message } from "./messageFormat";

export function makeMessageCodec<TChangeset>(
	changesetCodec: IJsonCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
	options: ICodecOptions,
): IJsonCodec<DecodedMessage<TChangeset>> {
	// TODO: consider adding version and using makeVersionedValidatedCodec
	return withSchemaValidation<DecodedMessage<TChangeset>, TAnySchema>(
		Message(changesetCodec.encodedSchema ?? Type.Any()),
		{
			encode: ({ commit, sessionId }: DecodedMessage<TChangeset>) => {
				const message: Message = {
					revision: revisionTagCodec.encode(commit.revision),
					originatorId: sessionId,
					changeset: changesetCodec.encode(commit.change),
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;
				return {
					commit: {
						revision: revisionTagCodec.decode(revision),
						change: changesetCodec.decode(changeset),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
