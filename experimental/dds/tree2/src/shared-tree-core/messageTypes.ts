/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/runtime-definitions";
import { GraphCommit } from "../core";

export interface DecodedMessage<TChange> {
	commit: GraphCommit<TChange>;
	sessionId: SessionId;
}
