/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureUser } from "@fluidframework/azure-client/internal";
// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";

/**
 * Message types sent from the orchestrator to the child processes
 */
export type MessageToChild = ConnectCommand | DisconnectSelfCommand | PingCommand;

/**
 * Can be sent to check child responsiveness.
 * An {@link AcknowledgeEvent} should be expected in response.
 */
interface PingCommand {
	command: "ping";
}

/**
 * Instructs a child process to connect to a Fluid container.
 * A {@link ConnectedEvent} should be expected in response.
 */
export interface ConnectCommand {
	command: "connect";
	user: AzureUser;
	/**
	 * The ID of the Fluid container to connect to.
	 * If not provided, a new Fluid container will be created.
	 */
	containerId?: string;
}

/**
 * Instructs a child process to disconnect from a Fluid container.
 * A {@link DisconnectedSelfEvent} should be expected in response.
 */
interface DisconnectSelfCommand {
	command: "disconnectSelf";
}

/**
 * Message types sent from the child processes to the orchestrator
 */
export type MessageFromChild =
	| AcknowledgeEvent
	| AttendeeConnectedEvent
	| AttendeeDisconnectedEvent
	| ConnectedEvent
	| DisconnectedSelfEvent
	| ErrorEvent;

/**
 * Sent from the child processes to the orchestrator in response to a {@link PingCommand}.
 */
interface AcknowledgeEvent {
	event: "ack";
}

/**
 * Sent arbitrarily to indicate a new attendee has connected.
 */
interface AttendeeConnectedEvent {
	event: "attendeeConnected";
	attendeeId: AttendeeId;
}

/**
 * Sent arbitrarily to indicate an attendee has disconnected.
 */
interface AttendeeDisconnectedEvent {
	event: "attendeeDisconnected";
	attendeeId: AttendeeId;
}

/**
 * Sent from the child processes to the orchestrator in response to a {@link ConnectCommand}.
 */
interface ConnectedEvent {
	event: "connected";
	containerId: string;
	attendeeId: AttendeeId;
}

/**
 * Sent from the child processes to the orchestrator in response to a {@link DisconnectSelfCommand}.
 */
interface DisconnectedSelfEvent {
	event: "disconnectedSelf";
	attendeeId: AttendeeId;
}

/**
 * Sent at any time to indicate an error.
 */
interface ErrorEvent {
	event: "error";
	error: string;
}
