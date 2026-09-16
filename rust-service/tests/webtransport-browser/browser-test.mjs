/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import init, {
	SeaBrowserTransport,
	SeaDirectoryEntry,
	SeaInjectedClient,
} from "./pkg/sea_webtransport.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const parameters = new URLSearchParams(location.search);
const transportUrl = parameters.get("transport");
const certificateHex = parameters.get("hash");

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function equalBytes(actual, expected) {
	return (
		actual.length === expected.length &&
		actual.every((value, index) => value === expected[index])
	);
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
	await first.openSession(
		archive,
		encoder.encode("browser-author"),
		encoder.encode("browser-session"),
	);
	const firstReceipt = await first.submit(
		encoder.encode("browser-operation-1"),
		undefined,
		encoder.encode("first-payload"),
	);
	const resolved = await first.resolveSubmission(encoder.encode("browser-operation-1"));
	assert(resolved?.position === firstReceipt.position, "submission resolution mismatch");
	const load = await first.load();
	const firstLoaded = await load.next();
	assert(firstLoaded.kind === "event", "load omitted the first event");
	const initialCaughtUp = await load.next();
	assert(initialCaughtUp.kind === "caughtUp", "load omitted its initial caught-up marker");

	await second.openSession(
		archive,
		encoder.encode("second-author"),
		encoder.encode("second-session"),
		firstReceipt.position,
	);
	const secondReceipt = await second.submit(
		encoder.encode("browser-operation-2"),
		firstReceipt.position,
		encoder.encode("second-payload"),
	);
	assert(secondReceipt.position > firstReceipt.position, "event positions did not increase");
	const live = await load.next();
	assert(live.kind === "event", "load omitted the live second-client event");
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
		encoder.encode("browser-author"),
		encoder.encode("browser-session-reconnected"),
		secondReceipt.position,
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
		secondPosition: secondReceipt.position.toString(),
		caughtUp: initialCaughtUp.position.toString(),
		blobBytes: blobPayload.length,
		directoryEntries: entries.length,
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
