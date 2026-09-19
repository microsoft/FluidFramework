/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { createSeaServiceClient } from "@fluidframework/sea-driver/internal";
import type { FluidContainer } from "@fluidframework/driver-definitions/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import { makeStubDataStoreKind } from "@fluidframework/shared-object-base/internal";

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
