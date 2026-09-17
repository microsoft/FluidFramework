/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import init, {
	SeaBrowserTransport,
	SeaDirectoryEntry,
	SeaErrorKind,
	SeaInjectedClient,
	SeaLoadKind,
	SeaSnapshotParticipation,
	SeaStreamStatus,
} from "../../crates/sea-webtransport/pkg/web/sea_webtransport.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const parameters = new URLSearchParams(location.search);
const transportUrl = parameters.get("transport");
const certificateHex = parameters.get("hash");
const snapshotParticipation =
	parameters.get("snapshotPolicy") === "sea"
		? SeaSnapshotParticipation.SeaSelected
		: SeaSnapshotParticipation.ClientSelected;

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
		if (item.kind === SeaLoadKind.Event) return item;
	}
}

async function nextAwaiting(stream) {
	for (;;) {
		const item = await stream.next();
		assert(item !== undefined, "event stream ended before catching up");
		if (item.kind === SeaLoadKind.Progress && item.status === SeaStreamStatus.AwaitingNewItems) {
			return item;
		}
	}
}

async function connect(hash) {
	return SeaBrowserTransport.connect(transportUrl, hash, 1024 * 1024);
}

async function run() {
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing SHA-256 certificate hash");
	await init();
	const hash = Uint8Array.from(certificateHex.match(/../gu), (value) =>
		Number.parseInt(value, 16),
	);
	const firstTransport = await connect(hash);
	const secondTransport = await connect(hash);
	const first = new SeaInjectedClient(firstTransport, 1024 * 1024);
	const second = new SeaInjectedClient(secondTransport, 1024 * 1024);
	const archive = encoder.encode("browser-archive");
	let missingArchiveError;
	try {
		await second.openSession(
			encoder.encode("missing-browser-archive"),
			false,
			encoder.encode("missing-author"),
			encoder.encode("missing-session"),
		);
	} catch (error) {
		missingArchiveError = error;
	}
	assert(
		missingArchiveError?.kind === SeaErrorKind.Rejected,
		"service rejection omitted its structured error kind",
	);
	await first.openSession(
		archive,
		true,
		encoder.encode("browser-author"),
		encoder.encode("browser-session"),
	);
	const snapshotCoordination = await first.subscribeSnapshots(snapshotParticipation);
	await snapshotCoordination.next();
	const load = await first.load();
	const initialCaughtUp = await nextAwaiting(load);
	const firstReceipt = await first.submit(
		encoder.encode("browser-operation-1"),
		undefined,
		encoder.encode("first-payload"),
	);
	const firstStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-1"),
		firstReceipt.position,
		encoder.encode("first-streamed-payload"),
	);
	const secondStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-2"),
		firstStreamedReceipt.position,
		encoder.encode("second-streamed-payload"),
	);
	assert(
		firstReceipt.position < firstStreamedReceipt.position &&
			firstStreamedReceipt.position < secondStreamedReceipt.position,
		"author-stream event positions did not increase",
	);
	const resolved = await first.resolveSubmission(encoder.encode("browser-operation-1"));
	assert(resolved?.position === firstReceipt.position, "submission resolution mismatch");
	const firstLoaded = await nextEvent(load);
	assert(firstLoaded.kind === SeaLoadKind.Event, "load omitted the first event");
	assert(
		(await nextEvent(load)).kind === SeaLoadKind.Event,
		"load omitted the first streamed event",
	);
	assert(
		(await nextEvent(load)).kind === SeaLoadKind.Event,
		"load omitted the second streamed event",
	);
	await second.openSession(
		archive,
		false,
		encoder.encode("second-author"),
		encoder.encode("second-session"),
		secondStreamedReceipt.position,
	);
	const secondSnapshotCoordination = await second.subscribeSnapshots(snapshotParticipation);
	const secondSnapshotState = await secondSnapshotCoordination.next();
	if (snapshotParticipation === SeaSnapshotParticipation.SeaSelected) {
		assert(secondSnapshotState.fence === undefined, "two Sea-selected clients were nominated");
	}
	const secondLoad = await second.load(secondStreamedReceipt.position);
	const secondCaughtUp = await nextAwaiting(secondLoad);
	const thirdStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-3"),
		secondStreamedReceipt.position,
		encoder.encode("third-streamed-payload"),
	);
	const secondLive = await nextEvent(secondLoad);
	assert(
		secondLive.kind === SeaLoadKind.Event,
		"second load omitted the live first-client event",
	);
	assert(
		decoder.decode(secondLive.payload) === "third-streamed-payload",
		"second load returned the wrong live payload",
	);
	const firstSelfLive = await nextEvent(load);
	assert(firstSelfLive.kind === SeaLoadKind.Event, "first load omitted its own third event");
	assert(
		decoder.decode(firstSelfLive.payload) === "third-streamed-payload",
		"first load returned the wrong self-event payload",
	);
	const fourthStreamedReceipt = await first.submit(
		encoder.encode("browser-operation-stream-4"),
		thirdStreamedReceipt.position,
		encoder.encode("fourth-streamed-payload"),
	);
	const secondConsecutiveLive = await nextEvent(secondLoad);
	assert(
		secondConsecutiveLive.kind === SeaLoadKind.Event,
		"second load omitted the consecutive first-client event",
	);
	assert(
		decoder.decode(secondConsecutiveLive.payload) === "fourth-streamed-payload",
		"second load returned the wrong consecutive live payload",
	);
	const firstConsecutiveSelfLive = await nextEvent(load);
	assert(
		firstConsecutiveSelfLive.kind === SeaLoadKind.Event,
		"first load omitted its consecutive self-event",
	);
	const secondReceipt = await second.submit(
		encoder.encode("browser-operation-2"),
		fourthStreamedReceipt.position,
		encoder.encode("second-payload"),
	);
	assert(secondReceipt.position > firstReceipt.position, "event positions did not increase");
	const live = await nextEvent(load);
	assert(live.kind === SeaLoadKind.Event, "load omitted the live second-client event");
	assert(decoder.decode(live.payload) === "second-payload", "live event payload mismatch");
	await load.cancel();

	const blobPayload = encoder.encode("browser-content-addressed-payload");
	const blob = await first.putBlob(blobPayload);
	assert(equalBytes(await first.getBlob(blob), blobPayload), "blob round trip failed");
	const directory = await first.putDirectory([new SeaDirectoryEntry("leaf", blob)]);
	const entries = await first.getDirectory(directory);
	assert(entries.length === 1, "directory entry count mismatch");
	assert(entries[0].name === "leaf", "directory entry name mismatch");
	assert(equalBytes(entries[0].child.bytes, blob.bytes), "directory child mismatch");

	const snapshot = await first.publishSnapshot(
		encoder.encode("browser-snapshot-operation"),
		undefined,
		secondReceipt.position,
		directory,
	);
	const latest = await first.latestSnapshot();
	assert(latest !== undefined, "latest snapshot was missing");
	assert(equalBytes(latest.id, snapshot.id), "latest snapshot identity mismatch");
	const fetched = await first.getSnapshot(snapshot.id);
	assert(fetched !== undefined, "snapshot lookup failed");
	assert(equalBytes(fetched.root.bytes, directory.bytes), "snapshot root mismatch");

	first.disconnect();
	let disconnected = false;
	try {
		await first.latestSnapshot();
	} catch {
		disconnected = true;
	}
	assert(disconnected, "request unexpectedly retried after disconnect");
	const replacement = await connect(hash);
	first.replaceTransport(replacement);
	await first.openSession(
		archive,
		false,
		encoder.encode("browser-author"),
		encoder.encode("browser-session-reconnected"),
		secondReceipt.position,
	);
	const recoveredSnapshots = await first.subscribeSnapshots(snapshotParticipation);
	await recoveredSnapshots.next();
	const recovered = await first.load(secondReceipt.position);
	assert(
		(await recovered.next()).kind === SeaLoadKind.Snapshot,
		"reconnected event stream omitted the recovery snapshot",
	);
	assert((await first.latestSnapshot()) !== undefined, "reconnected snapshot lookup failed");

	window.__shutdownProbe = {
		async existingRequest() {
			try {
				await first.latestSnapshot();
				return "succeeded";
			} catch {
				return "rejected";
			}
		},
		async thirdSession() {
			try {
				const transport = await connect(hash);
				const client = new SeaInjectedClient(transport, 1024 * 1024);
				await client.openSession(
					archive,
					false,
					encoder.encode("third-author"),
					encoder.encode("third-session"),
				);
				return "unexpected-success";
			} catch {
				return "rejected";
			}
		},
	};

	return {
		status: "passed",
		browser: navigator.userAgent,
		transportSessionCount: 3,
		firstPosition: firstReceipt.position.toString(),
		firstStreamedPosition: firstStreamedReceipt.position.toString(),
		secondStreamedPosition: secondStreamedReceipt.position.toString(),
		thirdStreamedPosition: thirdStreamedReceipt.position.toString(),
		fourthStreamedPosition: fourthStreamedReceipt.position.toString(),
		secondPosition: secondReceipt.position.toString(),
		caughtUp: initialCaughtUp.latestKnown?.toString() ?? "none",
		blobBytes: blobPayload.length,
		directoryEntries: entries.length,
		serviceErrorKind: missingArchiveError.kind,
		snapshotParticipation,
		snapshotIdBytes: snapshot.id.length,
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
