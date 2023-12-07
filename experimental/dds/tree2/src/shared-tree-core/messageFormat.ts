/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type, TSchema } from "@sinclair/typebox";
import { JsonCompatibleReadOnly } from "../util";
import { EncodedRevisionTag, RevisionTagSchema, SessionIdSchema } from "../core";

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
	readonly originatorId: string;
	/**
	 * The changeset to be applied.
	 */
	readonly changeset: JsonCompatibleReadOnly;
}

export const Message = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		revision: RevisionTagSchema,
		originatorId: SessionIdSchema,
		changeset: tChange,
	});
