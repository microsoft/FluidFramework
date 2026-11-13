/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import * as Type from "typebox/type";
import type { TSchema } from "typebox";

import { type EncodedRevisionTag, RevisionTagSchema, SessionIdSchema } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import { EncodedCustomMetadataTree } from "./customMetadataFormat.js";
import { MessageFormatVersion } from "./messageFormat.js";

/**
 * A commit message in {@link MessageFormatVersion.vHistoryCompaction}.
 * @remarks Identical to a {@link MessageFormatVersion.v7} message except for its version.
 */
export interface EncodedCommitMessage {
	readonly version: typeof MessageFormatVersion.vHistoryCompaction;
	readonly revision: EncodedRevisionTag;
	readonly originatorId: SessionId;
	readonly changeset: JsonCompatibleReadOnly;
	readonly customMetadata?: EncodedCustomMetadataTree;
}

/**
 * A message that marks or unmarks a main-branch revision as preserved from history compaction.
 * @remarks
 * `revision` is encoded relative to `originatorId` (the client sending the message), like a commit's revision.
 */
export interface EncodedPreserveRevisionMessage {
	readonly version: typeof MessageFormatVersion.vHistoryCompaction;
	readonly type: "preserveRevision";
	readonly originatorId: SessionId;
	readonly revision: EncodedRevisionTag;
	readonly preserved: boolean;
}

export type Message = EncodedCommitMessage | EncodedPreserveRevisionMessage;

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const Message = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Union([
		Type.Object({
			version: Type.Literal(MessageFormatVersion.vHistoryCompaction),
			revision: RevisionTagSchema,
			originatorId: SessionIdSchema,
			changeset: tChange,
			customMetadata: Type.Optional(EncodedCustomMetadataTree),
		}),
		Type.Object({
			version: Type.Literal(MessageFormatVersion.vHistoryCompaction),
			type: Type.Literal("preserveRevision"),
			originatorId: SessionIdSchema,
			revision: RevisionTagSchema,
			preserved: Type.Boolean(),
		}),
	]);
