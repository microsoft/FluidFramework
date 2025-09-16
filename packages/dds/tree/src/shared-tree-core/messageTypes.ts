/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import type { GraphCommit } from "../core/index.js";
import type { BranchId } from "./branch.js";

export interface DecodedMessage<TChange> {
	sessionId: SessionId;
	commit: GraphCommit<TChange>;
	branchId: BranchId;
}
