/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export interface IAlfredTenant {
	id: string;
	key: string;
}

/**
 * Session information that includes the server urls and session status
 * @alpha
 */
export interface ISession {
	/**
	 * Orderer url of the session.
	 */
	ordererUrl: string;
	/**
	 * WebSocket server url of the session
	 */
	deltaStreamUrl: string;
	/**
	 * Historian url of the session
	 */
	historianUrl: string;
	/**
	 * Message broker ID of the session
	 */
	messageBrokerId?: string;
	/**
	 * Whether session is "alive".
	 * Session is considered alive if it has been "discovered" via the HTTP endpoint
	 * for session discovery, or via document creation. A session being "alive"
	 * does not indicate whether there are any or have been any active session members.
	 * Tracking "discovered" state in addition to "active" state avoids edge cases where
	 * 2 clients attempt to join simulataneously and possibly discover different session locations.
	 *
	 * This could be better named as `isSessionDiscovered`,
	 * but we must keep `isSessionAlive` for backwards compatibility.
	 */
	isSessionAlive: boolean;
	/**
	 * Whether session is "active".
	 * Session is considered "active" if there has been activity within the last 10 minutes.
	 * Activity time window is defined by `DefaultServiceConfiguration.documentLambda.partitionActivityTimeout`.
	 */
	isSessionActive: boolean;

	/**
	 * Whether the session stickiness should be ignored during session discovery.
	 * Session stickiness is ignored if the landed cluster is in draining process.
	 * Session should be landed on a new cluster immediately if the session stickiness is ignored.
	 * @defaultValue `false` if undefined
	 */
	ignoreSessionStickiness?: boolean;
}

/**
 * Interface for managing abort signals. It is used to map abort signals to HTTP requests.
 * This is useful for tracking the status of requests and handling cancellations.
 * @internal
 */
export interface IAbortControllerManager {
	/**
	 * Adds an abort signal to the manager.
	 * @param abortController - The abort signal to add.
	 * @param correlationId - The ID of the request.
	 */
	addAbortController(abortController: AbortController, correlationId?: string): void;

	/**
	 * Removes an abort signal from the manager.
	 * @param correlationId - The ID of the request.
	 */
	removeAbortController(correlationId?: string): void;

	/**
	 * Gets the abort signal for a specific request ID.
	 * @param correlationId - The ID of the request.
	 * @returns The abort signal associated with the correlation ID, or undefined if not found.
	 */
	getAbortController(correlationId?: string): AbortController | undefined;
}
