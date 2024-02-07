/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util/index.js";
import { ICodecOptions, IJsonCodec, withSchemaValidation } from "../codec/index.js";
import {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import { SchemaAndPolicy } from "../feature-libraries/index.js";
import { DecodedMessage } from "./messageTypes.js";
import { Message } from "./messageFormat.js";

export interface MessageEncodingContext {
	schema?: SchemaAndPolicy;
}

export function makeMessageCodec<TChangeset>(
	changeCodec: ChangeFamilyCodec<TChangeset>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): IJsonCodec<
	DecodedMessage<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	MessageEncodingContext
> {
	// TODO: consider adding version and using makeVersionedValidatedCodec
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
				{ commit, sessionId: originatorId }: DecodedMessage<TChangeset>,
				context: MessageEncodingContext,
			) => {
				const message: Message = {
					revision: revisionTagCodec.encode(commit.revision, { originatorId }),
					originatorId,
					changeset: changeCodec.encode(commit.change, {
						originatorId,
						schema: context.schema,
					}),
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset } = encoded as unknown as Message;
				return {
					commit: {
						revision: revisionTagCodec.decode(revision, { originatorId }),
						change: changeCodec.decode(changeset, { originatorId }),
					},
					sessionId: originatorId,
				};
			},
		},
		options.jsonValidator,
	);
}
