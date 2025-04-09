/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureUser } from "@fluidframework/azure-client/internal";
// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/alpha";

export type MessageToChild = ConnectCommand | DisconnectSelfCommand;
interface ConnectCommand {
	command: "connect";
	user: AzureUser;
	containerId?: string;
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
	sessionId: AttendeeId;
}

interface AttendeeJoinedEvent {
	event: "attendeeJoined";
	sessionId: AttendeeId;
}

interface ReadyEvent {
	event: "ready";
	containerId: string;
	sessionId: AttendeeId;
}

interface DisconnectedSelfEvent {
	event: "disconnectedSelf";
	sessionId: AttendeeId;
}
interface ErrorEvent {
	event: "error";
	error: string;
}
