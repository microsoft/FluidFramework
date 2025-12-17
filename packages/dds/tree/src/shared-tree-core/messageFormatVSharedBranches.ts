/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import { type TSchema, Type } from "@sinclair/typebox";

import { type EncodedRevisionTag, RevisionTagSchema, SessionIdSchema } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";
import type { EncodedBranchId } from "./branch.js";
import { MessageFormatVersion } from "./messageFormat.js";

/**
 * The format of messages that SharedTree sends and receives.
 */
export interface Message {
	/**
	 * The revision tag for the change in this message
	 */
	readonly revision?: EncodedRevisionTag;
	/**
	 * The stable ID that identifies the originator of the message.
	 */
	readonly originatorId: SessionId;
	/**
	 * The changeset to be applied.
	 */
	readonly changeset?: JsonCompatibleReadOnly;

	readonly branchId?: EncodedBranchId;

	/**
	 * The version of the message format.
	 */
	readonly version: typeof MessageFormatVersion.vSharedBranches;
}

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const Message = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		revision: Type.Optional(RevisionTagSchema),
		originatorId: SessionIdSchema,
		changeset: Type.Optional(tChange),
		branchId: Type.Optional(Type.Number()),
		version: Type.Literal(MessageFormatVersion.vSharedBranches),
	});
