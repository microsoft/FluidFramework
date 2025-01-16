/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type AzureUser } from "@fluidframework/azure-client/internal";
// eslint-disable-next-line import/no-internal-modules
import { type ClientSessionId } from "@fluidframework/presence/alpha";

export interface MessageFromChild {
	event: "attendeeDisconnected" | "attendeeJoined" | "ready" | "disconnectedSelf";
	sessionId: ClientSessionId;
}

export interface MessageToChild {
	command: "connect" | "disconnectSelf";
	containerId: string;
	user: AzureUser;
}
