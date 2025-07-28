/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IWebSocket } from "./http";

/**
 * Interface of web socket tracker
 * it tracks the mapping of web socket and token used to establish the socket connection
 * @internal
 */
export interface IWebSocketTracker {
	// Add a token to socket mapping
	addSocketForToken(compositeTokenId: string, webSocket: IWebSocket);

	// Get the socket objects with the given token
	getSocketsForToken(compositeTokenId: string): IWebSocket[];

	// Add a socket to tracking
	addSocket(webSocket: IWebSocket);

	// Remove a socket from tracking
	// Return true if socket is removed, false if socket is not found
	removeSocket(socketId: string): boolean;

	// Get all tracked socket objects
	getAllSockets(): IWebSocket[];
}
