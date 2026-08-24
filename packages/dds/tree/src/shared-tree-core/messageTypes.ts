/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { GraphCommit } from "../core/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import type { BranchId } from "./branch.js";

export type DecodedMessage<TChange> = CommitMessage<TChange> | BranchMessage;

export interface MessageBase {
	sessionId: SessionId;
}

export interface CommitMessage<TChange> extends MessageBase {
	type: "commit";
	commit: GraphCommit<TChange>;
	branchId: BranchId;
	/**
	 * Application-defined metadata attached to {@link CommitMessage.commit}.
	 * @remarks
	 * This is only carried on the wire; it is never stored on the {@link GraphCommit} itself
	 * (rebasing a commit would drop it). See `PersistedCommitMetadataIndex`.
	 */
	persistedMetadata?: JsonCompatibleReadOnlyObject;
}

export interface BranchMessage extends MessageBase {
	type: "branch";
	branchId: BranchId;
	branchName?: string;
}
