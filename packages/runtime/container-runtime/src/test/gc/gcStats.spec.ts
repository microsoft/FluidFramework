/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions/internal";
import {
	MockLogger,
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import {
	GCNodeType,
	GarbageCollector,
	IGCMetadata,
	IGCStats,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	oneDayMs,
	stableGCVersion,
} from "../../gc/index.js";
import { ContainerRuntimeGCMessage } from "../../messageTypes.js";
import { pkgVersion } from "../../packageVersion.js";

describe("Garbage Collection Stats", () => {
	// Nodes in the reference graph.
	const nodes: string[] = ["/node1", "/node2", "/node3", "/node4", "/node5", "/node6"];
	const testPkgPath = ["testPkg"];

	let mockLogger: MockLogger;
	let mc: MonitoringContext<MockLogger>;
	let clock: SinonFakeTimers;
	let lastGCMessage: ContainerRuntimeGCMessage | undefined;
	let gcMessagesCount: number = 0;

	// The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
	let defaultGCData: IGarbageCollectionData = { gcNodes: {} };

	/**
	 * Called when sweep runs. It deleted the nodes from defaultGCData.
	 */
	function deleteSweepReadyNodes(sweepReadyRoutes: string[]): string[] {
		for (const nodeId of sweepReadyRoutes) {
			assert(
				defaultGCData.gcNodes[nodeId] !== undefined,
				`Deleted node ${nodeId} doesn't exist`,
			);
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete defaultGCData.gcNodes[nodeId];
		}
		return sweepReadyRoutes;
	}

	function createGarbageCollector(
		createParams: Partial<IGarbageCollectorCreateParams> = {},
		gcBlobsMap: Map<string, any> = new Map(),
		gcMetadata: IGCMetadata = {},
		closeFn: (error?: ICriticalContainerError) => void = () => {},
		isSummarizerClient: boolean = true,
	) {
		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/").length !== 2) {
				return GCNodeType.Other;
			}
			return GCNodeType.DataStore;
		};

		// The runtime to be passed to the garbage collector.
		const gcRuntime: IGarbageCollectionRuntime = {
			getGCData: async (fullGC?: boolean) => defaultGCData,
			updateUsedRoutes: (usedRoutes: string[]) => {
				return { totalNodeCount: 0, unusedNodeCount: 0 };
			},
			deleteSweepReadyNodes,
			updateTombstonedRoutes: (tombstoneRoutes: string[]) => {},
			getNodeType,
			getCurrentReferenceTimestampMs: () => Date.now(),
			closeFn,
		};

		let metadata = createParams.metadata;
		const existing = createParams.baseSnapshot !== undefined;
		// For existing, add container runtime metadata which is required for GC to be enabled.
		if (existing) {
			metadata = {
				...metadata,
				...gcMetadata,
				gcFeature: gcMetadata.gcFeature ?? stableGCVersion,
				summaryFormatVersion: 1,
				message: undefined,
			};
		}

		return GarbageCollector.create({
			...createParams,
			runtime: gcRuntime,
			gcOptions: createParams.gcOptions ?? {},
			baseSnapshot: createParams.baseSnapshot,
			baseLogger: createChildLogger({ logger: mc.logger }),
			existing,
			metadata,
			createContainerMetadata: {
				createContainerRuntimeVersion: pkgVersion,
				createContainerTimestamp: Date.now(),
			},
			isSummarizerClient,
			readAndParseBlob: async <T>(id: string) => gcBlobsMap.get(id) as T,
			getNodePackagePath: async (nodeId: string) => testPkgPath,
			getLastSummaryTimestampMs: () => Date.now(),
			submitMessage: (message: ContainerRuntimeGCMessage) => {
				gcMessagesCount++;
				lastGCMessage = message;
			},
		});
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		lastGCMessage = undefined;
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(mockLogger);

		// Set up initial GC graph with 5 nodes and 2 are unreferenced.
		defaultGCData.gcNodes["/"] = [nodes[0]];
		defaultGCData.gcNodes[nodes[0]] = [nodes[1]];
		defaultGCData.gcNodes[nodes[1]] = [];
		defaultGCData.gcNodes[nodes[2]] = [];
		defaultGCData.gcNodes[nodes[3]] = [];

		// Set up the initial GC stats based on the initial GC graph.
		initialStats = {
			nodeCount: 5,
			unrefNodeCount: 2,
			updatedNodeCount: 5,
			dataStoreCount: 5,
			unrefDataStoreCount: 2,
			updatedDataStoreCount: 5,
			attachmentBlobCount: 0,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 0,
			lifetimeNodeCount: 5,
			lifetimeDataStoreCount: 5,
			lifetimeAttachmentBlobCount: 0,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};
	});

	afterEach(() => {
		clock.reset();
		mockLogger.clear();
		defaultGCData = { gcNodes: {} };
	});

	after(() => {
		clock.restore();
	});

	let garbageCollector: IGarbageCollector;
	let initialStats: IGCStats;

	/**
	 * Makes the garbage collector process the last GC message
	 */
	function processLastGCMessage() {
		if (lastGCMessage === undefined) {
			return;
		}
		garbageCollector.processMessages([lastGCMessage.contents], Date.now(), true /* local */);
	}

	describe("Mark phase stats", () => {
		beforeEach(() => {
			garbageCollector = createGarbageCollector({});
		});

		it("can generate initial stats", async () => {
			const gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				initialStats,
				"The stats for first GC run should be same as initial stats",
			);
		});

		it("can generate stats with unreferenced nodes", async () => {
			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);

			// Unreference another data store node.
			defaultGCData.gcNodes[nodes[0]] = [];

			// There should be 1 more unreferenced node / data store.
			// There should be 1 node / data store whose reference state got updated.
			expectedStats.unrefNodeCount++;
			expectedStats.unrefDataStoreCount++;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 1");

			// Unreference another data store node
			defaultGCData.gcNodes["/"] = [];

			// There should be 1 more unreferenced node / data store.
			// There should be 1 node / data store whose reference state got updated.
			expectedStats.unrefNodeCount++;
			expectedStats.unrefDataStoreCount++;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 2");
		});

		it("can generate stats with re-referenced nodes", async () => {
			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);

			// Unreference another data store node.
			defaultGCData.gcNodes[nodes[0]] = [];

			// There should be 1 more unreferenced node / data store.
			// There should be 1 node / data store whose reference state got updated.
			expectedStats.unrefNodeCount++;
			expectedStats.unrefDataStoreCount++;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 1");

			// Add a new reference.
			defaultGCData.gcNodes[nodes[0]] = [nodes[2]];

			// There should be 1 less unreferenced node / data store.
			// There should be 1 node / data store whose reference state got updated.
			expectedStats.unrefNodeCount--;
			expectedStats.unrefDataStoreCount--;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 2");
		});

		it("can generate stats with new nodes", async () => {
			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);

			// Add 2 new nodes and make one of them unreferenced.
			defaultGCData.gcNodes["/"].push(nodes[4]);
			defaultGCData.gcNodes[nodes[4]] = [];
			defaultGCData.gcNodes[nodes[5]] = [];

			// There should be 2 more nodes / data stores.
			// There should be 1 more unreferenced node / data store.
			// There should be 1 node / data store whose referenced state got updated.
			expectedStats.nodeCount += 2;
			expectedStats.dataStoreCount += 2;
			expectedStats.lifetimeNodeCount += 2;
			expectedStats.lifetimeDataStoreCount += 2;
			expectedStats.unrefNodeCount++;
			expectedStats.unrefDataStoreCount++;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats");
		});
	});

	/**
	 * Note that the life time and deleted stats are the same whether sweep is enabled or not.
	 */
	describe("Sweep phase stats", () => {
		const defaultSnapshotCacheExpiryMs = 5 * oneDayMs;
		const sweepTimeoutMs =
			// Tombstone timeout
			defaultSessionExpiryDurationMs +
			defaultSnapshotCacheExpiryMs +
			oneDayMs +
			// + Grace Period
			defaultSweepGracePeriodMs;

		/**
		 * When sweep is enabled, deleted stats are updated in the GC run next to the one where the objects become
		 * sweep ready. This is because the objects are deleted when the GC op sent during GC is ack'd.
		 */
		it("can generate stats with deleted nodes - sweep enabled", async () => {
			// Create garbage collector with sweep enabled.
			garbageCollector = createGarbageCollector({
				gcOptions: { enableGCSweep: true },
			});

			let previousGCMessagesCount = gcMessagesCount;

			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);
			assert(
				gcMessagesCount === previousGCMessagesCount,
				"There shouldn't be new GC messages",
			);

			// Advance the clock past sweep timeout so that unreferenced nodes are marked sweep ready.
			clock.tick(sweepTimeoutMs + 1);

			// There shouldn't be any nodes whose reference state updated.
			expectedStats.updatedNodeCount = 0;
			expectedStats.updatedDataStoreCount = 0;

			// Note that the 2 sweep-ready nodes won't actually be deleted yet (until the GC op is processed)
			// but we account for them in the deleted stats now.
			expectedStats.deletedNodeCount += 2;
			expectedStats.deletedDataStoreCount += 2;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 1");

			assert(
				gcMessagesCount === ++previousGCMessagesCount,
				"There should be one new GC message",
			);

			// Process the GC message so that the sweep ready nodes are deleted.
			processLastGCMessage();

			// The 2 sweep ready nodes / data stores should now be truly deleted.
			// They should be removed from the total node and unreferenced counts.
			expectedStats.nodeCount -= 2;
			expectedStats.dataStoreCount -= 2;
			expectedStats.unrefNodeCount -= 2;
			expectedStats.unrefDataStoreCount -= 2;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 2");
		});

		/**
		 * When sweep is enabled, deleted stats are updated in the GC run next to the one where the objects become
		 * sweep ready. This is because the objects are deleted when the GC op sent during GC is ack'd.
		 */
		it("can generate stats with deleted nodes after multiple sweep runs - sweep enabled", async () => {
			garbageCollector = createGarbageCollector({
				gcOptions: { enableGCSweep: true },
			});

			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);

			let previousGCMessagesCount = gcMessagesCount;

			// Advance the clock past sweep timeout so that unreferenced nodes are marked sweep ready.
			clock.tick(sweepTimeoutMs + 1);

			// There shouldn't be any nodes whose reference state updated.
			expectedStats.updatedNodeCount = 0;
			expectedStats.updatedDataStoreCount = 0;

			// Note that the 2 sweep-ready nodes won't actually be deleted yet (until the GC op is processed)
			// but we account for them in the deleted stats now.
			expectedStats.deletedNodeCount += 2;
			expectedStats.deletedDataStoreCount += 2;

			gcStats = await garbageCollector.collectGarbage({});

			assert(
				gcMessagesCount === ++previousGCMessagesCount,
				"There should be one new GC message",
			);

			// Process the GC message so that the sweep ready nodes are deleted.
			processLastGCMessage();

			// Unreference one more data store node (nodes[1])
			defaultGCData.gcNodes[nodes[0]] = [];

			// The 2 sweep ready nodes / data stores should now be deleted.
			// They should be removed from the total node and unreferenced counts.
			expectedStats.nodeCount -= 2;
			expectedStats.dataStoreCount -= 2;
			expectedStats.unrefNodeCount -= 2;
			expectedStats.unrefDataStoreCount -= 2;
			// There should 1 new unreferenced node / data store and its reference state is updated.
			expectedStats.unrefNodeCount++;
			expectedStats.unrefDataStoreCount++;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 2");

			// Advance the clock past sweep timeout again so that unreferenced node is sweep ready.
			clock.tick(sweepTimeoutMs + 1);

			// No nodes are updated since the last run.
			expectedStats.updatedNodeCount = 0;
			expectedStats.updatedDataStoreCount = 0;

			// Note that the new sweep-ready node won't actually be deleted yet (until the GC op is processed)
			// but we account for it in the deleted stats now.
			expectedStats.deletedNodeCount += 1;
			expectedStats.deletedDataStoreCount += 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 3");

			assert(
				gcMessagesCount === ++previousGCMessagesCount,
				"There should be one new GC message",
			);

			// Process the GC message so that the sweep ready node is deleted.
			processLastGCMessage();

			// The sweep ready node / data store should now be truly deleted.
			// It should be removed from the total node and unreferenced counts.
			expectedStats.nodeCount--;
			expectedStats.dataStoreCount--;
			expectedStats.unrefNodeCount--;
			expectedStats.unrefDataStoreCount--;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 4");
		});

		/**
		 * When sweep is disabled, deleted stats are updated in the same GC run where the objects become
		 * sweep ready. This is because the stats are based on sweep ready state.
		 */
		it("can generate stats with deleted nodes - sweep disabled", async () => {
			garbageCollector = createGarbageCollector({});

			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);

			// Advance the clock past sweep timeout so that unreferenced nodes are sweep ready.
			clock.tick(sweepTimeoutMs + 1);

			// The 2 sweep ready nodes / data stores should now show up deleted.
			// There shouldn't be any nodes whose reference state updated.
			expectedStats.deletedNodeCount = 2;
			expectedStats.deletedDataStoreCount = 2;
			expectedStats.updatedNodeCount = 0;
			expectedStats.updatedDataStoreCount = 0;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats");
		});

		/**
		 * When sweep is disabled, deleted stats are updated in the same GC run where the objects become
		 * sweep ready. This is because the stats are based on sweep ready state.
		 */
		it("can generate stats with deleted nodes after multiple sweep runs - sweep disabled", async () => {
			garbageCollector = createGarbageCollector({});

			const expectedStats = initialStats;
			let gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(
				gcStats,
				expectedStats,
				"The stats for first GC run should be same as initial stats",
			);

			// Advance the clock past sweep timeout so that unreferenced nodes are sweep ready.
			clock.tick(sweepTimeoutMs + 1);

			// The 2 sweep ready nodes / data stores should now show up deleted.
			// There shouldn't be any nodes whose reference state updated.
			expectedStats.deletedNodeCount = 2;
			expectedStats.deletedDataStoreCount = 2;
			expectedStats.updatedNodeCount = 0;
			expectedStats.updatedDataStoreCount = 0;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 1");

			// Unreference another data store node.
			defaultGCData.gcNodes[nodes[0]] = [];

			// There should be 1 more unreferenced node / data store and its referenced
			// state is updated.
			expectedStats.unrefNodeCount++;
			expectedStats.unrefDataStoreCount++;
			expectedStats.updatedNodeCount = 1;
			expectedStats.updatedDataStoreCount = 1;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 2");

			// Advance the clock past sweep timeout again so that unreferenced node is sweep ready.
			clock.tick(sweepTimeoutMs + 1);

			// No nodes are updated since the last run.
			// The sweep ready node / data store should show up as deleted.
			expectedStats.updatedNodeCount = 0;
			expectedStats.updatedDataStoreCount = 0;
			expectedStats.deletedNodeCount++;
			expectedStats.deletedDataStoreCount++;

			gcStats = await garbageCollector.collectGarbage({});
			assert.deepStrictEqual(gcStats, expectedStats, "Incorrect GC stats 3");
		});
	});
});
