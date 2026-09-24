/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { openWebTransport } from "@fluidframework/sea-typescript/internal/webtransport";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const parameters = new URLSearchParams(location.search);
const transportUrl = parameters.get("transport");
const certificateHex = parameters.get("hash");
const snapshotParticipation =
	parameters.get("snapshotPolicy") === "sea" ? "seaSelected" : "clientSelected";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function equalBytes(actual, expected) {
	return (
		actual.length === expected.length &&
		actual.every((value, index) => value === expected[index])
	);
}

async function nextEvent(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before an event");
		if (item.kind === "event") return item;
	}
}

async function nextAwaiting(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before catching up");
		if (item.kind === "progress" && item.status === "AwaitingNewItems") {
			return item;
		}
	}
}

async function nextSnapshot(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before a recovery snapshot");
		if (item.kind === "snapshot") return item;
	}
}

/** Bounds one lifecycle observation without allowing server inactivity cleanup to satisfy it. */
async function lifecycleDeadline(promise, message) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), 3000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** Proves coordination cancellation releases server authority while both archive sessions stay open. */
async function verifySnapshotLeaseRelease(open) {
	const first = await open(undefined, "lease-first");
	let second;
	let firstCoordination;
	let secondCoordination;
	let replacement;
	try {
		second = await open(first.document, "lease-second");
		firstCoordination = await first.coordinateSnapshots("seaSelected");
		const firstState = await lifecycleDeadline(
			firstCoordination.next(),
			"lease probe first participant did not receive coordination",
		);
		assert(firstState.fence !== undefined, "lease probe first participant was not selected");
		secondCoordination = await second.coordinateSnapshots("seaSelected");
		assert(
			(
				await lifecycleDeadline(
					secondCoordination.next(),
					"lease probe second participant did not receive coordination",
				)
			).fence === undefined,
			"lease probe admitted two publishers",
		);
		replacement = (async () => {
			for (;;) {
				const state = await secondCoordination.next();
				assert(state !== undefined, "lease probe coordination ended before selection");
				if (state.fence !== undefined) return state;
			}
		})();
		firstCoordination.cancel();
		const selected = await lifecycleDeadline(
			replacement,
			"coordination cancellation did not release server nomination",
		);
		assert(selected.fence !== firstState.fence, "lease probe reused the old publisher fence");
		const payload = encoder.encode("archive survives coordination cancellation");
		const blob = await first.putBlob(payload);
		assert(
			equalBytes(await second.getBlob(blob), payload),
			"lease release required closing an archive connection",
		);
		return true;
	} finally {
		firstCoordination?.cancel();
		secondCoordination?.cancel();
		await replacement?.catch(() => {});
		await Promise.all([first.close(), second?.close()]);
	}
}

