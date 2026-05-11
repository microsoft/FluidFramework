/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { WebSocketTracker } from "../webSocketTracker";
import { IWebSocket } from "@fluidframework/server-services-core";

describe("WebSocketTracker", () => {
	// let webSocketTracker: WebSocketTracker;
	let webSocket1: IWebSocket;
	let webSocket2: IWebSocket;

	beforeEach(() => {
		webSocket1 = {
			id: "socketId1",
		} as IWebSocket;
		webSocket2 = {
			id: "socketId2",
		} as IWebSocket;
	});

	it("should add and retrieve a socket for a token", () => {
		let webSocketTracker: WebSocketTracker = new WebSocketTracker();
		const compositeTokenId = "token1";
		webSocketTracker.addSocketForToken(compositeTokenId, webSocket1);

		const sockets = webSocketTracker.getSocketsForToken(compositeTokenId);
		assert.strictEqual(sockets.length, 1), "Should have 1 socket";
		assert.strictEqual(sockets[0].id, webSocket1.id, "Socket id should match");
	});

	it("should work for multiple calls", () => {
		let webSocketTracker: WebSocketTracker = new WebSocketTracker();
		let webSocket1: IWebSocket = {
			id: "socketId1",
		} as IWebSocket;
		const compositeTokenId1 = "token1";

		// Add 1st socket
		webSocketTracker.addSocketForToken(compositeTokenId1, webSocket1);

		let sockets = webSocketTracker.getSocketsForToken(compositeTokenId1);
		assert.strictEqual(sockets.length, 1, "Should have 1 socket");
		assert.strictEqual(sockets[0].id, webSocket1.id, "Should be socket id 1");

		// Add 2nd socket
		const compositeTokenId2 = "token2";
		webSocketTracker.addSocketForToken(compositeTokenId2, webSocket2);

		// Check results: socket 2 should exist
		sockets = webSocketTracker.getSocketsForToken(compositeTokenId2);
		assert.strictEqual(sockets.length, 1);
		assert.strictEqual(sockets[0].id, webSocket2.id, "Should be socket id 2");

		sockets = webSocketTracker.getAllSockets();
		assert.strictEqual(sockets.length, 2, "Should have 2 sockets");

		// Remove the socket
		webSocketTracker.removeSocket(webSocket1.id);

		// Check results
		// socket 1 should not exist
		sockets = webSocketTracker.getSocketsForToken(compositeTokenId1);
		assert.strictEqual(sockets.length, 0, "Should be empty");

		// socket 2 should exist
		sockets = webSocketTracker.getSocketsForToken(compositeTokenId2);
		assert.strictEqual(sockets.length, 1);
		assert.strictEqual(sockets[0].id, webSocket2.id, "Should be socket id 2");

		// Should only have 1 socket
		sockets = webSocketTracker.getAllSockets();
		assert.strictEqual(sockets.length, 1), "Should only have 1 socket after removal";
	});

	it("should add socket", () => {
		let webSocketTracker: WebSocketTracker = new WebSocketTracker();
		webSocketTracker.addSocket(webSocket1);

		const sockets = webSocketTracker.getAllSockets();
		assert.strictEqual(sockets.length, 1), "Should have 1 socket";
		assert.strictEqual(sockets[0].id, webSocket1.id, "Socket id should match");
	});
});
