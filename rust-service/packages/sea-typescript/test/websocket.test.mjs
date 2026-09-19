/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const websocketBindings = require("../generated/websocket/node/sea_wasm.js");

test("ordinary WebSocket compatibility bounds queues and preserves stream lifecycle", {
	timeout: 10000,
}, async () => {
	const original = {
		WebSocket: globalThis.WebSocket,
		WebSocketStream: globalThis.WebSocketStream,
		WebTransport: globalThis.WebTransport,
	};
	const sockets = [];
	class TestSocket extends EventTarget {
		static nextBehavior;
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSING = 2;
		static CLOSED = 3;
		readyState = 0;
		bufferedAmount = 0;
		protocol = "sea-stream-v1";
		sent = [];
		constructor(url) {
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
		message(data) {
			this.onmessage?.(new MessageEvent("message", { data }));
		}
		send(bytes) {
			this.sent.push(new Uint8Array(bytes).slice());
		}
		close() {
			this.readyState = 3;
			this.onclose?.(new Event("close"));
		}
	}
	let transport;
	const streams = [];
	try {
		globalThis.WebSocket = TestSocket;
		globalThis.WebSocketStream = undefined;
		globalThis.WebTransport = undefined;
		for (const behavior of ["pending", "no-token", "error", "protocol"]) {
			TestSocket.nextBehavior = behavior;
			await assert.rejects(
				websocketBindings.SeaWebSocketTransport.connectOrdinary(
					"ws://localhost/sea/websocket",
					20,
				),
			);
			assert.equal(sockets.at(-1).readyState, 3);
			assert(sockets.at(-1).onmessage == null);
		}
		transport = await websocketBindings.SeaWebSocketTransport.connectOrdinary(
			"ws://localhost/sea/websocket",
			100,
		);
		const attempts = sockets.length;
		const options = new websocketBindings.SeaSessionOptions(
			new Uint8Array([1]),
			new Uint8Array([2]),
			undefined,
			false,
		);
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
		const socket = sockets.at(-1);
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
		assert.deepEqual([...socket.sent.at(-1)], [1]);
		assert.equal(socket.readyState, 1, "FIN must not close the reverse direction");
		await assert.rejects(stream.send(new Uint8Array([1])));
		const receiving = stream.receive();
		await assert.rejects(stream.receive(), /already in progress/);
		socket.message(new Uint8Array([0, 42]).buffer);
		assert.deepEqual([...(await receiving)], [42]);
		socket.message(new Uint8Array([1]).buffer);
		socket.close();
		assert.equal(await stream.receive(), undefined);
		for (const bytes of [new Uint8Array([2]), new Uint8Array([0]), new Uint8Array(65538)]) {
			const invalid = await transport.openBidirectional();
			streams.push(invalid);
			const receiver = sockets.at(-1);
			receiver.message(bytes.buffer);
			await assert.rejects(invalid.receive());
			assert.equal(receiver.readyState, 3);
		}
		const closed = await transport.openBidirectional();
		streams.push(closed);
		sockets.at(-1).close();
		await assert.rejects(closed.receive(), /without directional FIN/);
		for (const [count, bytes] of [
			[257, 2],
			[65, 65537],
		]) {
			const overflow = await transport.openBidirectional();
			streams.push(overflow);
			const receiver = sockets.at(-1);
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
		sockets.at(-1).bufferedAmount = 131074;
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
		Object.assign(globalThis, original);
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

test("Node built-in WebSocket opens neutral sessions against Rust", {
	skip: !process.env.SEA_NODE_TRANSPORT_URL,
	timeout: 20000,
}, async () => {
	const { openRemote } = await import("@fluidframework/sea-typescript/internal/websocket");
	const encoder = new TextEncoder();
	const open = async (document, author) => {
		return openRemote(
			{
				environment: "node",
				mode: "PreferAvailable",
				url: "https://localhost/sea",
				certificateHash: new Uint8Array(32),
				websocketUrl: process.env.SEA_NODE_TRANSPORT_URL,
				timeoutMilliseconds: 1000,
			},
			document,
			{ author: encoder.encode(author), session: encoder.encode(author) },
		);
	};
	const first = await open(undefined, "first");
	let second;
	try {
		second = await open(first.document, "second");
		const stream = await second.load();
		const position = await first.submit(
			encoder.encode("operation"),
			undefined,
			encoder.encode("payload"),
		);
		assert.equal(await first.resolveSubmission(encoder.encode("operation")), position);
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
