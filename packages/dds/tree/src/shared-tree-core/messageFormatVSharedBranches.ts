/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import * as Type from "typebox/type";
import { type JsonCompatibleReadOnly, typeboxOptional } from "../util/index.js";
import type { TSchema } from "typebox";

import { type EncodedRevisionTag, RevisionTagSchema, SessionIdSchema } from "../core/index.js";

import type { EncodedBranchId } from "./branch.js";
import { EncodedCustomMetadataTree } from "./customMetadataFormat.js";
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

	/**
	 * Unique ID associated with the branch.
	 */
	readonly branchId?: EncodedBranchId;

	/**
	 * Application-defined name of the branch, if any.
	 * Not guaranteed to be unique.
	 */
	readonly branchName?: string;

	/**
	 * Arbitrary, application-defined metadata to persist alongside the commit in this message.
	 * @remarks See {@link GraphCommit.customMetadata}.
	 */
	readonly customMetadata?: EncodedCustomMetadataTree;

	/**
	 * The version of the message format.
	 */
	readonly version: typeof MessageFormatVersion.vSharedBranches;
}

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const Message = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object({
		revision: typeboxOptional(RevisionTagSchema),
		originatorId: SessionIdSchema,
		changeset: typeboxOptional(tChange),
		branchId: typeboxOptional(Type.Number()),
		branchName: typeboxOptional(Type.String()),
		customMetadata: typeboxOptional(EncodedCustomMetadataTree),
		version: Type.Literal(MessageFormatVersion.vSharedBranches),
	});
