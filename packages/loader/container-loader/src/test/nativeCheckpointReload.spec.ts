/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type {
	IDocumentStorageService,
	ISnapshotTree,
	ISnapshot,
} from "@fluidframework/driver-definitions/internal";
import { FetchSource } from "@fluidframework/driver-definitions/internal";
import { stub } from "sinon";
import { Loader } from "../loader.js";
import {
	loadContainerAfterNativeCheckpointRestore,
	NativeCheckpointReloadStorage,
} from "../nativeCheckpointReload.js";
import { failProxy, failSometimeProxy } from "./failProxy.js";

describe("Native checkpoint reload", () => {
	it("awaits host eviction, strips pending state and pinned headers, and fails closed on eviction error", async () => {
		const container = failProxy<IContainer>();
		let cleared = false;
		const resolve = stub(Loader.prototype, "resolve").callsFake(
			async (request, pendingState) => {
				assert(cleared);
				assert.equal(request.headers?.[LoaderHeader.cache], false);
				assert.equal(request.headers?.[LoaderHeader.version], undefined);
				assert.equal(pendingState, undefined);
				return container;
			},
		);
		const props = {
			codeLoader: { load: async () => assert.fail("not called") },
			urlResolver: {
				resolve: async () => assert.fail("not called"),
				getAbsoluteUrl: async () => assert.fail("not called"),
			},
			documentServiceFactory: {
				createDocumentService: async () => assert.fail("not called"),
				createContainer: async () => assert.fail("not called"),
			},
			request: {
				url: "https://example.test/document",
				headers: { [LoaderHeader.version]: "stale" },
			},
			pendingLocalState: "must never be replayed",
		};
		try {
			assert.equal(
				await loadContainerAfterNativeCheckpointRestore(
					props,
					{ id: "restore", sequenceNumber: 10 },
					async () => {
						cleared = true;
					},
				),
				container,
			);
			await assert.rejects(
				loadContainerAfterNativeCheckpointRestore(
					props,
					{ id: "restore", sequenceNumber: 10 },
					async () => {
						throw new Error("eviction failed");
					},
				),
				/eviction failed/,
			);
			assert.equal(resolve.callCount, 1);
		} finally {
			resolve.restore();
		}
	});

	for (const useSnapshotApi of [false, true]) {
		it(`bypasses caches and rejects stale boundaries (${useSnapshotApi ? "snapshot" : "tree"} API)`, async () => {
			const tree: ISnapshotTree = { blobs: { ".nativeCheckpoints": "catalog" }, trees: {} };
			let sequenceNumber = 10;
			let restoreId = "restore";
			function createCatalog(): ArrayBuffer {
				return new TextEncoder().encode(
					JSON.stringify({
						version: 1,
						checkpoints: [],
						restored: { id: restoreId, sequenceNumber },
					}),
				).buffer;
			}
			const storage = failSometimeProxy<IDocumentStorageService>({
				getVersions: async (_id, _count, _scenario, fetchSource) => {
					assert.equal(fetchSource, FetchSource.noCache);
					return [{ id: "fresh", treeId: "fresh" }];
				},
				getSnapshotTree: async () => tree,
				readBlob: async () => createCatalog(),
				getSnapshot: async (options) => {
					assert.equal(options?.fetchSource, FetchSource.noCache);
					assert.equal(options?.cacheSnapshot, false);
					return {
						snapshotTree: tree,
						blobContents: new Map([["catalog", createCatalog()]]),
						sequenceNumber,
						ops: [],
						latestSequenceNumber: undefined,
						snapshotFormatV: 1,
					} satisfies ISnapshot;
				},
			});
			const wrapper = new NativeCheckpointReloadStorage(storage, {
				id: "restore",
				sequenceNumber: 10,
			});
			const versions = await wrapper.getVersions("fresh", 1);
			async function load(): Promise<ISnapshot | ISnapshotTree | null> {
				return useSnapshotApi ? wrapper.getSnapshot() : wrapper.getSnapshotTree(versions[0]);
			}
			await load();
			sequenceNumber = 9;
			await assert.rejects(load(), /stale state/);
			sequenceNumber = 10;
			restoreId = "different";
			await assert.rejects(load(), /stale state/);
			sequenceNumber = 20;
			await load();
			delete tree.blobs[".nativeCheckpoints"];
			await assert.rejects(load(), /catalog is missing/);
		});
	}
});
