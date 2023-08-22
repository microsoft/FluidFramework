/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { IClient, IConnected } from "@fluidframework/protocol-definitions";

/**
 * Connection details of a client
 */
export interface IConnectedClient {
	connection: IConnected;

	details: IClient;

	connectVersions: string[];
}

/**
 * Address of socket message.
 */
export interface IRoom {
	tenantId: string;
	documentId: string;
}

/**
 * Payload of the event emitted when the broadcastSignal endpoint is called.
 */
export interface IBroadcastSignalEventPayload {
	signalRoom: IRoom;
	signalContent: string;
}

/**
 * Events emitted during Fluid clients collaboration session
 */
export interface ICollaborationSessionEvents extends IEvent {
	/**
	 * Emitted when the broadcastSignal endpoint is called by an external
	 * server to communicate with all Fluid clients in a session via signal
	 */
	(
		event: "broadcastSignal",
		listener: (broadcastSignal: IBroadcastSignalEventPayload) => void,
	): void;
}
