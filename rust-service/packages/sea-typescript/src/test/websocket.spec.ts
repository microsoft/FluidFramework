/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import * as websocketBindings from "../../generated/websocket/node/sea_wasm.js";
import type { SeaSession } from "../index.js";
import { openRemote } from "../websocket.js";

describe("WebSocket compatibility", () => {
	it("ordinary WebSocket compatibility bounds queues and preserves stream lifecycle", async function () {
		this.timeout(10000);
		const original = {
			WebSocket: Object.getOwnPropertyDescriptor(globalThis, "WebSocket"),
			WebSocketStream: Object.getOwnPropertyDescriptor(globalThis, "WebSocketStream"),
			WebTransport: Object.getOwnPropertyDescriptor(globalThis, "WebTransport"),
		};
		const sockets: TestSocket[] = [];
		/** Drives handshake, buffering, and callback failure paths without a network listener. */
		class TestSocket extends EventTarget {
			static nextBehavior: string | undefined;
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;
			readyState = 0;
			bufferedAmount = 0;
			protocol = "sea-stream-v1";
			sent: Uint8Array[] = [];
			onerror: ((event: Event) => void) | null = null;
			onopen: ((event: Event) => void) | null = null;
			onmessage: ((event: MessageEvent<string | ArrayBuffer>) => void) | null = null;
			onclose: ((event: Event) => void) | null = null;
			constructor(url: string) {
				super();
				sockets.push(this);
				const behavior = TestSocket.nextBehavior;
				TestSocket.nextBehavior = undefined;
				queueMicrotask(() => {
					if (this.readyState !== 0) return;
					if (behavior === "pending") return;
					if (behavior === "error") {
						this.onerror?.(new Event("error"));
						return;
					}
					if (behavior === "protocol") this.protocol = "wrong-protocol";
					this.readyState = 1;
					this.onopen?.(new Event("open"));
					if (url.endsWith("/sea/websocket") && behavior !== "no-token")
						this.message("a".repeat(64));
				});
			}
			message(data: string | ArrayBuffer): void {
				this.onmessage?.(new MessageEvent("message", { data }));
			}
			send(bytes: Uint8Array): void {
				this.sent.push(new Uint8Array(bytes).slice());
			}
			close(): void {
				this.readyState = 3;
				this.onclose?.(new Event("close"));
			}
		}
		const latestSocket = (): TestSocket => {
			const socket = sockets.at(-1);
			assert.ok(socket);
			return socket;
		};
		let transport: websocketBindings.SeaWebSocketTransport | undefined;
		const streams: websocketBindings.SeaWebSocketBidirectionalStream[] = [];
		try {
			Object.defineProperties(globalThis, {
				WebSocket: { value: TestSocket, configurable: true, writable: true },
				WebSocketStream: { value: undefined, configurable: true, writable: true },
				WebTransport: { value: undefined, configurable: true, writable: true },
			});
			for (const behavior of ["pending", "no-token", "error", "protocol"]) {
				TestSocket.nextBehavior = behavior;
				await assert.rejects(
					websocketBindings.SeaWebSocketTransport.connectOrdinary(
						"ws://localhost/sea/websocket",
						20,
					),
				);
				assert.equal(latestSocket().readyState, 3);
				assert(latestSocket().onmessage == null);
			}
			transport = await websocketBindings.SeaWebSocketTransport.connectOrdinary(
				"ws://localhost/sea/websocket",
				100,
			);
			const attempts = sockets.length;
			const options = new websocketBindings.SeaSessionOptions(undefined, false);
			try {
				await assert.rejects(
					websocketBindings.openRemote(
						websocketBindings.SeaBrowserTransportMode.PreferWebTransport,
						"https://localhost/sea",
						new Uint8Array(32),
						"ws://localhost/sea/websocket",
						100,
						undefined,
						options,
					),
				);
				assert.equal(
					sockets.length,
					attempts,
					"strict factory must not instantiate ordinary WebSocket",
				);
			} finally {
				options.free();
			}
			assert.equal(transport.supportsReceiveBackpressure, false);
			const stream = await transport.openBidirectional();
			streams.push(stream);
			const socket = latestSocket();
			socket.bufferedAmount = 131074;
			let sent = false;
			const writing = stream.send(new Uint8Array(65537)).then(() => {
				sent = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 15));
			assert.equal(sent, false);
			assert.equal(socket.sent.length, 0);
			socket.bufferedAmount = 0;
			await writing;
			await stream.finish();
			assert.deepEqual(
				socket.sent.map((bytes) => bytes.length),
				[65537, 2, 1],
			);
			const fin = socket.sent.at(-1);
			assert.ok(fin);
			assert.deepEqual([...fin], [1]);
			assert.equal(socket.readyState, 1, "FIN must not close the reverse direction");
			await assert.rejects(stream.send(new Uint8Array([1])));
			const receiving = stream.receive();
			await assert.rejects(stream.receive(), /already in progress/);
			socket.message(new Uint8Array([0, 42]).buffer);
			const received = await receiving;
			assert.ok(received);
			assert.deepEqual([...received], [42]);
			socket.message(new Uint8Array([1]).buffer);
			socket.close();
			assert.equal(await stream.receive(), undefined);
			for (const bytes of [new Uint8Array([2]), new Uint8Array([0]), new Uint8Array(65538)]) {
				const invalid = await transport.openBidirectional();
				streams.push(invalid);
				const receiver = latestSocket();
				receiver.message(bytes.buffer);
				await assert.rejects(invalid.receive());
				assert.equal(receiver.readyState, 3);
			}
			const closed = await transport.openBidirectional();
			streams.push(closed);
			latestSocket().close();
			await assert.rejects(closed.receive(), /without directional FIN/);
			for (const [count, bytes] of [
				[257, 2],
				[65, 65537],
			] as const) {
				const overflow = await transport.openBidirectional();
				streams.push(overflow);
				const receiver = latestSocket();
				for (let index = 0; index < count; index++)
					receiver.message(new Uint8Array(bytes).buffer);
				await assert.rejects(overflow.receive(), /receive queue exceeded/);
				assert.equal(receiver.readyState, 3);
			}
			const cancelled = await transport.openBidirectional();
			streams.push(cancelled);
			const waiting = cancelled.receive();
			cancelled.cancel();
			await assert.rejects(waiting, /cancelled/);
			const child = await transport.openBidirectional();
			streams.push(child);
			const childRead = child.receive();
			latestSocket().bufferedAmount = 131074;
			const childWrite = child.send(new Uint8Array([42]));
			transport.disconnect();
			await assert.rejects(childRead, /cancelled/);
			await assert.rejects(childWrite, /cancelled/);
			const racing = await websocketBindings.SeaWebSocketTransport.connectOrdinary(
				"ws://localhost/sea/websocket",
				100,
			);
			const pendingChild = racing.openBidirectional();
			racing.disconnect();
			await assert.rejects(pendingChild, /disconnected|cancelled/);
			racing.free();
			assert(sockets.every((socket) => socket.readyState === 3));
		} finally {
			transport?.disconnect();
			for (const stream of streams) stream.free();
			transport?.free();
			for (const [name, descriptor] of Object.entries(original)) {
				if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
				else Object.defineProperty(globalThis, name, descriptor);
			}
		}
		assert(
			sockets.every(
				(socket) =>
					socket.onmessage == null &&
					socket.onopen == null &&
					socket.onerror == null &&
					socket.onclose == null,
			),
		);
	});

	it("Node built-in WebSocket opens neutral sessions against Rust", async function () {
		this.timeout(20000);
		const websocketUrl = process.env.SEA_NODE_TRANSPORT_URL;
		if (!websocketUrl) this.skip();
		const encoder = new TextEncoder();
		const open = async (
			document: Uint8Array | undefined,
			_author: string,
		): Promise<SeaSession> => {
			return openRemote(
				{
					environment: "node",
					mode: "PreferAvailable",
					url: "https://localhost/sea",
					certificateHash: new Uint8Array(32),
					websocketUrl,
					timeoutMilliseconds: 1000,
				},
				document,
				{},
			);
		};
		const first = await open(undefined, "first");
		let second: SeaSession | undefined;
		try {
			second = await open(first.document, "second");
			const stream = await second.load();
			const position = await first.submit(undefined, encoder.encode("payload"));
			for (;;) {
				const item = await stream.next();
				assert(item);
				if (item.kind === "event") {
					assert.equal(item.position, position);
					assert.deepEqual(item.payload, encoder.encode("payload"));
					break;
				}
			}
			stream.cancel();
			const blob = await first.putBlob(encoder.encode("blob"));
			assert.deepEqual(await second.getBlob(blob), encoder.encode("blob"));
		} finally {
			await first.close();
			await second?.close();
		}
	});
});
