/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignalClient } from "@fluidframework/protocol-definitions";

/**
 * Client information used for tracking a collaboration session.
 * @internal
 */
export interface ICollaborationSessionClient {
	/**
	 * Unique identifier for the client.
	 */
	clientId: string;
	/**
	 * Time when the client joined the session.
	 */
	joinedTime: number;
	/**
	 * Whether the client is a write client (can produce Ops).
	 */
	isWriteClient: boolean;
	/**
	 * Whether the client is an interactive user (false) or summarizer client (true).
	 */
	isSummarizerClient: boolean;
}

/**
 * Properties tracked for telemetry about a collaboration session.
 * @internal
 */
export interface ICollaborationSessionTelemetryProperties {
	/**
	 * Whether the session has ever had a write client.
	 *
	 * @remarks
	 * "Read-only" sessions are special special cases that should be separated in service telemetry.
	 */
	hadWriteClient: boolean;
	/**
	 * The number of unique clients that have joined the session over its lifetime.
	 */
	totalClientsJoined: number;
	/**
	 * The maximum number of clients that have been connected to the session at the same time.
	 */
	maxConcurrentClients: number;
}

/**
 * Information about a collaboration session including its current state.
 *
 * @remarks
 * Should not include information about individual clients in the session, and
 * should not include customer-content because it is not guaranteed to be removed within a timely manner.
 * @internal
 */
export interface ICollaborationSession {
	/**
	 * Unique identifier for the document.
	 */
	documentId: string;
	/**
	 * Unique identifier for the tenant that owns the document.
	 */
	tenantId: string;
	/**
	 * Time when the first client joined the session.
	 *
	 * @remarks
	 * Use this value to determine how long the session has been/was active.
	 */
	firstClientJoinTime: number;
	/**
	 * Time when the last client left the session.
	 * Undefined if the session is still active and the last client has not left
	 * or a new client re-joined the session before it expired.
	 *
	 * @remarks
	 * Use this value to determine if/when a session should expire.
	 */
	lastClientLeaveTime: number | undefined;

	/**
	 * {@inheritdoc ICollaborationSessionTelemetryProperties}
	 */
	telemetryProperties: ICollaborationSessionTelemetryProperties;
}

/**
 * Manages the source-of-truth for active sessions in a collaboration service.
 *
 * @remarks
 * In a multi-service-instance environment, this should be trusted to know of all sessions across all service instances.
 * @internal
 */
export interface ICollaborationSessionManager {
	/**
	 * Add a new session to the manager.
	 *
	 * @param session - Information about the session to add, including the document and tenant IDs.
	 */
	addOrUpdateSession(session: ICollaborationSession): Promise<void>;
	/**
	 * Remove a session from the manager.
	 *
	 * @param session - Information about the session to remove, specifically the document and tenant IDs.
	 */
	removeSession(sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">): Promise<void>;
	/**
	 * Get current information about a session.
	 *
	 * @param session - Information about the session to get, specifically the document and tenant IDs.
	 */
	getSession(
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
	): Promise<ICollaborationSession | undefined>;
	/**
	 * Get a list of all active sessions.
	 */
	getAllSessions(): Promise<ICollaborationSession[]>;
}

/**
 * Used to track the active client sessions for a document.
 *
 * @remarks
 * It should be used to track the start and end of client sessions, and use that information to determine when a
 * document is no longer active.
 * @internal
 */
export interface ICollaborationSessionTracker {
	/**
	 * Start tracking a new client session for a document.
	 *
	 * @remarks
	 * This could be a client starting a session on an inactive document,
	 * or a client joining a session on an already active document.
	 * The caller should not have to know the current session state of a document, but can provide the current state if known
	 * to avoid unnecessary lookups.
	 *
	 * @param client - Information about the unique client joining/starting the session.
	 * @param sessionInfo - Information to identify the document session being joined/started.
	 * @param otherConnectedClients - Optional list of other clients currently connected to the document session.
	 */
	startClientSession(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<void>;
	/**
	 * End tracking a client session for a document.
	 *
	 * @remarks
	 * This could be the last client leaving a document, or a client leaving
	 * a document that still has other active clients.
	 * The caller should not have to know the current session state of a document, but can provide the current state if known
	 * to avoid unnecessary lookups.
	 *
	 * @param client - Information about the unique client leaving/ending the session.
	 * @param sessionInfo - Information to identify the document session being joined/started.
	 * @param otherConnectedClients - Optional list of other clients currently connected to the document session.
	 */
	endClientSession(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<void>;
	/**
	 * Remove all currently tracked sessions that are no longer active and should have expired based on the session timeout.
	 *
	 * @remarks
	 * This should be called periodically to ensure that sessions are not kept active indefinitely due to the service with the original
	 * timer shutting down or other errors related to session clean up.
	 */
	pruneInactiveSessions(): Promise<void>;
}
