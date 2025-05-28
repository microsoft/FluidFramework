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
 * @internal
 */
export interface SystemDatastore {
	"system:presence": SystemWorkspaceDatastore;
}

/**
 * @internal
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
 * @internal
 */
export const datastoreUpdateMessageType = "Pres:DatastoreUpdate";
interface DatastoreUpdateMessage {
	type: typeof datastoreUpdateMessageType;
	content: {
		sendTimestamp: number;
		avgLatency: number;
		acknowledgementId?: number;
		isComplete?: true;
		data: DatastoreMessageContent;
	};
}

/**
 * @internal
 */
export type OutboundDatastoreUpdateMessage = OutboundExtensionMessage<DatastoreUpdateMessage>;

/**
 * @internal
 */
export type InboundDatastoreUpdateMessage =
	VerifiedInboundExtensionMessage<DatastoreUpdateMessage>;

/**
 * @internal
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
 * @internal
 */
export const acknowledgementMessageType = "Pres:Ack";

interface AcknowledgementMessage {
	type: typeof acknowledgementMessageType;
	content: {
		id: number;
	};
}

/**
 * @internal
 */
export type OutboundAcknowledgementMessage = OutboundExtensionMessage<AcknowledgementMessage>;

/**
 * @internal
 */
export type OutboundClientJoinMessage = OutboundExtensionMessage<ClientJoinMessage>;

/**
 * @internal
 */
export type InboundClientJoinMessage = VerifiedInboundExtensionMessage<ClientJoinMessage>;

/**
 * @internal
 */
export type SignalMessages =
	| AcknowledgementMessage
	| ClientJoinMessage
	| DatastoreUpdateMessage;
