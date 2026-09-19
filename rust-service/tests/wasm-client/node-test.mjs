/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
	SeaDirectoryEntry,
	SeaInjectedClient,
	SeaLoadKind,
	SeaLocalService,
	SeaSnapshotParticipation,
	SeaStreamStatus,
	SeaTreeKind,
} = require("../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const websocketBindings = require("../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js");

test("ordinary WebSocket compatibility bounds queues and preserves stream lifecycle", {
	skip: !websocketBindings.SeaWebSocketTransport,
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
		const { connectSeaBrowserTransport, SeaBrowserTransportMode: modes } = websocketBindings;
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
		const attempts = sockets.length;
		await assert.rejects(
			connectSeaBrowserTransport(
				modes.PreferWebTransport,
				"https://localhost/sea",
				new Uint8Array(32),
				"ws://localhost/sea/websocket",
				1024 * 1024,
				100,
			),
		);
		assert.equal(
			sockets.length,
			attempts,
			"strict mode must not instantiate ordinary WebSocket",
		);
		transport = await connectSeaBrowserTransport(
			modes.PreferAvailable,
			"https://localhost/sea",
			new Uint8Array(32),
			"ws://localhost/sea/websocket",
			1024 * 1024,
			100,
		);
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

test("Node built-in WebSocket collaborates through the native Rust listener", {
	skip: !process.env.SEA_NODE_TRANSPORT_URL,
	timeout: 20000,
}, async () => {
	const { SeaWebSocketTransport } = websocketBindings;
	const firstTransport = await SeaWebSocketTransport.connectOrdinary(
		process.env.SEA_NODE_TRANSPORT_URL,
		5000,
	);
	const secondTransport = await SeaWebSocketTransport.connectOrdinary(
		process.env.SEA_NODE_TRANSPORT_URL,
		5000,
	);
	const first = new SeaInjectedClient(firstTransport, 1024 * 1024);
	const second = new SeaInjectedClient(secondTransport, 1024 * 1024);
	try {
		assert.equal(firstTransport.supportsReceiveBackpressure, false);
		const archive = await first.createDocument(
			encoder.encode("node-first"),
			encoder.encode("node-session-first"),
		);
		const firstLoad = await first.load();
		await nextAwaiting(firstLoad);
		await second.openSession(
			archive,
			false,
			encoder.encode("node-second"),
			encoder.encode("node-session-second"),
		);
		const secondLoad = await second.load();
		await nextAwaiting(secondLoad);
		const position = await first.submit(
			encoder.encode("node-operation"),
			undefined,
			encoder.encode("network payload"),
		);
		assert.equal(await first.resolveSubmission(encoder.encode("node-operation")), position);
		assert.equal((await nextEvent(secondLoad)).position, position);
		assert.equal((await nextEvent(firstLoad)).position, position);
	} finally {
		await first.disconnect();
		await second.disconnect();
	}
});

async function nextEvent(stream) {
	for (;;) {
		const item = await stream.next();
		assert.notEqual(item, undefined);
		if (item.kind === SeaLoadKind.Event) return item;
	}
}

async function nextAwaiting(stream) {
	for (;;) {
		const item = await stream.next();
		assert.notEqual(item, undefined);
		if (
			item.kind === SeaLoadKind.Progress &&
			item.status === SeaStreamStatus.AwaitingNewItems
		) {
			return item;
		}
	}
}

async function clients() {
	const service = await SeaLocalService.create();
	const first = service.connect();
	const second = service.connect();
	const archive = await first.createDocument(
		encoder.encode("first-author"),
		encoder.encode("first-session"),
	);
	const snapshots = await first.subscribeSnapshots(SeaSnapshotParticipation.ClientSelected);
	await snapshots.next();
	return { archive, first, second, snapshots };
}

test("generated local clients submit, resolve, read, and tail events", async () => {
	const { archive, first, second } = await clients();
	const firstReceipt = await first.submit(
		encoder.encode("operation-one"),
		undefined,
		encoder.encode("first"),
	);
	assert.equal(typeof firstReceipt, "bigint");
	assert.equal(await first.resolveSubmission(encoder.encode("operation-one")), firstReceipt);
	const load = await first.load();
	assert.equal(decoder.decode((await nextEvent(load)).payload), "first");
	await nextAwaiting(load);
	await second.openSession(
		archive,
		false,
		encoder.encode("second-author"),
		encoder.encode("second-session"),
		firstReceipt,
	);
	await second.submit(encoder.encode("operation-two"), firstReceipt, encoder.encode("second"));
	assert.equal(decoder.decode((await nextEvent(load)).payload), "second");
	await load.cancel();
});

test("generated local clients preserve recursive content and snapshot identities", async () => {
	const { first } = await clients();
	const blob = await first.putBlob(encoder.encode("content"));
	assert.equal(blob.kind, SeaTreeKind.Blob);
	assert.equal(decoder.decode(await first.getBlob(blob)), "content");
	const child = await first.putDirectory([new SeaDirectoryEntry("leaf", blob)]);
	const root = await first.putDirectory([new SeaDirectoryEntry("child", child)]);
	assert.equal(root.kind, SeaTreeKind.Directory);
	const entries = await first.getDirectory(root);
	assert.equal(entries.length, 1);
	assert.equal(entries[0].name, "child");
	const position = await first.submit(
		encoder.encode("initialize"),
		undefined,
		encoder.encode("initial state"),
		root,
	);
	const snapshot = await first.publishSnapshot(undefined, position, root);
	assert.equal((await first.latestSnapshot()).atEvent, snapshot.atEvent);
	assert.deepEqual((await first.getSnapshot(snapshot.atEvent)).root.bytes, root.bytes);
	assert.equal((await first.publishSnapshot(undefined, position, root)).atEvent, position);
	const other = await first.putBlob(encoder.encode("other state"));
	await assert.rejects(first.publishSnapshot(undefined, position, other), /different root/);
});

test("generated snapshot participation enforces publication authority", async () => {
	const service = await SeaLocalService.create();
	const readOnly = service.connect();
	const archive = await readOnly.createDocument(
		encoder.encode("read-only-author"),
		encoder.encode("read-only-session"),
	);
	const readOnlySnapshots = await readOnly.subscribeSnapshots(
		SeaSnapshotParticipation.ReadOnly,
	);
	await readOnlySnapshots.next();
	const blob = await readOnly.putBlob(encoder.encode("snapshot-policy-content"));
	const position = await readOnly.submit(
		encoder.encode("initialize"),
		undefined,
		encoder.encode("initial"),
		blob,
	);
	await assert.rejects(readOnly.publishSnapshot(undefined, position, blob), /read-only/);

	await readOnlySnapshots.cancel();
	await readOnly.close();
	const selected = service.connect();
	await selected.openSession(
		archive,
		false,
		encoder.encode("selected-author"),
		encoder.encode("selected-session"),
	);
	const selectedSnapshots = await selected.subscribeSnapshots(
		SeaSnapshotParticipation.SeaSelected,
	);
	const coordination = await selectedSnapshots.next();
	assert.notEqual(coordination.fence, undefined);
	const snapshot = await selected.publishSnapshot(undefined, position, blob);
	assert.equal(snapshot.root.kind, SeaTreeKind.Blob);
	await selected.close();
});

test("generated local clients reject stable identity conflicts and stale sessions", async () => {
	const { archive, first } = await clients();
	await first.submit(encoder.encode("same"), undefined, encoder.encode("first"));
	await assert.rejects(
		first.submit(encoder.encode("same"), undefined, encoder.encode("different")),
		/operation identity/,
	);
	await first.openSession(
		archive,
		false,
		encoder.encode("first-author"),
		encoder.encode("replacement-session"),
	);
	await assert.rejects(
		first.openSession(
			archive,
			false,
			encoder.encode("first-author"),
			encoder.encode("first-session"),
		),
		/reused session/,
	);
});

test("generated local clients expose disconnect and explicit reopen", async () => {
	const { archive, first } = await clients();
	first.disconnect();
	await assert.rejects(first.latestSnapshot(), /disconnected/);
	await first.openSession(
		archive,
		false,
		encoder.encode("first-author"),
		encoder.encode("reconnected-session"),
	);
	assert.equal(await first.latestSnapshot(), undefined);
});

test("generated injected clients allow an omitted disconnect hook", () => {
	const openBidirectional = () => {
		throw new Error("disconnect must not open a stream");
	};
	const withoutDisconnect = new SeaInjectedClient({ openBidirectional }, 1024 * 1024);
	assert.doesNotThrow(() => withoutDisconnect.disconnect());

	const withFailingDisconnect = new SeaInjectedClient(
		{
			openBidirectional,
			disconnect: () => {
				throw new Error("injected disconnect failed");
			},
		},
		1024 * 1024,
	);
	assert.throws(() => withFailingDisconnect.disconnect(), /injected disconnect failed/);
});

test("generated local clients require explicit archive creation", async () => {
	const service = await SeaLocalService.create();
	const archive = encoder.encode("explicit-archive");
	await assert.rejects(
		service
			.connect()
			.openSession(
				archive,
				false,
				encoder.encode("missing-author"),
				encoder.encode("missing-session"),
			),
		/document does not exist/,
	);
	const allocated = await service
		.connect()
		.createDocument(encoder.encode("creator"), encoder.encode("creator-session"));
	const another = await service
		.connect()
		.createDocument(encoder.encode("another"), encoder.encode("another-session"));
	assert.notDeepEqual(allocated, another);
	await assert.rejects(
		service
			.connect()
			.openSession(allocated, true, encoder.encode("named"), encoder.encode("named-session")),
		/does not accept/,
	);
	await service
		.connect()
		.openSession(
			allocated,
			false,
			encoder.encode("open-author"),
			encoder.encode("open-session"),
		);
});

test("generated local stream cancellation wakes a pending read", async () => {
	const { first } = await clients();
	const load = await first.load();
	await nextAwaiting(load);
	const pending = load.next();
	await load.cancel();
	assert.equal(await pending, undefined);
});

test("snapshot replacement and cancellation release only their own registration", async () => {
	const { first, snapshots } = await clients();
	const pending = assert.rejects(snapshots.next(), /cancelled/);
	const replacement = await first.subscribeSnapshots(SeaSnapshotParticipation.ClientSelected);
	await pending;
	await replacement.next();
	await snapshots.cancel();
	const root = await first.putBlob(encoder.encode("state"));
	const position = await first.submit(
		encoder.encode("initial"),
		undefined,
		encoder.encode("state"),
		root,
	);
	const notification = replacement.next();
	await first.publishSnapshot(undefined, position, root);
	assert.equal((await notification).latest, position);
	const cancelled = assert.rejects(replacement.next(), /cancelled/);
	await replacement.cancel();
	await cancelled;
	await assert.rejects(first.publishSnapshot(undefined, position, root), /not open/);
});
