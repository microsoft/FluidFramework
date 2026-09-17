/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import init, {
	BrowserClient,
} from "../../../crates/sea-webtransport/pkg/web/sea_webtransport.js";
import {
	MinimalWasmDeltaConnection,
	MinimalWasmDocumentServiceFactory,
} from "../lib/index.js";

const decoder = new TextDecoder();
const parameters = new URLSearchParams(location.search);
let stage = "initializing";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function run() {
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing certificate hash");
	const started = performance.now();
	await init();
	const hash = Uint8Array.from(certificateHex.match(/../g), (value) =>
		Number.parseInt(value, 16),
	);
	let sharedClient;
	const factory = new MinimalWasmDocumentServiceFactory(async () => {
		if (!sharedClient) {
			stage = "connecting-shared-client";
			sharedClient = await BrowserClient.connect(transportUrl, hash, 1024 * 1024);
		}
		return sharedClient;
	});
	const resolvedUrl = {
		type: "fluid",
		id: `browser-driver-${Date.now()}`,
		url: "fluid://minimal/browser-driver",
		tokens: {},
		endpoints: {},
	};
	stage = "creating-container";
	await factory.createContainer(
		{ type: 1, tree: { counter: { type: 2, content: "0" } } },
		resolvedUrl,
	);
	stage = "loading-container";
	const loaded = await factory.createDocumentService(resolvedUrl);
	const storage = await loaded.connectToStorage();
	const snapshot = await storage.getSnapshotTree();
	assert(snapshot, "summary reload returned no snapshot");
	assert(
		decoder.decode(await storage.readBlob(snapshot.blobs.counter)) === "0",
		"summary blob reload mismatch",
	);
	const first = await loaded.connectToDeltaStream({});
	const secondService = await factory.createDocumentService(resolvedUrl);
	const second = await secondService.connectToDeltaStream({});
	assert(first instanceof MinimalWasmDeltaConnection, "first delta connection type mismatch");
	assert(
		second instanceof MinimalWasmDeltaConnection,
		"second delta connection type mismatch",
	);
	const message = (clientSequenceNumber, delta) => ({
		clientSequenceNumber,
		referenceSequenceNumber: 0,
		type: "op",
		contents: { delta },
	});
	first.submit([message(1, 1)]);
	await first.waitForIdle();
	second.submit([message(1, 2)]);
	await second.waitForIdle();
	const firstPage = await first.synchronize();
	const secondPage = await second.synchronize();
	assert(firstPage.length === 2 && secondPage.length === 2, "two-client projection mismatch");

	first.disconnect();
	first.submit([message(2, 4)]);
	let rejectedBeforeCommit = false;
	try {
		await first.waitForIdle();
	} catch {
		rejectedBeforeCommit = true;
	}
	assert(rejectedBeforeCommit, "disconnected submission was not left pending");
	await first.reconnect();
	assert(
		(await first.recoverPending()).get(2)?.kind === "notCommitted",
		"pre-commit recovery mismatch",
	);
	await first.resubmitPending(2);
	first.disconnect();
	await first.reconnect();
	const afterReconnect = await first.synchronize();
	assert(afterReconnect.length === 1, "post-commit reconnect duplicated or lost an operation");
	assert(
		(await first.synchronize()).length === 0,
		"second projected page duplicated operations",
	);

	const history = await loaded.connectToDeltaStorage();
	const historical = await history.fetchMessages(2, 4).read();
	assert(!historical.done, "bounded historical read returned no page");
	assert(
		historical.value.map(({ sequenceNumber }) => sequenceNumber).join(",") === "2,3",
		"bounded historical range mismatch",
	);
	return {
		status: "passed",
		browser: navigator.userAgent,
		startupMilliseconds: performance.now() - started,
		logicalClientCount: 2,
		transportSessionCount: 1,
		wireBytes: sharedClient.wireBytes.toString(),
		peakResponseBytes: sharedClient.peakResponseBytes,
		peakSubscriptionFrameBytes: sharedClient.peakSubscriptionFrameBytes,
		peakSubscriptionQueueDepth: sharedClient.peakSubscriptionQueueDepth,
		firstPage: firstPage.length,
		secondPage: secondPage.length,
		afterReconnect: afterReconnect.length,
		historicalSequenceNumbers: historical.value.map(({ sequenceNumber }) => sequenceNumber),
	};
}

window.__minimalFluidDriverResult = run()
	.then((result) => {
		document.querySelector("#result").textContent = JSON.stringify(result);
		return result;
	})
	.catch((error) => {
		const result = { status: "failed", stage, error: String(error?.stack ?? error) };
		document.querySelector("#result").textContent = JSON.stringify(result);
		return result;
	});
