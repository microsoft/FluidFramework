/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IIdCompressor,
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
} from "@fluidframework/runtime-definitions";
import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util";
import { ICodecOptions, IJsonCodec, withSchemaValidation } from "../codec";
import { DecodedMessage } from "./messageTypes";
import { Message } from "./messageFormat";

export function makeMessageCodec<TChangeset>(
	changesetCodec: IJsonCodec<TChangeset>,
	options: ICodecOptions,
): IJsonCodec<DecodedMessage<TChangeset>> {
	return withSchemaValidation<DecodedMessage<TChangeset>, TAnySchema>(
		Message(changesetCodec.encodedSchema ?? Type.Any()),
		{
			encode: (
				{ commit, sessionId }: DecodedMessage<TChangeset>,
				idCompressor?: IIdCompressor,
			) => {
				const revision =
					idCompressor !== undefined
						? idCompressor.normalizeToOpSpace(
								commit.revision as SessionSpaceCompressedId,
						  )
						: commit.revision;

				const message: Message = {
					revision,
					originatorId: sessionId,
					changeset: changesetCodec.encode(commit.change, idCompressor),
				};
				return message as unknown as JsonCompatibleReadOnly;
			},

			decode: (encoded: JsonCompatibleReadOnly, idCompressor?: IIdCompressor) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;

				const maybeNormalizedRevision =
					idCompressor !== undefined
						? idCompressor.normalizeToSessionSpace(
								revision as OpSpaceCompressedId,
								originatorId as SessionId,
						  )
						: revision;

				return {
					commit: {
						revision: maybeNormalizedRevision,
						change: changesetCodec.decode(changeset),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
