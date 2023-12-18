/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IWebSocket } from "./http";

/**
 * Interface of web socket tracker
 * it tracks the mapping of web socket and token used to establish the socket connection
 * @internal
 */
export interface IWebSocketTracker {
	// Add a socket to internal map
	addSocketForToken(compositeTokenId: string, webSocket: IWebSocket);

	// Get socket objects from internal map
	getSocketsForToken(compositeTokenId: string): IWebSocket[];

	addSocket(webSocket: IWebSocket);

	// Remove socket from tracking
	// Return true if socket is removed, false if socket is not found
	removeSocket(socketId: string): boolean;

	// Get all tracked sockets
	getAllSockets(): IWebSocket[];
}
