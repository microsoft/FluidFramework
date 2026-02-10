/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDisposable } from "@fluidframework/core-interfaces";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	ISummaryContext,
} from "@fluidframework/driver-definitions/internal";

import {
	HistoryTreeStorageService,
	type IHistoryCheckpointInfo,
	type ISnapshotHistoryOptions,
	SnapshotHistoryManager,
	parseHistoryIndex,
} from "../snapshotHistory.js";

type MockStorageService = IDocumentStorageService &
	IDisposable & {
		uploadedSummaries: { summary: ISummaryTree; context: ISummaryContext }[];
	};

function createMockStorageService(): MockStorageService {
	const uploadedSummaries: { summary: ISummaryTree; context: ISummaryContext }[] = [];
	return {
		uploadedSummaries,
		// eslint-disable-next-line unicorn/no-null
		getSnapshotTree: async () => null,
		getSnapshot: async () => ({
			snapshotTree: { blobs: {}, trees: {}, id: "test" },
			blobContents: new Map(),
			ops: [],
			sequenceNumber: 0,
			latestSequenceNumber: 0,
			snapshotFormatV: 1 as const,
		}),
		getVersions: async () => [],
		createBlob: async () => ({ id: "blobId" }),
		readBlob: async () => new ArrayBuffer(0),
		downloadSummary: async (): Promise<ISummaryTree> => ({
			type: SummaryType.Tree,
			tree: {},
		}),
		uploadSummaryWithContext: async (summary: ISummaryTree, context: ISummaryContext) => {
			uploadedSummaries.push({ summary, context });
			return "summaryHandle";
		},
		policies: {},
		disposed: false,
		dispose: () => {},
	} as unknown as MockStorageService;
}

function getDefaultOptions(): ISnapshotHistoryOptions {
	return {
		enabled: true,
		maxAge: 86400000, // 24h
		minTimeBetweenCheckpoints: 1800000, // 30 min
		minOpsBetweenCheckpoints: 1000,
	};
}

function createAppSummary(): ISummaryTree {
	return {
		type: SummaryType.Tree,
		tree: {
			data: { type: SummaryType.Blob, content: "app-data" },
		},
	};
}

function createSummaryContext(): ISummaryContext {
	return {
		referenceSequenceNumber: 100,
		proposalHandle: undefined,
		ackHandle: "ackHandle",
	};
}

