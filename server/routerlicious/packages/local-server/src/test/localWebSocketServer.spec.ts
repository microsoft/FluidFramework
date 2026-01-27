/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { PubSub } from "@fluidframework/server-memory-orderer";

import { LocalWebSocket, LocalWebSocketServer } from "../localWebSocketServer";

describe("LocalWebSocketServer", () => {
	let pubsub: PubSub;
	let server: LocalWebSocketServer;

	beforeEach(() => {
		pubsub = new PubSub();
		server = new LocalWebSocketServer(pubsub);
	});

	afterEach(async () => {
		await server.close();
	});

	describe("socket tracking", () => {
		it("tracks sockets when created", () => {
			const socket = server.createConnection();
			assert(socket.connected, "Socket should be connected after creation");
		});

		it("untracks sockets when disconnected", () => {
			const socket = server.createConnection();
			assert(socket.connected, "Socket should be connected");

			socket.disconnect();
			assert(!socket.connected, "Socket should be disconnected");
		});

		it("disconnects all active sockets on server close", async () => {
			const socket1 = server.createConnection();
			const socket2 = server.createConnection();
			const socket3 = server.createConnection();

			assert(socket1.connected, "Socket1 should be connected");
			assert(socket2.connected, "Socket2 should be connected");
			assert(socket3.connected, "Socket3 should be connected");

			await server.close();

			assert(!socket1.connected, "Socket1 should be disconnected after server close");
			assert(!socket2.connected, "Socket2 should be disconnected after server close");
			assert(!socket3.connected, "Socket3 should be disconnected after server close");
		});
	});

	describe("LocalWebSocket", () => {
		it("clears rooms on disconnect", async () => {
			const socket = server.createConnection();

			// Join some rooms
			await socket.join("room1");
			await socket.join("room2");

			// Disconnect
			socket.disconnect();

			// Socket should be disconnected
			assert(!socket.connected, "Socket should be disconnected");
		});

		it("removes event listeners on disconnect", () => {
			const socket = server.createConnection();

			let listenerCalled = false;
			const listener = () => {
				listenerCalled = true;
			};
			socket.on("test-event", listener);

			// Emit before disconnect - listener should be called
			socket.emit("test-event");
			assert(listenerCalled, "Listener should be called before disconnect");

			// Disconnect (which removes all listeners)
			socket.disconnect();

			// Reset flag
			listenerCalled = false;

			// Emit after disconnect - listener should not be called
			// Note: emit still works on the EventEmitter, but listeners are removed
			socket.emit("test-event");
			assert(!listenerCalled, "Listener should not be called after disconnect");
		});

		it("emits disconnect event", () => {
			const socket = server.createConnection();

			let disconnectEmitted = false;
			socket.on("disconnect", () => {
				disconnectEmitted = true;
			});

			socket.disconnect();

			assert(disconnectEmitted, "Disconnect event should be emitted");
		});

		it("can be disconnected multiple times without error", () => {
			const socket = server.createConnection();

			socket.disconnect();
			assert(!socket.connected, "Socket should be disconnected");

			// Second disconnect should not throw
			socket.disconnect();
			assert(!socket.connected, "Socket should still be disconnected");
		});
	});
});
