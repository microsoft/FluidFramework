/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { LazyPromise } from "@fluidframework/core-utils/internal";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import {
	MockLogger,
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import {
	GCNodeType,
	GarbageCollector,
	IGCMetadata,
	IGarbageCollectionRuntime,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	stableGCVersion,
} from "../../gc/index.js";
import { ContainerRuntimeGCMessage } from "../../messageTypes.js";
import { pkgVersion } from "../../packageVersion.js";
import { createTestConfigProvider } from "./gcUnitTestHelpers.js";

type GcWithPrivates = IGarbageCollector & {
	baseSnapshotDataP: Promise<IGarbageCollectionSnapshotData | undefined>;
	initializeOrUpdateGCState: () => Promise<void>;
};

describe("GC benchmark tests", () => {
	const configProvider = createTestConfigProvider();
	const testPkgPath = ["testPkg"];
	const inactiveTimeoutMs = 100;

	// The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
	let defaultGCData: IGarbageCollectionData = { gcNodes: {} };

	let mockLogger: MockLogger;
	let mc: MonitoringContext<MockLogger>;
	let garbageCollector: GcWithPrivates;

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
		params: {
			createParams?: Partial<IGarbageCollectorCreateParams>;
			gcBlobsMap?: Map<string, any>;
			gcMetadata?: IGCMetadata;
			closeFn?: (error?: ICriticalContainerError) => void;
			isSummarizerClient?: boolean;
			getGCData?: (fullGC?: boolean) => Promise<IGarbageCollectionData>;
		} = {},
	): GcWithPrivates {
		const {
			createParams = {},
			gcBlobsMap = new Map(),
			gcMetadata = {},
			closeFn = () => {},
			isSummarizerClient = true,
			getGCData = async () => defaultGCData,
		} = params;

		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/").length !== 2) {
				return GCNodeType.Other;
			}
			return GCNodeType.DataStore;
		};

		// The runtime to be passed to the garbage collector.
		const gcRuntime: IGarbageCollectionRuntime = {
			updateStateBeforeGC: async () => {},
			getGCData,
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
			submitMessage: (message: ContainerRuntimeGCMessage) => {},
			sessionExpiryTimerStarted: createParams.sessionExpiryTimerStarted,
		}) as GcWithPrivates;
	}

	beforeEach(() => {
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(mockLogger, configProvider);
		garbageCollector = createGarbageCollector({
			createParams: {
				gcOptions: { inactiveTimeoutMs },
			},
		});
	});

	afterEach(() => {
		mockLogger.clear();
		configProvider.clear();
		defaultGCData = { gcNodes: {} };
		garbageCollector?.dispose();
	});

	/**
	 * These tests benchmark how long it takes for the initializeOrUpdateGCState function to run
	 * when there are a high number of unreferenced nodes. Since this results in clearing and
	 * setting of timers, it takes a long time and can cause slow downs.
	 */
	// The benchmark runs for the following number of unreferenced nodes.
	const unrefNodeCounts = [5000, 15000, 30000];
	for (const unrefNodeCount of unrefNodeCounts) {
		it(`initializeOrUpdateGCState with ${unrefNodeCount} nodes`, async () => {
			const currentTime = Date.now();
			// Set the unreferenced timestamp to older than inactive timeout so that the nodes start
			// as inactive.
			const unreferencedTimestampMs = currentTime - (inactiveTimeoutMs + 10);

			// Generate a base snapshot that has `unrefNodeCount` number of unreferenced nodes
			// and all are inactive.
			const gcState: IGarbageCollectionState = { gcNodes: {} };
			for (let i = 0; i < unrefNodeCount; i++) {
				gcState.gcNodes[`node${i}`] = {
					outboundRoutes: [],
					unreferencedTimestampMs,
				};
			}
			const baseSnapshot: IGarbageCollectionSnapshotData = {
				gcState,
				tombstones: [],
				deletedNodes: [],
			};

			// Override the base snapshot promise to return the above snapshot.
			garbageCollector.baseSnapshotDataP = new LazyPromise<
				IGarbageCollectionSnapshotData | undefined
			>(async () => baseSnapshot);

			// Call initializeOrUpdateGCState once so that it initializes the GC state from the
			// base snapshot. The calls to initializeOrUpdateGCState after this one happens on
			// every connection and that's the one we are benchmarking
			await garbageCollector.initializeOrUpdateGCState();

			// Repeat the benchmark at least twice and get the average.
			const repeatCount = 2;
			let totalTime: number = 0;
			for (let i = 0; i < repeatCount; i++) {
				const s = performance.now();
				await garbageCollector.initializeOrUpdateGCState();
				const e = performance.now();
				totalTime += e - s;
			}
			console.log(`Avg time for ${unrefNodeCount} nodes: ${totalTime / repeatCount}`);
		});
	}
});
