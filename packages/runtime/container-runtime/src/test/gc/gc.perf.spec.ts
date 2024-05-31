/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions/internal";
import {
	MockLogger,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";

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

function createGarbageCollector(params: {
	deleteSweepReadyNodes: (sweepReadyRoutes: string[]) => string[];
	getGCData: () => Promise<IGarbageCollectionData>;
	logger: MockLogger;
	createParams?: Partial<IGarbageCollectorCreateParams>;
	gcBlobsMap?: Map<string, any>;
	gcMetadata?: IGCMetadata;
	closeFn?: (error?: ICriticalContainerError) => void;
	isSummarizerClient?: boolean;
}): GcWithPrivates {
	const {
		createParams = {},
		gcBlobsMap = new Map(),
		gcMetadata = {},
		closeFn = () => {},
		isSummarizerClient = true,
		getGCData,
		deleteSweepReadyNodes,
		logger,
	} = params;
	const testPkgPath = ["testPkg"];

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
		baseLogger: createChildLogger({ logger }),
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

describe("GC benchmark tests", () => {
	/**
	 * Called when sweep runs. It deleted the nodes from gcData.
	 */
	function deleteSweepReadyNodes(
		sweepReadyRoutes: string[],
		gcData: IGarbageCollectionData,
	): string[] {
		for (const nodeId of sweepReadyRoutes) {
			assert(gcData.gcNodes[nodeId] !== undefined, `Deleted node ${nodeId} doesn't exist`);
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete gcData.gcNodes[nodeId];
		}
		return sweepReadyRoutes;
	}

	describe("initializeOrUpdateGCState", () => {
		const configProvider = createTestConfigProvider();
		const inactiveTimeoutMs = 100;

		// The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
		let defaultGCData: IGarbageCollectionData = { gcNodes: {} };
		let garbageCollector: GcWithPrivates;
		let mockLogger: MockLogger;

		/**
		 * Sets up the garbage collector to have unreferenced nodes that will be updated
		 * in the benchmark tests.
		 */
		const setup = async (unrefNodeCount: number) => {
			mockLogger = new MockLogger();
			const mc = mixinMonitoringContext(mockLogger, configProvider);
			garbageCollector = createGarbageCollector({
				createParams: {
					gcOptions: { inactiveTimeoutMs },
				},
				deleteSweepReadyNodes: (sweepReadyNodes: string[]) =>
					deleteSweepReadyNodes(sweepReadyNodes, defaultGCData),
				getGCData: async () => Promise.resolve(defaultGCData),
				logger: mc.logger,
			});

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
			garbageCollector.baseSnapshotDataP = Promise.resolve(baseSnapshot);

			// Call initializeOrUpdateGCState once so that it initializes the GC state from the
			// base snapshot. The calls to initializeOrUpdateGCState after this one happens on
			// every connection and that's the one we are benchmarking
			await garbageCollector.initializeOrUpdateGCState();
		};

		const cleanup = () => {
			mockLogger.clear();
			configProvider.clear();
			defaultGCData = { gcNodes: {} };
			garbageCollector?.dispose();
		};

		/**
		 * These tests benchmark how long it takes for the initializeOrUpdateGCState function to run
		 * when there are a high number of unreferenced nodes. Since this results in clearing and
		 * setting of timers, it takes a long time and can cause slow downs.
		 */
		benchmark({
			title: "5000 unref nodes",
			type: BenchmarkType.Measurement,
			before: async () => setup(5000 /* unrefNodeCount */),
			benchmarkFnAsync: async () => {
				await garbageCollector.initializeOrUpdateGCState();
			},
			after: cleanup,
		});

		benchmark({
			title: "15000 unref nodes",
			type: BenchmarkType.Measurement,
			before: async () => setup(15000 /* unrefNodeCount */),
			benchmarkFnAsync: async () => {
				await garbageCollector.initializeOrUpdateGCState();
			},
			after: cleanup,
		});

		benchmark({
			title: "30000 unref nodes",
			type: BenchmarkType.Measurement,
			before: async () => setup(30000 /* unrefNodeCount */),
			benchmarkFnAsync: async () => {
				await garbageCollector.initializeOrUpdateGCState();
			},
			after: cleanup,
		});
	});
});
