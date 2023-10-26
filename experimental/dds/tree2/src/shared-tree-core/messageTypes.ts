/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GraphCommit, SessionId } from "../core";

export interface DecodedMessage<TChange> {
	commit: GraphCommit<TChange>;
	sessionId: SessionId;
}
