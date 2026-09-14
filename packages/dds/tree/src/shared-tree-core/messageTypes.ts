/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import type { IdCreationRange } from "@fluidframework/id-compressor/internal";

import type { GraphCommit } from "../core/index.js";

import type { BranchId } from "./branch.js";

export type DecodedMessage<TChange> = CommitMessage<TChange> | BranchMessage;

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

/** One independently sequenced encoded SharedTree message for runtime-free integration. */
export interface SequencedSharedTreeMessage {
	readonly contents: unknown;
	readonly idCreationRange?: IdCreationRange;
	readonly sequenceNumber: number;
	readonly referenceSequenceNumber: number;
	readonly minimumSequenceNumber: number;
	readonly local: boolean;
}
