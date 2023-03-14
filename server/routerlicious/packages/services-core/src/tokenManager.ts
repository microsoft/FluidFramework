/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IWebSocket } from "./http";

/**
 * Interface of web socket tracker
 * it tracks the mapping of web socket and token used to establish the socket connection
 */
export interface IWebSocketTracker {
	// Add a socket to internal map
	addSocket(compositeTokenId: string, webSocket: IWebSocket);

	// Get socket objects from internal map
	getSockets(compositeTokenId: string): IWebSocket[];

	// Remove socket from tracking
	// Return true if socket is removed, false if socket is not found
	removeSocket(socketId: string): boolean;
}

/**
 * Interface of Json Web Token(JWT) manager
 * It is mainly used to manage token revocation
 */
export interface IJsonWebTokenManager {
	initialize(): Promise<void>;

	start();

	stop(): Promise<void>;

	// Revoke the access of a token given its jwtId
	revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<void>;

	// Check if a given token id is revoked
	isTokenRevoked(tenantId: string, documentId: string, jwtId: string): Promise<boolean>;
}

export function createCompositeTokenId(
	tenantId: string,
	documentId: string,
	jwtId: string,
): string {
	return `${tenantId}/${documentId}/${jwtId}`;
}