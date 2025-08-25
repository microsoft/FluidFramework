/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureUser } from "@fluidframework/azure-client/internal";
import type { JsonSerializable } from "@fluidframework/core-interfaces/internal";
// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";

/**
 * Message types sent from the orchestrator to the child processes
 */
export type MessageToChild =
	| ConnectCommand
	| DisconnectSelfCommand
	| RegisterWorkspaceCommand
	| GetLatestValueCommand
	| GetLatestMapValueCommand
	| SetLatestValueCommand
	| SetLatestMapValueCommand
	| PingCommand;

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
 * Instructs a child process to register for state objects in a workspace given a workspaceId
 * A {@link WorkspaceRegisteredEvent} should be expected in response.
 */
interface RegisterWorkspaceCommand {
	command: "registerWorkspace";
	workspaceId: string;
	/**
	 * Register a Latest state for this workspace.
	 */
	latest?: true;
	/**
	 * Register a LatestMap state for this workspace.
	 */
	latestMap?: true;
}

/**
 * Instructs a child process to set the latest value.
 * We then can wait for {@link LatestValueUpdatedEvent} from other clients to know when an update occurs that represents this change.
 * Note: The client doesn't guarantee that the update message is directly related to this set command.
 */
interface SetLatestValueCommand {
	command: "setLatestValue";
	workspaceId: string;
	value: JsonSerializable<unknown>;
}

/**
 * Instructs a child process to set the latest map value.
 * We then can wait for {@link LatestMapValueUpdatedEvent} from other clients to know when an update occurs that represents this change.
 * Note: The client doesn't guarantee that the update message is directly related to this set command.
 */
interface SetLatestMapValueCommand {
	command: "setLatestMapValue";
	workspaceId: string;
	key: string;
	value: JsonSerializable<unknown>;
}

/**
 * Instructs a child process to get the latest value.
 * A {@link LatestValueGetResponseEvent} should be expected in response.
 */
interface GetLatestValueCommand {
	command: "getLatestValue";
	workspaceId: string;
	attendeeId?: AttendeeId;
}

/**
 * Instructs a child process to get the latest map value.
 * A {@link LatestMapValueGetResponseEvent} should be expected in response.
 */
interface GetLatestMapValueCommand {
	command: "getLatestMapValue";
	workspaceId: string;
	key: string;
	attendeeId?: AttendeeId;
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
	| ErrorEvent
	| LatestMapValueGetResponseEvent
	| LatestMapValueUpdatedEvent
	| LatestValueGetResponseEvent
	| LatestValueUpdatedEvent
	| WorkspaceRegisteredEvent;

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
 * Sent from the child processes to the orchestrator in response to latest value update.
 */
export interface LatestValueUpdatedEvent {
	event: "latestValueUpdated";
	workspaceId: string;
	attendeeId: AttendeeId;
	value: unknown;
}

/**
 * Sent from the child processes to the orchestrator in response to latest map value update.
 */
export interface LatestMapValueUpdatedEvent {
	event: "latestMapValueUpdated";
	workspaceId: string;
	attendeeId: AttendeeId;
	key: string;
	value: unknown;
}

/**
 * Sent from the child processes to the orchestrator in response to a {@link GetLatestValueCommand}.
 */
export interface LatestValueGetResponseEvent {
	event: "latestValueGetResponse";
	workspaceId: string;
	attendeeId: AttendeeId | undefined;
	value: unknown;
}

/**
 * Sent from the child processes to the orchestrator in response to a {@link GetLatestMapValueCommand}.
 */
export interface LatestMapValueGetResponseEvent {
	event: "latestMapValueGetResponse";
	workspaceId: string;
	attendeeId: AttendeeId | undefined;
	key: string;
	value: unknown;
}

/**
 * Sent from the child process to acknowledge workspace registration.
 */
interface WorkspaceRegisteredEvent {
	event: "workspaceRegistered";
	workspaceId: string;
	latest?: boolean;
	latestMap?: boolean;
}

/**
 * Sent at any time to indicate an error.
 */
interface ErrorEvent {
	event: "error";
	error: string;
}
