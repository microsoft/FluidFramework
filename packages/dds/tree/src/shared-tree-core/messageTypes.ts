/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { GraphCommit } from "../core/index.js";

export interface DecodedMessage<TChange> {
	commit: GraphCommit<TChange>;
	sessionId: SessionId;
}
