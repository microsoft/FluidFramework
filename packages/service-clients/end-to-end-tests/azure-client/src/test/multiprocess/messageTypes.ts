/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureUser } from "@fluidframework/azure-client/internal";
// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";

export type MessageToChild =
	| ConnectCommand
	| DisconnectSelfCommand
	| SetLatestValueCommand
	| SetLatestMapValueCommand
	| GetLatestValueCommand
	| GetLatestMapValueCommand;

interface ConnectCommand {
	command: "connect";
	user: AzureUser;
	containerId?: string;
}

interface DisconnectSelfCommand {
	command: "disconnectSelf";
}

interface SetLatestValueCommand {
	command: "setLatestValue";
	workspaceId: string;
	value: unknown;
}

interface SetLatestMapValueCommand {
	command: "setLatestMapValue";
	workspaceId: string;
	key: string;
	value: unknown;
}

interface GetLatestValueCommand {
	command: "getLatestValue";
	workspaceId: string;
	attendeeId?: AttendeeId;
}

interface GetLatestMapValueCommand {
	command: "getLatestMapValue";
	workspaceId: string;
	key: string;
	attendeeId?: AttendeeId;
}

export type MessageFromChild =
	| AttendeeDisconnectedEvent
	| AttendeeConnectedEvent
	| ReadyEvent
	| DisconnectedSelfEvent
	| LatestValueUpdatedEvent
	| LatestMapValueUpdatedEvent
	| LatestValueGetResponseEvent
	| LatestMapValueGetResponseEvent
	| ErrorEvent;

interface AttendeeDisconnectedEvent {
	event: "attendeeDisconnected";
	attendeeId: AttendeeId;
}

interface AttendeeConnectedEvent {
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

export interface LatestValueUpdatedEvent {
	event: "latestValueUpdated";
	workspaceId: string;
	attendeeId: AttendeeId;
	value: unknown;
}

export interface LatestMapValueUpdatedEvent {
	event: "latestMapValueUpdated";
	workspaceId: string;
	attendeeId: AttendeeId;
	key: string;
	value: unknown;
}

export interface LatestValueGetResponseEvent {
	event: "latestValueGetResponse";
	workspaceId: string;
	attendeeId: AttendeeId | undefined;
	value: unknown;
}

export interface LatestMapValueGetResponseEvent {
	event: "latestMapValueGetResponse";
	workspaceId: string;
	attendeeId: AttendeeId | undefined;
	key: string;
	value: unknown;
}

interface ErrorEvent {
	event: "error";
	error: string;
}
