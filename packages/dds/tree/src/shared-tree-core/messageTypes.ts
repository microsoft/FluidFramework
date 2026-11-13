/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { GraphCommit, RevisionTag } from "../core/index.js";

import type { BranchId } from "./branch.js";

export type DecodedMessage<TChange> =
	| CommitMessage<TChange>
	| BranchMessage
	| PreserveRevisionMessage;

export interface MessageBase {
	sessionId: SessionId;
}

export interface CommitMessage<TChange> extends MessageBase {
	type: "commit";
	commit: GraphCommit<TChange>;
	branchId: BranchId;
}

export interface BranchMessage extends MessageBase {
	type: "branch";
	branchId: BranchId;
	branchName?: string;
}

/**
 * Marks or unmarks a main-branch revision as preserved, so that history compaction never removes it.
 * @remarks
 * Every client applies this message when it is sequenced, so all clients (including the summarizer) agree on the preserved set.
 * See `EditManager.setRevisionPreserved`.
 */
export interface PreserveRevisionMessage extends MessageBase {
	type: "preserveRevision";
	revision: RevisionTag;
	preserved: boolean;
}
