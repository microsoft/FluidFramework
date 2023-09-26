/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util";
import { IJsonCodec, withSchemaValidation } from "../codec";
import { DecodedMessage } from "./messageTypes";
import { Message } from "./messageFormat";

export function makeMessageCodec<TChangeset>(
	changesetCodec: IJsonCodec<TChangeset>,
): IJsonCodec<DecodedMessage<TChangeset>, unknown> {
	return withSchemaValidation<DecodedMessage<TChangeset>, TAnySchema, unknown>(
		Message(changesetCodec.encodedSchema ?? Type.Any()),
		{
			encode: ({ commit, sessionId }: DecodedMessage<TChangeset>) => {
				const message: Message = {
					revision: commit.revision,
					originatorId: sessionId,
					changeset: changesetCodec.encode(commit.change),
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;
				return {
					commit: {
						revision,
						change: changesetCodec.decode(changeset),
					},
					sessionId: originatorId,
				};
			},
		},
	);
}