describe("HistoryTreeStorageService", () => {
	let mockStorage: MockStorageService;
	let seqNum: number;

	beforeEach(() => {
		mockStorage = createMockStorageService();
		seqNum = 1000;
	});

	describe("when disabled", () => {
		it("passes through summary unchanged", async () => {
			const options = { ...getDefaultOptions(), enabled: false };
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			const appSummary = createAppSummary();
			await service.uploadSummaryWithContext(appSummary, createSummaryContext());

			const uploaded = mockStorage.uploadedSummaries[0].summary;
			assert.deepStrictEqual(uploaded, appSummary);
			assert.strictEqual(uploaded.tree[".history"], undefined);
		});
	});

	describe("when enabled", () => {
		it("creates .history tree on first summary", async () => {
			const options = getDefaultOptions();
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const uploaded = mockStorage.uploadedSummaries[0].summary;
			assert.notStrictEqual(uploaded.tree[".history"], undefined);
			const historyTree = uploaded.tree[".history"];
			assert.strictEqual(historyTree.type, SummaryType.Tree);
		});

		it("creates checkpoint on first summary when no checkpoints exist", async () => {
			const options = getDefaultOptions();
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			// Should have index blob and cp-1000 subtree
			assert.notStrictEqual(historyTree.tree.index, undefined);
			assert.notStrictEqual(historyTree.tree["cp-1000"], undefined);
		});

		it("creates checkpoint subtree with correct structure", async () => {
			const options = getDefaultOptions();
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			const cpTree = historyTree.tree["cp-1000"] as ISummaryTree;
			assert.strictEqual(cpTree.type, SummaryType.Tree);
			assert.strictEqual(cpTree.groupId, "fluid-history-1000");

			// Contains handles to .app and .protocol
			const appHandle = cpTree.tree[".app"];
			assert.strictEqual(appHandle.type, SummaryType.Handle);
			assert.strictEqual((appHandle as { handle: string }).handle, ".app");

			const protocolHandle = cpTree.tree[".protocol"];
			assert.strictEqual(protocolHandle.type, SummaryType.Handle);
			assert.strictEqual((protocolHandle as { handle: string }).handle, ".protocol");
		});

		it("creates checkpoint subtree with groupId for delay loading", async () => {
			const options = getDefaultOptions();
			seqNum = 5000;
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			const cpTree = historyTree.tree["cp-5000"] as ISummaryTree;
			assert.strictEqual(cpTree.groupId, "fluid-history-5000");
		});

		it("creates valid index blob with checkpoint metadata", async () => {
			const options = getDefaultOptions();
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			const indexBlob = historyTree.tree.index;
			assert.strictEqual(indexBlob.type, SummaryType.Blob);
			const index = JSON.parse((indexBlob as { content: string }).content) as {
				version: number;
				checkpoints: IHistoryCheckpointInfo[];
			};
			assert.strictEqual(index.version, 1);
			assert.strictEqual(index.checkpoints.length, 1);
			assert.strictEqual(index.checkpoints[0].seqNum, 1000);
			assert.strictEqual(index.checkpoints[0].groupId, "fluid-history-1000");
			assert.strictEqual(typeof index.checkpoints[0].timestamp, "number");
		});
	});

	describe("checkpoint interval enforcement", () => {
		it("does not create checkpoint if minTime and minOps not exceeded", async () => {
			const options = getDefaultOptions();
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 1000,
					timestamp: Date.now() - 60000, // 1 minute ago (< 30 min minTime)
					groupId: "fluid-history-1000",
				},
			];
			seqNum = 1100; // only 100 ops (< 1000 minOps)

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			// Should carry forward cp-1000 as handle, no new checkpoint created
			assert.notStrictEqual(historyTree.tree["cp-1000"], undefined);
			assert.strictEqual(historyTree.tree["cp-1100"], undefined);

			// Verify cp-1000 is a handle (carried forward)
			const cpHandle = historyTree.tree["cp-1000"];
			assert.strictEqual(cpHandle.type, SummaryType.Handle);
		});

		it("creates checkpoint when minTime exceeded", async () => {
			const options = getDefaultOptions();
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 1000,
					timestamp: Date.now() - 2000000, // > 30 min ago
					groupId: "fluid-history-1000",
				},
			];
			seqNum = 1050; // only 50 ops but time threshold exceeded

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			// Should have both old and new checkpoint
			assert.notStrictEqual(historyTree.tree["cp-1000"], undefined);
			assert.notStrictEqual(historyTree.tree["cp-1050"], undefined);

			// New checkpoint is a tree (with groupId), old is a handle
			assert.strictEqual((historyTree.tree["cp-1050"] as ISummaryTree).type, SummaryType.Tree);
			assert.strictEqual(historyTree.tree["cp-1000"].type, SummaryType.Handle);
		});

		it("creates checkpoint when minOps exceeded", async () => {
			const options = getDefaultOptions();
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 1000,
					timestamp: Date.now() - 60000, // 1 minute ago (< minTime)
					groupId: "fluid-history-1000",
				},
			];
			seqNum = 2500; // 1500 ops (> 1000 minOps)

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			assert.notStrictEqual(historyTree.tree["cp-2500"], undefined);
		});
	});

	describe("retention enforcement", () => {
		it("drops old non-pinned checkpoints", async () => {
			const options = { ...getDefaultOptions(), maxAge: 3600000 }; // 1h
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 500,
					timestamp: Date.now() - 7200000, // 2 hours ago (> maxAge)
					groupId: "fluid-history-500",
				},
				{
					seqNum: 1000,
					timestamp: Date.now() - 1800000, // 30 min ago (< maxAge)
					groupId: "fluid-history-1000",
				},
			];
			seqNum = 2500;

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			// cp-500 should be dropped (too old)
			assert.strictEqual(historyTree.tree["cp-500"], undefined);
			// cp-1000 should be retained
			assert.notStrictEqual(historyTree.tree["cp-1000"], undefined);
		});

		it("preserves pinned checkpoints regardless of age", async () => {
			const options = { ...getDefaultOptions(), maxAge: 3600000 }; // 1h
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 500,
					timestamp: Date.now() - 7200000, // 2 hours ago (> maxAge)
					groupId: "fluid-history-500",
					pinned: true,
				},
			];
			seqNum = 2500;

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			// cp-500 should be retained because pinned
			assert.notStrictEqual(historyTree.tree["cp-500"], undefined);
		});

		it("includes pinned flag in index for pinned checkpoints", async () => {
			const options = getDefaultOptions();
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 1000,
					timestamp: Date.now() - 60000,
					groupId: "fluid-history-1000",
					pinned: true,
				},
			];
			seqNum = 1050;

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			const index = JSON.parse((historyTree.tree.index as { content: string }).content) as {
				checkpoints: IHistoryCheckpointInfo[];
			};
			const pinnedEntry = index.checkpoints.find((cp) => cp.seqNum === 1000);
			assert.strictEqual(pinnedEntry?.pinned, true);
		});
	});

	describe("carried-forward handles", () => {
		it("carries forward retained checkpoints as ISummaryHandle", async () => {
			const options = getDefaultOptions();
			const initialCheckpoints: IHistoryCheckpointInfo[] = [
				{
					seqNum: 1000,
					timestamp: Date.now() - 60000,
					groupId: "fluid-history-1000",
				},
			];
			seqNum = 1050;

			const service = new HistoryTreeStorageService(
				mockStorage,
				options,
				() => seqNum,
				initialCheckpoints,
			);

			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const historyTree = mockStorage.uploadedSummaries[0].summary.tree[
				".history"
			] as ISummaryTree;
			const cpHandle = historyTree.tree["cp-1000"];
			assert.strictEqual(cpHandle.type, SummaryType.Handle);
			assert.strictEqual((cpHandle as { handleType: number }).handleType, SummaryType.Tree);
			assert.strictEqual((cpHandle as { handle: string }).handle, ".history/cp-1000");
		});
	});

	describe("getCheckpoints", () => {
		it("returns empty array for no checkpoints", () => {
			const service = new HistoryTreeStorageService(
				mockStorage,
				getDefaultOptions(),
				() => 0,
				[],
			);
			assert.deepStrictEqual(service.getCheckpoints(), []);
		});

		it("returns initialized checkpoints", () => {
			const checkpoints: IHistoryCheckpointInfo[] = [
				{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
				{ seqNum: 2000, timestamp: 200, groupId: "fluid-history-2000" },
			];
			const service = new HistoryTreeStorageService(
				mockStorage,
				getDefaultOptions(),
				() => 0,
				checkpoints,
			);
			assert.deepStrictEqual(service.getCheckpoints(), checkpoints);
		});

		it("returns updated checkpoints after upload", async () => {
			seqNum = 1000;
			const service = new HistoryTreeStorageService(
				mockStorage,
				getDefaultOptions(),
				() => seqNum,
				[],
			);
			await service.uploadSummaryWithContext(createAppSummary(), createSummaryContext());

			const result = service.getCheckpoints();
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].seqNum, 1000);
		});
	});

	describe("initializeCheckpoints", () => {
		it("replaces existing checkpoints", () => {
			const service = new HistoryTreeStorageService(
				mockStorage,
				getDefaultOptions(),
				() => 0,
				[{ seqNum: 500, timestamp: 50, groupId: "fluid-history-500" }],
			);

			const newCheckpoints: IHistoryCheckpointInfo[] = [
				{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
				{ seqNum: 2000, timestamp: 200, groupId: "fluid-history-2000" },
			];
			service.initializeCheckpoints(newCheckpoints);

			assert.deepStrictEqual(service.getCheckpoints(), newCheckpoints);
		});
	});

	describe("original summary preservation", () => {
		it("preserves all original summary tree entries", async () => {
			const options = getDefaultOptions();
			const service = new HistoryTreeStorageService(mockStorage, options, () => seqNum, []);

			const appSummary: ISummaryTree = {
				type: SummaryType.Tree,
				tree: {
					".app": {
						type: SummaryType.Tree,
						tree: { data: { type: SummaryType.Blob, content: "app" } },
					},
					".protocol": {
						type: SummaryType.Tree,
						tree: { attrs: { type: SummaryType.Blob, content: "proto" } },
					},
				},
			};

			await service.uploadSummaryWithContext(appSummary, createSummaryContext());

			const uploaded = mockStorage.uploadedSummaries[0].summary;
			assert.notStrictEqual(uploaded.tree[".app"], undefined);
			assert.notStrictEqual(uploaded.tree[".protocol"], undefined);
			assert.notStrictEqual(uploaded.tree[".history"], undefined);
		});
	});
});

