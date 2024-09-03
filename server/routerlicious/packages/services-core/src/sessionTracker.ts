/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";

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
	joined: number;
	/**
	 * Read/Write permissions for the client.
	 */
	permissions: ScopeType[];
	/**
	 * Whether the client is a Summarizer client.
	 */
	isSummarizer: boolean;
}

/**
 * Information about a collaboration session including its current state.
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
	 * List of clients currently connected to the session.
	 */
	connectedClients: ICollaborationSessionClient[];
	/**
	 * Time when the session was started in milliseconds since epoch.
	 */
	startedTime: number;
	/**
	 * Time when the session was last active in milliseconds since epoch.
	 */
	lastActiveTime: number;
}

/**
 * A session tracker is used to track the active client sessions for a document.
 * It should be used to track the start and end of client sessions, and use that information to determine when a
 * document is no longer active.
 * @internal
 */
export interface ICollaborationSessionTracker {
	/**
	 * Start tracking a new client session for a document. This could be a client starting a session on an inactive document,
	 * or a client joining a session on an already active document.
	 * The caller should not have to know the current session state of a document, but can provide the current state if known
	 * to avoid unnecessary lookups.
	 *
	 * @param client - Information about the unique client joining/starting the session.
	 * @param sessionInfo - Information about the document session being joined/started. At a minimum, must include the documentId and tenantId.
	 */
	startClientSession(
		client: ICollaborationSessionClient,
		sessionInfo: Partial<ICollaborationSession> &
			Pick<ICollaborationSession, "documentId" | "tenantId">,
	): void;
	/**
	 * End tracking a client session for a document. This could be the last client leaving a document, or a client leaving
	 * a document that still has other active clients.
	 * The caller should not have to know the current session state of a document, but can provide the current state if known
	 * to avoid unnecessary lookups.
	 *
	 * @param client - Information about the unique client leaving/ending the session.
	 * @param sessionInfo - Information about the document session being left/ended. At a minimum, must include the documentId and tenantId.
	 */
	endClientSession(
		client: ICollaborationSessionClient,
		sessionInfo: Partial<ICollaborationSession> &
			Pick<ICollaborationSession, "documentId" | "tenantId">,
	): void;
}
