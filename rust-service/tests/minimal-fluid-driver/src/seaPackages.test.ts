/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { DirectSharedTreeClient } from "@fluidframework/sea-tree/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

import { createGeneratedSeaBindingAdapter } from "./generatedSeaBinding.js";

/** Workspace dependency fields relevant to the driver isolation contract. */
interface WorkspacePackage {
	/** Package identity used to detect forbidden dependencies. */
	readonly name: string;
	/** Runtime dependencies, including workspace links. */
	readonly dependencies?: Readonly<Record<string, string>>;
	/** Development dependencies, which also participate in the build graph. */
	readonly devDependencies?: Readonly<Record<string, string>>;
	/** Optional dependencies, which must also respect the package boundary. */
	readonly optionalDependencies?: Readonly<Record<string, string>>;
	/** Peer dependencies that a consumer must provide. */
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

test("sea-driver's workspace dependency graph does not reach SharedTree", () => {
	const visited = new Set<string>();
	const pending = [
		fileURLToPath(new URL("../../../packages/sea-driver/package.json", import.meta.url)),
	];
	while (pending.length > 0) {
		const next = pending.pop();
		assert.ok(next !== undefined);
		const manifestPath = realpathSync(next);
		if (visited.has(manifestPath)) {
			continue;
		}
		visited.add(manifestPath);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as WorkspacePackage;
		assert.notEqual(manifest.name, "@fluidframework/tree");
		assert.notEqual(manifest.name, "@fluidframework/sea-tree");
		for (const dependencies of [
			manifest.dependencies,
			manifest.devDependencies,
			manifest.optionalDependencies,
			manifest.peerDependencies,
		]) {
			for (const [name, version] of Object.entries(dependencies ?? {})) {
				assert.notEqual(
					name,
					"@fluidframework/tree",
					`${manifest.name} depends on SharedTree`,
				);
				assert.notEqual(
					name,
					"@fluidframework/sea-tree",
					`${manifest.name} depends on sea-tree`,
				);
				if (version.startsWith("workspace:")) {
					pending.push(resolve(dirname(manifestPath), "node_modules", name, "package.json"));
				}
			}
		}
	}
	assert.ok(visited.size > 1, "the check must traverse workspace dependencies");
});

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
	const require = createRequire(import.meta.url);
	const bindings =
		require("../../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js") as typeof import("../../../crates/sea-webtransport/test-support/pkg/web/sea_webtransport_test_support.js");
	const service = await bindings.SeaLocalService.create();
	const clients: DirectSharedTreeClient[] = [];
	const views: { dispose(): void }[] = [];
	context.after(async () => {
		for (const view of views) {
			view.dispose();
		}
		await Promise.all(clients.map(async (client) => client.dispose()));
		service.free();
	});
	const writer = await DirectSharedTreeClient.create(
		createGeneratedSeaBindingAdapter(service.connect(), bindings, "SeaSelected"),
		new Uint8Array(),
		4,
		1024 * 1024,
		true,
	);
	clients.push(writer);
	const observer = await DirectSharedTreeClient.create(
		createGeneratedSeaBindingAdapter(service.connect(), bindings, "SeaSelected"),
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
