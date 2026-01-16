/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import { type TSchema, Type } from "@sinclair/typebox";

import { type EncodedRevisionTag, RevisionTagSchema, SessionIdSchema } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";
import { MessageFormatVersion } from "./messageFormat.js";

/**
 * The format of messages that SharedTree sends and receives.
 */
export interface Message {
	/**
	 * The revision tag for the change in this message
	 */
	readonly revision: EncodedRevisionTag;
	/**
	 * The stable ID that identifies the originator of the message.
	 */
	readonly originatorId: SessionId;
	/**
	 * The changeset to be applied.
	 */
	readonly changeset: JsonCompatibleReadOnly;

	/**
	 * The version of the message. This controls how the message is encoded.
	 *
	 * This was not set historically and was added before making any breaking changes to the format.
	 * For that reason, absence of a 'version' field is synonymous with version 1.
	 */
	readonly version?:
		| typeof MessageFormatVersion.v1
		| typeof MessageFormatVersion.v2
		| typeof MessageFormatVersion.v3
		| typeof MessageFormatVersion.v4
		| typeof MessageFormatVersion.v6;
}

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const Message = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		revision: RevisionTagSchema,
		originatorId: SessionIdSchema,
		changeset: tChange,
		version: Type.Optional(
			Type.Union([
				Type.Literal(MessageFormatVersion.v1),
				Type.Literal(MessageFormatVersion.v2),
				Type.Literal(MessageFormatVersion.v3),
				Type.Literal(MessageFormatVersion.v4),
				Type.Literal(MessageFormatVersion.v6),
			]),
		),
	});
