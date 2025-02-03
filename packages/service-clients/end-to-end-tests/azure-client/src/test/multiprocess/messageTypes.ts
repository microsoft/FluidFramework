/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureUser } from "@fluidframework/azure-client/internal";
// eslint-disable-next-line import/no-internal-modules
import type { ClientSessionId } from "@fluidframework/presence/alpha";

export type MessageToChild = ConnectCommand | DisconnectSelfCommand;
interface ConnectCommand {
	command: "connect";
	user: AzureUser;
	containerId: string | undefined;
}

interface DisconnectSelfCommand {
	command: "disconnectSelf";
}

export type MessageFromChild =
	| AttendeeDisconnectedEvent
	| AttendeeJoinedEvent
	| ReadyEvent
	| DisconnectedSelfEvent
	| ErrorEvent;
interface AttendeeDisconnectedEvent {
	event: "attendeeDisconnected";
	sessionId: ClientSessionId;
}

interface AttendeeJoinedEvent {
	event: "attendeeJoined";
	sessionId: ClientSessionId;
}

interface ReadyEvent {
	event: "ready";
	containerId: string;
	sessionId: ClientSessionId;
}

interface DisconnectedSelfEvent {
	event: "disconnectedSelf";
	sessionId: ClientSessionId;
}
interface ErrorEvent {
	event: "error";
	error: string;
}
