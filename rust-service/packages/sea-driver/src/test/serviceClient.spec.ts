/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setImmediate } from "node:timers/promises";

import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { FluidContainer } from "@fluidframework/driver-definitions/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";
import { makeStubDataStoreKind } from "@fluidframework/shared-object-base/internal";
import { spy, useFakeTimers } from "sinon";

import { createSeaServiceClient } from "../index.js";
import { SeaDocumentStorage } from "../storage.js";

describe("SEA ServiceClient", () => {
	it("automatically summarizes attached changes and reloads the acknowledged snapshot", async () => {
		const service = await createMemoryService({ environment: "node" });
		const clock = useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
		});
		const loadRuntime = spy(ContainerRuntime, "loadRuntime2");
		const getSnapshotTree = spy(SeaDocumentStorage.prototype, "getSnapshotTree");
		const containers: FluidContainer[] = [];
		const publications: bigint[] = [];
		try {
			const root = makeStubDataStoreKind("summary-root");
			const child = makeStubDataStoreKind("summary-child");
			const registry = async (type: string) => {
				assert.ok(type === root.type || type === child.type);
				return type === root.type ? root : child;
			};
			const client = createSeaServiceClient({
				oldestSupportedClient: "2.20.0",
				openSession: async (document, options) => {
					const session = await service.open(document, options);
					return {
						...session,
						publishSnapshot: async (...args) => {
							const snapshot = await session.publishSnapshot(...args);
							publications.push(snapshot.atEvent);
							return snapshot;
						},
					};
				},
			});
			const container = await client.createAttachedContainer(root, registry);
			containers.push(container);
			assert.equal(publications.length, 1, "attachment publishes the initial snapshot");
			const initialRuntime = await loadRuntime.firstCall.returnValue;
			const summaryResults: string[] = [];
			initialRuntime.runtime.on("summarize", ({ result }) => summaryResults.push(result));
			const childIds: string[] = [];
			for (let summaryIndex = 0; summaryIndex < 2; summaryIndex++) {
				const childStore = await initialRuntime.runtime.createDataStore(child.type);
				childIds.push(childStore.entryPoint.absolutePath.slice(1));
				assert.equal(
					await childStore.trySetAlias(`summarized-child-${summaryIndex}`),
					"Success",
				);
				for (
					let attempt = 0;
					attempt < 1200 && summaryResults.length <= summaryIndex;
					attempt++
				) {
					await clock.tickAsync(100);
					await setImmediate();
				}
				assert.equal(
					summaryResults[summaryIndex],
					"success",
					"automatic summary must be acknowledged",
				);
				assert.equal(publications.length, summaryIndex + 2);
				assert.ok((publications[summaryIndex + 1] ?? 0n) > (publications[summaryIndex] ?? 0n));
			}
			const reloaded = await client.loadContainer(container.id, registry);
			containers.push(reloaded);
			const reloadedRuntime = await loadRuntime.lastCall.returnValue;
			const snapshot = await getSnapshotTree.lastCall.returnValue;
			const gcSnapshot = snapshot?.trees.gc;
			assert.ok(gcSnapshot, "automatic summaries must retain Fluid GC state");
			const gcNodes: Record<string, { outboundRoutes: string[] }> = {};
			const storage = getSnapshotTree.lastCall.thisValue as SeaDocumentStorage;
			for (const [key, blob] of Object.entries(gcSnapshot.blobs)) {
				if (key.startsWith("__gc")) {
					const state = JSON.parse(new TextDecoder().decode(await storage.readBlob(blob))) as {
						gcNodes: typeof gcNodes;
					};
					Object.assign(gcNodes, state.gcNodes);
				}
			}
			assert.ok(reloadedRuntime.runtime.deltaManager.initialSequenceNumber > 0);
			for (const [index, childId] of childIds.entries()) {
				assert.ok(gcNodes[`/${childId}`], "GC must track the attached child");
				assert.ok(gcNodes["/"]?.outboundRoutes.includes(`/${childId}`));
				assert.ok(
					snapshot?.trees[".channels"]?.trees[childId],
					"snapshot must contain the attached child",
				);
				assert.ok(
					await reloadedRuntime.runtime.getAliasedDataStoreEntryPoint(
						`summarized-child-${index}`,
					),
				);
			}
		} finally {
			for (const container of containers) container.close();
			await clock.tickAsync(10_000);
			getSnapshotTree.restore();
			loadRuntime.restore();
			clock.restore();
			service.close();
		}
	}).timeout(20_000);

	it("preserves registry lookup and compatibility options", async () => {
		const containers: FluidContainer[] = [];
		try {
			const root = makeStubDataStoreKind("sea-service-root");
			const child = makeStubDataStoreKind("sea-service-child");
			const lookups: string[] = [];
			const registry = async (type: string) => {
				lookups.push(type);
				if (type === root.type) {
					return root;
				}
				if (type === child.type) {
					return child;
				}
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
		} finally {
			for (const container of containers) {
				container.close();
			}
		}
	}).timeout(10_000);

	it("releases memberships when initial summary upload fails", async () => {
		const service = await createMemoryService({ environment: "node" });
		const sessions = new Set<Awaited<ReturnType<typeof service.open>>>();
		const closed = new Set<Awaited<ReturnType<typeof service.open>>>();
		try {
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
		} finally {
			await Promise.all([...sessions].map(async (session) => session.close()));
			service.close();
		}
	}).timeout(10_000);
});
