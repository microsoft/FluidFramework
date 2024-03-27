/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecOptions, IJsonCodec, withSchemaValidation } from "../codec/index.js";
import {
	ChangeEncodingContext,
	ChangeFamilyCodec,
	EncodedRevisionTag,
	RevisionTag,
} from "../core/index.js";
import { SchemaAndPolicy } from "../feature-libraries/index.js";
import { JsonCompatibleReadOnly } from "../util/index.js";
import { Message } from "./messageFormat.js";
import { DecodedMessage } from "./messageTypes.js";

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
					version: 1,
				};
				return message as unknown as JsonCompatibleReadOnly;
			},
			decode: (encoded: JsonCompatibleReadOnly) => {
				const { revision, originatorId, changeset, version } =
					encoded as unknown as Message;
				assert(version === undefined || version === 1, "Unsupported message version");
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
