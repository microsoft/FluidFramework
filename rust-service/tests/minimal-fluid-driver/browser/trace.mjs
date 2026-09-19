/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { openWebTransport } from "@fluidframework/sea-typescript/internal/webtransport";
import {
	SeaDeltaConnection,
	SeaDriver,
	SeaSessionDriverClient,
} from "@fluidframework/sea-driver/internal";

const decoder = new TextDecoder();
const parameters = new URLSearchParams(location.search);
let stage = "initializing";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function waitForCount(messages, count) {
	const deadline = performance.now() + 10_000;
	while (messages.length < count) {
		assert(performance.now() < deadline, `timed out during ${stage}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert(messages.length === count, "duplicate projected delivery");
}

async function run() {
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing certificate hash");
	const started = performance.now();
	const hash = Uint8Array.from(certificateHex.match(/../g), (value) =>
		Number.parseInt(value, 16),
	);
	const sessions = [];
	const services = [];
	const connections = [];
	const synchronizationErrors = [];
	const factory = new SeaDriver(
		async () =>
			new SeaSessionDriverClient(async (document, options) => {
				const session = await openWebTransport(
					{ url: transportUrl, certificateHash: hash },
					document,
					options,
				);
				sessions.push(session);
				return session;
			}, "clientSelected"),
		{ onSynchronizationError: (error) => synchronizationErrors.push(String(error)) },
	);
	try {
		const resolvedUrl = {
			type: "fluid",
			id: `browser-driver-${Date.now()}`,
			url: "fluid://minimal/browser-driver",
			tokens: {},
			endpoints: {},
		};
		stage = "creating-container";
		const created = await factory.createContainer(
			{ type: 1, tree: { counter: { type: 2, content: "0" } } },
			resolvedUrl,
		);
		services.push(created);
		stage = "loading-container";
		const loaded = await factory.createDocumentService(created.resolvedUrl);
		services.push(loaded);
		const storage = await loaded.connectToStorage();
		const snapshot = await storage.getSnapshotTree();
		assert(snapshot, "summary reload returned no snapshot");
		assert(
			decoder.decode(await storage.readBlob(snapshot.blobs.counter)) === "0",
			"summary blob reload mismatch",
		);
		const client = {
			mode: "write",
			details: { capabilities: { interactive: true } },
			permission: [],
			scopes: [],
			user: { id: "trace" },
		};
		const first = await loaded.connectToDeltaStream(client);
		connections.push(first);
		const firstMessages = [];
		first.on("op", (_document, messages) =>
			firstMessages.push(...messages.filter((message) => message.type === "op")),
		);
		const secondService = await factory.createDocumentService(created.resolvedUrl);
		services.push(secondService);
		const second = await secondService.connectToDeltaStream(client);
		connections.push(second);
		const secondMessages = [];
		second.on("op", (_document, messages) =>
			secondMessages.push(...messages.filter((message) => message.type === "op")),
		);
		assert(
			second.initialMessages
				.filter((message) => message.type === "join")
				.map((message) => JSON.parse(message.data).clientId)
				.join(",") === `${first.clientId},${second.clientId}`,
			"shared membership identities mismatch",
		);
		const firstSequence = second.checkpointSequenceNumber + 1;
		assert(first instanceof SeaDeltaConnection, "first delta connection type mismatch");
		assert(second instanceof SeaDeltaConnection, "second delta connection type mismatch");
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
		stage = "two-client-delivery";
		await Promise.all([waitForCount(firstMessages, 2), waitForCount(secondMessages, 2)]);
		assert(
			firstMessages.map(({ sequenceNumber }) => sequenceNumber).join(",") ===
				`${firstSequence},${firstSequence + 1}`,
			"first projection mismatch",
		);
		assert(
			secondMessages.map(({ sequenceNumber }) => sequenceNumber).join(",") ===
				`${firstSequence},${firstSequence + 1}`,
			"second projection mismatch",
		);

		stage = "pending-recovery";
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
		await first.resubmitPending((suffix) =>
			suffix.map((pending, index) => ({
				...pending.message,
				clientSequenceNumber: index + 1,
				referenceSequenceNumber: first.checkpointSequenceNumber,
				contents: { delta: pending.message.contents.delta },
			})),
		);
		await Promise.all([waitForCount(firstMessages, 3), waitForCount(secondMessages, 3)]);
		first.disconnect();
		await first.reconnect();
		stage = "post-commit-reconnect";
		const afterReconnect = await first.synchronize();
		assert(afterReconnect.length === 0, "post-commit reconnect duplicated an operation");
		assert(
			(await first.synchronize()).length === 0,
			"second projected page duplicated operations",
		);

		const history = await loaded.connectToDeltaStorage();
		const recoveredSequence = firstMessages[2].sequenceNumber;
		const historicalStream = history.fetchMessages(firstSequence + 1, recoveredSequence + 1);
		const historical = await historicalStream.read();
		assert(!historical.done, "bounded historical read returned no page");
		assert(
			historical.value
				.filter((message) => message.type === "op")
				.map(({ sequenceNumber }) => sequenceNumber)
				.join(",") === `${firstSequence + 1},${recoveredSequence}`,
			"bounded historical range mismatch",
		);
		assert((await historicalStream.read()).done, "bounded history did not end");
		assert(
			firstMessages.map(({ sequenceNumber }) => sequenceNumber).join(",") ===
				`${firstSequence},${firstSequence + 1},${recoveredSequence}`,
			"recovery lost or duplicated delivery",
		);
		assert(
			secondMessages.map(({ sequenceNumber }) => sequenceNumber).join(",") ===
				`${firstSequence},${firstSequence + 1},${recoveredSequence}`,
			"peer recovery delivery mismatch",
		);
		assert(synchronizationErrors.length === 0, synchronizationErrors.join("; "));
		return {
			status: "passed",
			browser: navigator.userAgent,
			startupMilliseconds: performance.now() - started,
			logicalClientCount: 2,
			transportSessionCount: sessions.length,
			firstDelivery: firstMessages.length,
			secondDelivery: secondMessages.length,
			afterReconnect: afterReconnect.length,
			historicalSequenceNumbers: historical.value.map(({ sequenceNumber }) => sequenceNumber),
		};
	} finally {
		for (const connection of connections) connection.dispose();
		for (const service of services) service.dispose();
		await Promise.all(sessions.map((session) => session.close()));
	}
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
