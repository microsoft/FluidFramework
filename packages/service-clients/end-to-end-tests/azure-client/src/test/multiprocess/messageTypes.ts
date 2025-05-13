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
	| attendeeConnectedEvent
	| ReadyEvent
	| DisconnectedSelfEvent
	| ErrorEvent;
interface AttendeeDisconnectedEvent {
	event: "attendeeDisconnected";
	attendeeId: AttendeeId;
}

interface attendeeConnectedEvent {
	event: "attendeeConnected";
	attendeeId: AttendeeId;
}

interface ReadyEvent {
	event: "ready";
	containerId: string;
	attendeeId: AttendeeId;
}

interface DisconnectedSelfEvent {
	event: "disconnectedSelf";
	attendeeId: AttendeeId;
}
interface ErrorEvent {
	event: "error";
	error: string;
}