/** Observes Rust ownership independently of JavaScript garbage collection and remote cleanup. */
async function verifyMockLifecycle(bindings, hash) {
	const NativeWebTransport = globalThis.WebTransport;
	const retainedConnections = [];
	let scenario = "pending";
	const directions = () => {
		const state = { aborts: 0, cancellations: 0, closes: 0 };
		state.readable = new ReadableStream({
			start(controller) {
				state.controller = controller;
			},
			cancel() {
				state.cancellations++;
			},
		});
		state.writable = new WritableStream({
			abort() {
				state.aborts++;
			},
			close() {
				state.closes++;
			},
		});
		return state;
	};
	const unlocked = async (state) => {
		const deadline = performance.now() + 3000;
		while (state.readable.locked || state.writable.locked) {
			assert(
				performance.now() < deadline,
				"final stream owner did not release JavaScript locks",
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	};
	const rejects = async (promise, message) => {
		let rejected = false;
		try {
			const unexpected = await lifecycleDeadline(promise, message);
			unexpected?.free?.();
		} catch (error) {
			assert(error.message !== message, message);
			rejected = true;
		}
		assert(rejected, message);
	};
	const connect = async () => {
		const attempt = new bindings.LifecycleConnectAttempt(transportUrl, hash);
		try {
			return await attempt.result();
		} finally {
			attempt.free();
		}
	};
	globalThis.WebTransport = class {
		constructor() {
			this.closes = 0;
			this.streams = [];
			this.ready = scenario === "pending" ? new Promise(() => {}) : Promise.resolve();
			this.closed = new Promise(() => {});
			this.datagramState = directions();
			retainedConnections.push(this);
		}
		get datagrams() {
			if (scenario === "datagram-failure") throw new Error("injected datagram setup failure");
			return this.datagramState;
		}
		createBidirectionalStream() {
			const state = directions();
			this.streams.push(state);
			return Promise.resolve(
				Object.create(WebTransportBidirectionalStream.prototype, {
					readable: { value: state.readable },
					writable: { value: state.writable },
				}),
			);
		}
		close() {
			this.closes++;
		}
	};
	let owner;
	let stream;
	let clone;
	try {
		await rejects(
			bindings.awaitSelectedConnect(transportUrl, hash, 20),
			"pending establishment did not reject through its selection deadline",
		);
		assert(retainedConnections.length === 1, "timeout probe did not construct WebTransport");
		assert(retainedConnections[0].closes === 1, "abandoned establishment was not closed");
		assert(
			retainedConnections[0].streams.length === 0,
			"abandoned establishment opened a Sea stream",
		);

		scenario = "datagram-failure";
		await rejects(
			connect(),
			"datagram setup failure did not reject",
		);
		assert(retainedConnections.length === 2, "setup probe did not construct WebTransport");
		assert(retainedConnections[1].closes === 1, "failed datagram setup leaked its connection");
		assert(retainedConnections[1].streams.length === 0, "failed setup opened a Sea stream");

		scenario = "success";
		owner = await connect();
		const connection = retainedConnections[2];
		assert(connection.closes === 0, "successful construction prematurely closed its connection");
		stream = await owner.openStream();
		const state = connection.streams[0];
		clone = stream.cloneOwner();
		stream.free();
		stream = undefined;
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert(
			state.aborts === 0 && state.cancellations === 0,
			"nonfinal clone cancelled a direction",
		);
		assert(state.readable.locked && state.writable.locked, "nonfinal clone released shared locks");
		clone.free();
		clone = undefined;
		await unlocked(state);
		assert(
			state.aborts === 1 && state.cancellations === 1,
			"final clone did not cancel both directions",
		);
		assert(connection.closes === 0, "stream drop closed its parent connection");

		stream = await owner.openStream();
		const finished = connection.streams[1];
		await stream.finish();
		finished.controller.close();
		assert((await stream.receive()) === undefined, "closed readable did not produce EOF");
		stream.free();
		stream = undefined;
		await unlocked(finished);
		assert(finished.closes === 1, "finished stream did not close its writer");
		assert(
			finished.aborts === 0 && finished.cancellations === 0,
			"completed directions were cancelled again",
		);
		owner.free();
		owner = undefined;
		assert(connection.closes === 1, "final connection owner did not close");
		await unlocked(connection.datagramState);
		return [
			"pending-establishment",
			"datagram-setup-failure",
			"successful-establishment",
			"stream-clones",
			"finished-stream",
		];
	} finally {
		stream?.free();
		clone?.free();
		owner?.free();
		globalThis.WebTransport = NativeWebTransport;
	}
}

/** Checks each concrete close path against a live one-slot server. */
async function runLifecycle(hash) {
	const bindings = await import("/lifecycle/browser_lifecycle.js");
	const { default: initialize, LifecycleTransport } = bindings;
	await initialize();
	const ownership = await verifyMockLifecycle(bindings, hash);
	const NativeWebTransport = globalThis.WebTransport;
	const retainedConnections = [];
	globalThis.WebTransport = class extends NativeWebTransport {
		/** Retains native objects so JavaScript collection cannot close them for the test. */
		constructor(...arguments_) {
			super(...arguments_);
			retainedConnections.push(this);
			this.closed.catch(() => {});
		}
	};
	const cases = [];
	try {
		for (const mode of ["disconnect", "drop"]) {
			let owner = await lifecycleDeadline(
				LifecycleTransport.connect(transportUrl, hash),
				`${mode}: initial connection failed`,
			);
			assert(retainedConnections.length === cases.length + 1, "native owner was not retained");
			const replacement = new NativeWebTransport(transportUrl, {
				serverCertificateHashes: [{ algorithm: "sha-256", value: hash }],
			});
			replacement.closed.catch(() => {});
			const admitted = replacement.ready.then(() => "admitted");
			try {
				const beforeRelease = await Promise.race([
					admitted,
					new Promise((resolve) => setTimeout(() => resolve("blocked"), 150)),
				]);
				assert(
					beforeRelease === "blocked",
					`${mode}: server did not enforce one-slot capacity`,
				);
				if (mode === "disconnect") {
					owner.disconnect();
				} else {
					owner.free();
					owner = undefined;
				}
				await lifecycleDeadline(
					admitted,
					`${mode}: physical connection did not release server capacity`,
				);
				assert(
					(mode === "disconnect") === (owner !== undefined),
					`${mode}: unexpected Rust owner lifetime`,
				);
				cases.push(mode);
			} finally {
				replacement.close();
				owner?.free();
			}
		}
		return { status: "passed", browser: navigator.userAgent, ownership, physicalRelease: cases };
	} finally {
		globalThis.WebTransport = NativeWebTransport;
		for (const connection of retainedConnections) connection.close();
	}
}

async function run() {
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing SHA-256 certificate hash");
	const hash = Uint8Array.from(certificateHex.match(/../gu), (value) =>
		Number.parseInt(value, 16),
	);
	if (parameters.get("lifecycle") === "1") return runLifecycle(hash);
	let transportSessionCount = 0;
	const websocket = parameters.get("websocket") === "1";
	const ordinary = parameters.get("ordinaryWebsocket") === "1";
	const remote = websocket
		? await import("@fluidframework/sea-typescript/internal/websocket")
		: undefined;
	const remoteOptions = {
		mode: ordinary ? "WebSocket" : "WebSocketStream",
		websocketUrl: transportUrl,
		certificateHash: hash,
	};
	if (websocket && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
		const options = {};
		const originalStreaming = Object.getOwnPropertyDescriptor(globalThis, "WebSocketStream");
		const originalSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
		const unavailable = `https://127.0.0.1:${location.port}/sea`;
		const restore = (name, descriptor) =>
			descriptor
				? Object.defineProperty(globalThis, name, descriptor)
				: delete globalThis[name];
		const reject = async (service) => {
			let failure;
			try {
				const unexpected = await remote.openRemote(service, undefined, options);
				await unexpected.close();
			} catch (error) {
				failure = error;
			}
			assert(failure, "strict transport unexpectedly fell back");
		};
		try {
			const primaryUrl = parameters.get("primaryTransport");
			if (primaryUrl) {
				Object.defineProperty(globalThis, "WebSocketStream", {
					value: undefined,
					configurable: true,
				});
				Object.defineProperty(globalThis, "WebSocket", {
					value: undefined,
					configurable: true,
				});
				const primary = await remote.openRemote(
					{
						...remoteOptions,
						mode: "PreferAvailable",
						url: primaryUrl,
						timeoutMilliseconds: 2000,
					},
					undefined,
					options,
				);
				await primary.close();
				restore("WebSocketStream", originalStreaming);
				restore("WebSocket", originalSocket);
			}
			await reject({
				...remoteOptions,
				mode: "WebTransport",
				url: unavailable,
				timeoutMilliseconds: 100,
			});
			Object.defineProperty(globalThis, "WebSocketStream", {
				value: undefined,
				configurable: true,
			});
			await reject({ ...remoteOptions, mode: "WebSocketStream" });
			await reject({
				...remoteOptions,
				mode: "PreferWebTransport",
				url: unavailable,
				timeoutMilliseconds: 100,
			});
			if (!ordinary) restore("WebSocketStream", originalStreaming);
			const fallback = await remote.openRemote(
				{
					...remoteOptions,
					mode: ordinary ? "PreferAvailable" : "PreferWebTransport",
					url: unavailable,
					timeoutMilliseconds: 1000,
				},
				undefined,
				options,
			);
			await fallback.close();
		} finally {
			restore("WebSocketStream", originalStreaming);
			restore("WebSocket", originalSocket);
		}
	}
	const open = async (document, session, reference) => {
		const opened = await (websocket ? remote.openRemote : openWebTransport)(
			websocket ? remoteOptions : { url: transportUrl, certificateHash: hash },
			document,
			{
				...(reference === undefined ? {} : { reference }),
			},
		);
		transportSessionCount++;
		return opened;
	};
	let missingArchiveError;
	try {
		const unexpected = await open(new Uint8Array(8), "missing-session");
		await unexpected.close();
	} catch (error) {
		missingArchiveError = error;
	}
	assert(
		missingArchiveError?.kind === "Rejected",
		"service rejection omitted its structured error kind",
	);
	const snapshotLeaseReleased = await verifySnapshotLeaseRelease(open);
	let first = await open(undefined, "browser-session");
	const archive = first.document;
	const previousCoordination = await first.coordinateSnapshots(snapshotParticipation);
	await previousCoordination.next();
	previousCoordination.cancel();
	const snapshotCoordination = await first.coordinateSnapshots(snapshotParticipation);
	const publisher = await snapshotCoordination.next();
	previousCoordination.cancel();
	const load = await first.load();
	const initialCaughtUp = await nextAwaiting(load);
	const firstReceipt = await first.submit(undefined, encoder.encode("first-payload"));
	const firstStreamedReceipt = await first.submit(
		firstReceipt,
		encoder.encode("first-streamed-payload"),
	);
	const secondStreamedReceipt = await first.submit(
		firstStreamedReceipt,
		encoder.encode("second-streamed-payload"),
	);
	assert(
		firstReceipt < firstStreamedReceipt && firstStreamedReceipt < secondStreamedReceipt,
		"author-stream event positions did not increase",
	);
	const firstLoaded = await nextEvent(load);
	assert(firstLoaded.position === firstReceipt, "load omitted or reordered the first event");
	assert(
		(await nextEvent(load)).position === firstStreamedReceipt,
		"load omitted the first streamed event",
	);
	assert(
		(await nextEvent(load)).position === secondStreamedReceipt,
		"load omitted the second streamed event",
	);
	const second = await open(archive, "second-session", secondStreamedReceipt);
	const sender = await first.openSignals({
		id: encoder.encode("signal-first"),
		metadata: encoder.encode("first metadata"),
	});
	assert((await sender.next()).kind === "members", "initial signal snapshot missing");
	const receiver = await second.openSignals({
		id: encoder.encode("signal-second"),
		metadata: new Uint8Array(),
	});
	assert(
		(await receiver.next()).members.length === 2,
		"signal snapshot is not document scoped",
	);
	assert((await sender.next()).kind === "joined", "signal join missing");
	await sender.send(encoder.encode("broadcast"));
	assert((await sender.next()).kind === "message", "broadcast omitted self echo");
	assert(
		decoder.decode((await receiver.next()).payload) === "broadcast",
		"broadcast omitted peer",
	);
	for (const size of [32, 4096]) {
		const payload = new Uint8Array(size).fill(42);
		await sender.send(payload, {
			target: encoder.encode("signal-second"),
			delivery: "bestEffort",
		});
		const message = await receiver.next();
		assert(
			message.delivery === "bestEffort" && equalBytes(message.payload, payload),
			"best-effort or oversized fallback changed the message",
		);
	}
	if (websocket && parameters.get("primaryTransport")) {
		const peer = await openWebTransport(
			{ url: parameters.get("primaryTransport"), certificateHash: hash },
			archive,
			{},
		);
		transportSessionCount++;
		const mixed = await peer.openSignals({
			id: encoder.encode("signal-mixed"),
			metadata: new Uint8Array(),
		});
		assert((await mixed.next()).members.length === 3, "mixed transports did not share a room");
		assert((await sender.next()).kind === "joined", "mixed join missing at sender");
		assert((await receiver.next()).kind === "joined", "mixed join missing at receiver");
		await mixed.send(encoder.encode("QUIC to WebSocket"), {
			target: encoder.encode("signal-second"),
			delivery: "bestEffort",
		});
		assert(
			decoder.decode((await receiver.next()).payload) === "QUIC to WebSocket",
			"datagram ingress failed reliable recipient fallback",
		);
		await sender.send(encoder.encode("WebSocket to QUIC"), {
			target: encoder.encode("signal-mixed"),
			delivery: "bestEffort",
		});
		assert(
			decoder.decode((await mixed.next()).payload) === "WebSocket to QUIC",
			"reliable ingress failed datagram recipient delivery",
		);
		await mixed.close();
		assert((await sender.next()).kind === "left", "mixed leave missing at sender");
		assert((await receiver.next()).kind === "left", "mixed leave missing at receiver");
		await peer.close();
	}
	const pendingSignal = receiver.next();
	await receiver.close();
	assert((await pendingSignal) === undefined, "signal close did not wake pending read");
	assert((await sender.next()).kind === "left", "signal leave missing");
	await sender.close();
	const secondSnapshotCoordination = await second.coordinateSnapshots(snapshotParticipation);
	const secondSnapshotState = await secondSnapshotCoordination.next();
	if (snapshotParticipation === "seaSelected") {
		assert(publisher.fence !== undefined, "first publisher was not nominated");
		assert(secondSnapshotState.fence === undefined, "two Sea-selected clients were nominated");
	}
	const secondLoad = await second.load(secondStreamedReceipt);
	const secondCaughtUp = await nextAwaiting(secondLoad);
	const thirdStreamedReceipt = await first.submit(
		secondStreamedReceipt,
		encoder.encode("third-streamed-payload"),
	);
	const secondLive = await nextEvent(secondLoad);
	assert(
		secondLive.position === thirdStreamedReceipt,
		"second load omitted the live first-client event",
	);
	assert(
		decoder.decode(secondLive.payload) === "third-streamed-payload",
		"second load returned the wrong live payload",
	);
	const firstSelfLive = await nextEvent(load);
	assert(
		firstSelfLive.position === thirdStreamedReceipt,
		"first load omitted its own third event",
	);
	assert(
		decoder.decode(firstSelfLive.payload) === "third-streamed-payload",
		"first load returned the wrong self-event payload",
	);
	const fourthStreamedReceipt = await first.submit(
		thirdStreamedReceipt,
		encoder.encode("fourth-streamed-payload"),
	);
	const secondConsecutiveLive = await nextEvent(secondLoad);
	assert(
		secondConsecutiveLive.position === fourthStreamedReceipt,
		"second load omitted the consecutive first-client event",
	);
	assert(
		decoder.decode(secondConsecutiveLive.payload) === "fourth-streamed-payload",
		"second load returned the wrong consecutive live payload",
	);
	const firstConsecutiveSelfLive = await nextEvent(load);
	assert(
		firstConsecutiveSelfLive.position === fourthStreamedReceipt,
		"first load omitted its consecutive self-event",
	);
	const secondReceipt = await second.submit(
		fourthStreamedReceipt,
		encoder.encode("second-payload"),
	);
	assert(secondReceipt > firstReceipt, "event positions did not increase");
	const live = await nextEvent(load);
	assert(live.position === secondReceipt, "load omitted the live second-client event");
	assert(decoder.decode(live.payload) === "second-payload", "live event payload mismatch");
	await load.cancel();

	const blobPayload = encoder.encode("browser-content-addressed-payload");
	const blob = await first.putBlob(blobPayload);
	assert(equalBytes(await first.getBlob(blob), blobPayload), "blob round trip failed");
	const directory = await first.putDirectory([{ name: "leaf", child: blob }]);
	const entries = await first.getDirectory(directory);
	assert(entries.length === 1, "directory entry count mismatch");
	assert(entries[0].name === "leaf", "directory entry name mismatch");
	assert(equalBytes(entries[0].child.bytes, blob.bytes), "directory child mismatch");

	const notification = snapshotCoordination.next();
	const snapshot = await first.publishSnapshot(
		undefined,
		publisher.fence,
		secondReceipt,
		directory,
	);
	let observed = await notification;
	while (observed.latest !== snapshot.atEvent) {
		observed = await snapshotCoordination.next();
	}
	const latest = await first.getSnapshot();
	assert(latest !== undefined, "latest snapshot was missing");
	assert(latest.atEvent === snapshot.atEvent, "latest snapshot identity mismatch");
	const fetched = await first.getSnapshot(snapshot.atEvent);
	assert(fetched !== undefined, "snapshot lookup failed");
	assert(equalBytes(fetched.root.bytes, directory.bytes), "snapshot root mismatch");

	const cancelledNotification = snapshotCoordination.next().then(
		() => {
			throw new Error("cancelled snapshot notification unexpectedly succeeded");
		},
		() => undefined,
	);
	snapshotCoordination.cancel();
	await cancelledNotification;
	await first.close();
	first = await open(archive, "browser-session-resumed", secondReceipt);
	const resumedSnapshots = await first.coordinateSnapshots(snapshotParticipation);
	await resumedSnapshots.next();
	const resumedLoad = await first.load(secondReceipt);
	await nextAwaiting(resumedLoad);
	const resumedReceipt = await first.submit(secondReceipt, encoder.encode("resumed-payload"));
	const resumedLive = await nextEvent(resumedLoad);
	assert(
		resumedLive.position === resumedReceipt,
		"replacement-session load omitted its live event",
	);
	assert(
		decoder.decode(resumedLive.payload) === "resumed-payload",
		"replacement-session load returned the wrong payload",
	);
	await resumedLoad.cancel();

	resumedSnapshots.cancel();
	await first.close();
	let disconnected = false;
	try {
		await first.getSnapshot();
	} catch (error) {
		disconnected = error.kind === "Closed";
	}
	assert(disconnected, "request unexpectedly retried after disconnect");
	first = await open(archive, "browser-session-reconnected", secondReceipt);
	const recoveredSnapshots = await first.coordinateSnapshots(snapshotParticipation);
	await recoveredSnapshots.next();
	const recovered = await first.load(secondReceipt);
	assert(
		(await nextSnapshot(recovered)).atEvent === secondReceipt,
		"recovered snapshot mismatch",
	);
	const recoveredEvent = await nextEvent(recovered);
	assert(recoveredEvent.position === resumedReceipt, "snapshot suffix lost the resumed event");
	assert(
		decoder.decode(recoveredEvent.payload) === "resumed-payload",
		"snapshot suffix payload mismatch",
	);
	await nextAwaiting(recovered);
	assert((await first.getSnapshot()) !== undefined, "reconnected snapshot lookup failed");
	recovered.cancel();
	recoveredSnapshots.cancel();
	secondLoad.cancel();
	secondSnapshotCoordination.cancel();

	window.__shutdownProbe = {
		async existingRequest() {
			try {
				await first.getSnapshot();
				return "succeeded";
			} catch {
				return "rejected";
			}
		},
		async thirdSession() {
			try {
				const client = await open(archive, "third-session");
				await client.close();
				return "unexpected-success";
			} catch {
				return "rejected";
			}
		},
	};

	return {
		status: "passed",
		browser: navigator.userAgent,
		transportSessionCount,
		snapshotLeaseReleased,
		firstPosition: firstReceipt.toString(),
		firstStreamedPosition: firstStreamedReceipt.toString(),
		secondStreamedPosition: secondStreamedReceipt.toString(),
		thirdStreamedPosition: thirdStreamedReceipt.toString(),
		fourthStreamedPosition: fourthStreamedReceipt.toString(),
		secondPosition: secondReceipt.toString(),
		caughtUp: initialCaughtUp.latestKnown?.toString() ?? "none",
		secondCaughtUp: secondCaughtUp.latestKnown?.toString() ?? "none",
		blobBytes: blobPayload.length,
		transport:
			parameters.get("ordinaryWebsocket") === "1"
				? "WebSocket"
				: parameters.get("websocket") === "1"
					? "WebSocketStream"
					: "WebTransport",
		directoryEntries: entries.length,
		serviceErrorKind: missingArchiveError.kind,
		snapshotParticipation,
		snapshotPosition: snapshot.atEvent.toString(),
		documentIdBytes: archive.length,
	};
}

window.__webtransportResult = run()
	.then((result) => {
		document.querySelector("#result").textContent = JSON.stringify(result);
		return result;
	})
	.catch((error) => {
		const result = { status: "failed", error: String(error?.stack ?? error) };
		document.querySelector("#result").textContent = JSON.stringify(result);
		return result;
	});
