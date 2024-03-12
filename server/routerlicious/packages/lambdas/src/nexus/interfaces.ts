/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/core-interfaces";
import { IClient, IConnected } from "@fluidframework/protocol-definitions";
import { IRuntimeSignalEnvelope } from "../utils";

/**
 * Connection details of a client.
 */
export interface IConnectedClient {
	/**
	 * Message sent to indicate a client has successfully connected to the server.
	 * Includes client and service connection details to establish communication limits and expectations.
	 */
	connection: IConnected;

	/**
	 * Connected client details including associated user details, permissions, and connection mode.
	 * Most details come from the {@link IConnect.client} message property, but {@link IClient.user}
	 * and {@link IClient.scopes} properties are overwritten by the parsed claims from the validated
	 * {@link IConnect.token}.
	 */
	details: IClient;

	/**
	 * Client protocol versions of standard semver types.
	 */
	connectVersions: string[];
}

/**
 * Identifies a collaboration session for a particular document in a particular instance (tenant) of a Fluid Service.
 * @internal
 */
export interface IRoom {
	/**
	 * ID of instance of an ordering service that the application will interact with.
	 */
	tenantId: string;

	/**
	 * ID of the document (typically known as container ID within Fluid Framework).
	 */
	documentId: string;
}

/**
 * Payload of the event emitted when the broadcastSignal endpoint is called.
 * @internal
 */
export interface IBroadcastSignalEventPayload {
	/**
	 * The room the signal is sent to.
	 */
	signalRoom: IRoom;
	/**
	 * Content of the runtime signal introduced from the broadcast-signal endpoint.
	 */
	signalContent: IRuntimeSignalEnvelope;
}

/**
 * Events emitted during Fluid clients collaboration session
 * @internal
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
