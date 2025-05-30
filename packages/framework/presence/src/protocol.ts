/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	OutboundExtensionMessage,
	VerifiedInboundExtensionMessage,
} from "@fluidframework/container-runtime-definitions/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { AttendeeId } from "./presence.js";
import type { ClientUpdateEntry } from "./presenceStates.js";
import type { SystemWorkspaceDatastore } from "./systemWorkspace.js";

/**
 * Datastore that contains system workspace data
 */
export interface SystemDatastore {
	"system:presence": SystemWorkspaceDatastore;
}

/**
 * General datastore (and message) structure.
 */
export interface GeneralDatastoreMessageContent {
	[WorkspaceAddress: string]: {
		[StateValueManagerKey: string]: {
			[AttendeeId: AttendeeId]: ClientUpdateEntry;
		};
	};
}

type DatastoreMessageContent = GeneralDatastoreMessageContent & SystemDatastore;

/**
 * Datastore update message type.
 */
export const datastoreUpdateMessageType = "Pres:DatastoreUpdate";
interface DatastoreUpdateMessage {
	type: typeof datastoreUpdateMessageType;
	content: {
		sendTimestamp: number;
		avgLatency: number;
		isComplete?: true;
		data: DatastoreMessageContent;
	};
}

/**
 * Outbound datastore update message
 */
export type OutboundDatastoreUpdateMessage = OutboundExtensionMessage<DatastoreUpdateMessage>;

/**
 * Inbound and verified datastore update message
 */
export type InboundDatastoreUpdateMessage =
	VerifiedInboundExtensionMessage<DatastoreUpdateMessage>;

/**
 * Client join message type.
 */
export const joinMessageType = "Pres:ClientJoin";
interface ClientJoinMessage {
	type: typeof joinMessageType;
	content: {
		updateProviders: ClientConnectionId[];
		sendTimestamp: number;
		avgLatency: number;
		data: DatastoreMessageContent;
	};
}

/**
 * Outbound client join message
 */
export type OutboundClientJoinMessage = OutboundExtensionMessage<ClientJoinMessage>;

/**
 * Inbound and verified client join message
 */
export type InboundClientJoinMessage = VerifiedInboundExtensionMessage<ClientJoinMessage>;

/**
 * Messages structures that can be sent and received as understood in the presence protocol
 */
export type SignalMessages = ClientJoinMessage | DatastoreUpdateMessage;
