/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluidframework/common-utils";
import type { IClient, IConnected } from "@fluidframework/protocol-definitions";
import type {
	IClientManager,
	IClusterDrainingChecker,
	ICollaborationSessionTracker,
	ILogger,
	IOrdererConnection,
	IOrdererManager,
	IRevokedTokenChecker,
	ITenantManager,
	IThrottleAndUsageStorageManager,
	IThrottler,
	IWebSocketTracker,
} from "@fluidframework/server-services-core";
import { IEvent } from "../events";
import type { IRuntimeSignalEnvelope } from "../utils";
import type { ExpirationTimer } from "./utils";

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

	/**
	 * Connection disposal function to clean up resources and connections after client disconnects.
	 */
	dispose: () => void;
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

export interface INexusLambdaSettings {
	maxTokenLifetimeSec: number;
	isTokenExpiryEnabled: boolean;
	isClientConnectivityCountingEnabled: boolean;
	maxNumberOfClientsPerDocument: number;
	numberOfMessagesPerTrace: number;
}

export interface INexusLambdaDependencies {
	ordererManager: IOrdererManager;
	tenantManager: ITenantManager;
	clientManager: IClientManager;
	logger: ILogger;

	throttleAndUsageStorageManager?: IThrottleAndUsageStorageManager;
	throttlers: {
		connectionsPerTenant?: IThrottler;
		connectionsPerCluster?: IThrottler;
		submitOps?: IThrottler;
		submitSignals?: IThrottler;
	};

	socketTracker?: IWebSocketTracker;
	revokedTokenChecker?: IRevokedTokenChecker;
	clusterDrainingChecker?: IClusterDrainingChecker;

	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>;
	collaborationSessionTracker?: ICollaborationSessionTracker;
}

export interface INexusLambdaConnectionStateTrackers {
	expirationTimer: ExpirationTimer;
	connectionsMap: Map<string, IOrdererConnection>;
	connectionTimeMap: Map<string, number>;
	scopeMap: Map<string, string[]>;
	clientMap: Map<string, IClient>;
	roomMap: Map<string, IRoom>;
	disconnectedOrdererConnections: Set<string>;
	disconnectedClients: Set<string>;
	supportedFeaturesMap: Map<string, Record<string, unknown>>;
}