describe("parseHistoryIndex", () => {
	it("returns empty array when no history tree exists", async () => {
		const result = await parseHistoryIndex({ trees: {} }, async () => new ArrayBuffer(0));
		assert.deepStrictEqual(result, []);
	});

	it("returns empty array when snapshot is undefined", async () => {
		const result = await parseHistoryIndex(undefined, async () => new ArrayBuffer(0));
		assert.deepStrictEqual(result, []);
	});

	it("parses valid index blob", async () => {
		const indexContent = JSON.stringify({
			version: 1,
			checkpoints: [
				{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
				{ seqNum: 2000, timestamp: 200, groupId: "fluid-history-2000", pinned: true },
			],
		});
		const blobId = "index-blob-id";

		const snapshotTree = {
			trees: {
				".history": {
					blobs: { index: blobId },
				},
			},
		};

		const result = await parseHistoryIndex(snapshotTree, async (id) => {
			assert.strictEqual(id, blobId);
			return new TextEncoder().encode(indexContent).buffer;
		});

		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].seqNum, 1000);
		assert.strictEqual(result[1].seqNum, 2000);
		assert.strictEqual(result[1].pinned, true);
	});

	it("returns empty array for unknown version", async () => {
		const indexContent = JSON.stringify({
			version: 99,
			checkpoints: [{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" }],
		});
		const blobId = "index-blob-id";

		const snapshotTree = {
			trees: {
				".history": {
					blobs: { index: blobId },
				},
			},
		};

		const result = await parseHistoryIndex(snapshotTree, async () => {
			return new TextEncoder().encode(indexContent).buffer;
		});

		assert.deepStrictEqual(result, []);
	});
});

describe("SnapshotHistoryManager", () => {
	let mockStorage: MockStorageService;

	beforeEach(() => {
		mockStorage = createMockStorageService();
	});

	it("getCheckpoints returns empty array when no checkpoints", () => {
		const service = new HistoryTreeStorageService(
			mockStorage,
			getDefaultOptions(),
			() => 0,
			[],
		);
		const manager = new SnapshotHistoryManager(service);
		assert.deepStrictEqual(manager.getCheckpoints(), []);
	});

	it("getCheckpoints returns all checkpoints", () => {
		const checkpoints: IHistoryCheckpointInfo[] = [
			{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
			{ seqNum: 3000, timestamp: 300, groupId: "fluid-history-3000" },
		];
		const service = new HistoryTreeStorageService(
			mockStorage,
			getDefaultOptions(),
			() => 0,
			checkpoints,
		);
		const manager = new SnapshotHistoryManager(service);
		assert.deepStrictEqual(manager.getCheckpoints(), checkpoints);
	});

	it("getCheckpoint finds checkpoint by exact seqNum", () => {
		const checkpoints: IHistoryCheckpointInfo[] = [
			{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
			{ seqNum: 3000, timestamp: 300, groupId: "fluid-history-3000" },
		];
		const service = new HistoryTreeStorageService(
			mockStorage,
			getDefaultOptions(),
			() => 0,
			checkpoints,
		);
		const manager = new SnapshotHistoryManager(service);

		const result = manager.getCheckpoint(3000);
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result?.seqNum, 3000);
	});

	it("getCheckpoint returns undefined for non-existent seqNum", () => {
		const service = new HistoryTreeStorageService(mockStorage, getDefaultOptions(), () => 0, [
			{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
		]);
		const manager = new SnapshotHistoryManager(service);
		assert.strictEqual(manager.getCheckpoint(2000), undefined);
	});

	it("getClosestCheckpoint finds closest checkpoint at or before seqNum", () => {
		const checkpoints: IHistoryCheckpointInfo[] = [
			{ seqNum: 1000, timestamp: 100, groupId: "fluid-history-1000" },
			{ seqNum: 3000, timestamp: 300, groupId: "fluid-history-3000" },
			{ seqNum: 5000, timestamp: 500, groupId: "fluid-history-5000" },
		];
		const service = new HistoryTreeStorageService(
			mockStorage,
			getDefaultOptions(),
			() => 0,
			checkpoints,
		);
		const manager = new SnapshotHistoryManager(service);

		assert.strictEqual(manager.getClosestCheckpoint(4000)?.seqNum, 3000);
		assert.strictEqual(manager.getClosestCheckpoint(5000)?.seqNum, 5000);
		assert.strictEqual(manager.getClosestCheckpoint(6000)?.seqNum, 5000);
		assert.strictEqual(manager.getClosestCheckpoint(999), undefined);
	});
});
