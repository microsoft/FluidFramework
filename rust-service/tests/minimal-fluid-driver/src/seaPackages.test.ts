/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { DirectSharedTreeClient } from "@fluidframework/sea-tree/internal";
import {
	createSeaServiceClient,
	SeaSessionDriverClient,
} from "@fluidframework/sea-driver/internal";
import type { FluidContainer } from "@fluidframework/driver-definitions/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import { createSeaFactories } from "@fluidframework/sea-typescript/internal/presets";
import { makeStubDataStoreKind } from "@fluidframework/shared-object-base/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { defineTreeDataStore } from "@fluidframework/tree/internal";

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

for (const preset of ["split", "combined"] as const) {
	test(`SEA ServiceClient supports detached/attached creation and reload (${preset})`, {
		timeout: 15_000,
	}, async (context) => {
		const service = await createSeaFactories({
			preset,
			environment: "node",
		}).createMemoryService();
		const containers: FluidContainer[] = [];
		context.after(() => {
			for (const container of containers) container.close();
			service.close();
		});
		let opens = 0;
		const client = createSeaServiceClient({
			oldestSupportedClient: "2.20.0",
			openSession: async (document, options) => {
				opens += 1;
				return service.open(document, options);
			},
		});
		const schema = new SchemaFactory(`service-client-${preset}`);
		/** Mutable root used to exercise runtime initialization and live operation replay. */
		class State extends schema.object("State", { value: schema.number }) {}
		const kind = defineTreeDataStore({
			type: "service-client-state",
			config: new TreeViewConfiguration({ schema: State }),
			initializer: () => new State({ value: 0 }),
		});
		const detached = await client.createContainer(kind);
		containers.push(detached);
		assert.equal(detached.id, undefined);
		assert.equal(opens, 0);
		detached.data.root.value = 7;
		const attaching = detached.attach();
		await assert.rejects(detached.attach(), /attach already in progress/u);
		const attached = await attaching;
		assert.equal(attached, detached);
		assert.match(attached.id, /^(?:[0-9a-f]{2})+$/u);
		await assert.rejects(detached.attach(), /already attached/u);
		const loaded = await client.loadContainer(attached.id, kind);
		containers.push(loaded);
		const converged = (): boolean => loaded.data.root.value === 11;
		assert.equal(loaded.id, attached.id);
		assert.equal(loaded.data.root.value, 7);
		attached.data.root.value = 11;
		const deadline = Date.now() + 5_000;
		while (!converged()) {
			assert.ok(Date.now() < deadline, "loaded ServiceClient container did not converge");
			await setImmediate();
		}
		attached.close();
		loaded.close();
		const reopened = await client.loadContainer(attached.id, kind);
		containers.push(reopened);
		assert.equal(reopened.data.root.value, 11);
		const fresh = await client.createAttachedContainer(kind);
		containers.push(fresh);
		assert.notEqual(fresh.id, attached.id);
		assert.equal(fresh.data.root.value, 0);
	});
}

test("SEA ServiceClient preserves registry lookup and compatibility options", {
	timeout: 10_000,
}, async (context) => {
	const containers: FluidContainer[] = [];
	context.after(() => {
		for (const container of containers) container.close();
	});
	const root = makeStubDataStoreKind("sea-service-root");
	const child = makeStubDataStoreKind("sea-service-child");
	const lookups: string[] = [];
	const registry = async (type: string) => {
		lookups.push(type);
		if (type === root.type) return root;
		if (type === child.type) return child;
		throw new Error(`Unknown data store: ${type}`);
	};
	const options = {
		oldestSupportedClient: "2.20.0" as "2.20.0" | "3.999.0",
		openSession: async () => {
			throw new Error("detached creation must not open SEA");
		},
	};
	const client = createSeaServiceClient(options);
	options.oldestSupportedClient = "3.999.0";
	const detached = await client.createContainer(root, registry);
	containers.push(detached);
	await detached.createDataStore(child);
	assert.ok(lookups.includes(root.type));
	assert.ok(lookups.includes(child.type));
	await assert.rejects(
		detached.createDataStore(makeStubDataStoreKind("missing")),
		/Unknown data store/u,
	);
	await assert.rejects(
		createSeaServiceClient(options).createContainer(root),
		/version|Version/u,
	);
});

test("SEA ServiceClient releases memberships when initial summary upload fails", {
	timeout: 10_000,
}, async (context) => {
	const service = await createMemoryService({ environment: "node" });
	const sessions = new Set<Awaited<ReturnType<typeof service.open>>>();
	const closed = new Set<Awaited<ReturnType<typeof service.open>>>();
	context.after(async () => {
		await Promise.all([...sessions].map(async (session) => session.close()));
		service.close();
	});
	const client = createSeaServiceClient({
		oldestSupportedClient: "2.20.0",
		openSession: async (document, options) => {
			const session = await service.open(document, options);
			sessions.add(session);
			return {
				...session,
				putBlob: async () => {
					throw new Error("injected initial summary failure");
				},
				close: async () => {
					await session.close();
					closed.add(session);
				},
			};
		},
	});
	await assert.rejects(
		client.createAttachedContainer(makeStubDataStoreKind("failed-attach")),
		/injected initial summary failure/u,
	);
	await setImmediate();
	assert.ok(sessions.size > 0);
	assert.equal(
		closed.size,
		sessions.size,
		"all admitted memberships must be closed on attach failure",
	);
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
