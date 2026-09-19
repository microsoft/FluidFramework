/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { DirectSharedTreeClient } from "@fluidframework/sea-tree/internal";
import { SeaSessionDriverClient } from "@fluidframework/sea-driver/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

/** Waits for a peer to apply all operations already acknowledged by the source. */
async function waitForPeer(
	source: DirectSharedTreeClient,
	peer: DirectSharedTreeClient,
): Promise<void> {
	await source.waitForIdle();
	const deadline = Date.now() + 5_000;
	while (peer.lastAppliedSequenceNumber < source.lastAppliedSequenceNumber) {
		assert.ok(Date.now() < deadline, "direct SharedTree peer did not converge");
		await peer.waitForIdle();
		await setImmediate();
	}
}

test("sea-tree package hosts two collaborating SharedTree kernels", {
	timeout: 10_000,
}, async (context) => {
	const service = await createMemoryService({ environment: "node" });
	const clients: DirectSharedTreeClient[] = [];
	const views: { dispose(): void }[] = [];
	context.after(async () => {
		for (const view of views) {
			view.dispose();
		}
		await Promise.all(clients.map(async (client) => client.dispose()));
		service.close();
	});
	const writer = await DirectSharedTreeClient.create(
		new SeaSessionDriverClient(service.open, "seaSelected"),
		new Uint8Array(),
		4,
		1024 * 1024,
		true,
	);
	clients.push(writer);
	const observer = await DirectSharedTreeClient.create(
		new SeaSessionDriverClient(service.open, "seaSelected"),
		writer.documentId,
		4,
		1024 * 1024,
		false,
	);
	clients.push(observer);
	const schemaFactory = new SchemaFactory("sea-package-test");
	/** Shared root schema for the two package consumers. */
	class State extends schemaFactory.object("State", { value: schemaFactory.number }) {}
	const configuration = new TreeViewConfiguration({ schema: State });
	const writerView = writer.tree.viewWith(configuration);
	views.push(writerView);
	writerView.initialize({ value: 0 });
	await waitForPeer(writer, observer);
	const observerView = observer.tree.viewWith(configuration);
	views.push(observerView);
	assert.equal(observerView.root.value, 0);
	writerView.root.value = 7;
	await waitForPeer(writer, observer);
	assert.equal(observerView.root.value, 7);
	observerView.root.value = 11;
	await waitForPeer(observer, writer);
	assert.equal(writerView.root.value, 11);
});
