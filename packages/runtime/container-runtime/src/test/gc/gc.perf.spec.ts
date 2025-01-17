/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import {
	// eslint-disable-next-line import/no-deprecated
	GCNodeType,
	GarbageCollector,
	IGarbageCollectionRuntime,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollector,
	type IGCRuntimeOptions,
} from "../../gc/index.js";
import { ContainerRuntimeGCMessage } from "../../messageTypes.js";
import { pkgVersion } from "../../packageVersion.js";

import { parseNothing } from "./gcUnitTestHelpers.js";

type GcWithPrivates = IGarbageCollector & {
	baseSnapshotDataP: Promise<IGarbageCollectionSnapshotData | undefined>;
	initializeOrUpdateGCState: () => Promise<void>;
};

function createGarbageCollector(gcOptions: IGCRuntimeOptions): GcWithPrivates {
	const getNodeType = (nodePath: string) => {
		if (nodePath.split("/").length !== 2) {
			// eslint-disable-next-line import/no-deprecated
			return GCNodeType.Other;
		}
		// eslint-disable-next-line import/no-deprecated
		return GCNodeType.DataStore;
	};

	// The runtime to be passed to the garbage collector.
	const gcRuntime: IGarbageCollectionRuntime = {
		getGCData: async () => {
			return { gcNodes: {} };
		},
		updateUsedRoutes: (usedRoutes: string[]) => {
			return { totalNodeCount: 0, unusedNodeCount: 0 };
		},
		deleteSweepReadyNodes: (sweepReadyRoutes: string[]) => {
			return [];
		},
		updateTombstonedRoutes: (tombstoneRoutes: string[]) => {},
		getNodeType,
		getCurrentReferenceTimestampMs: () => Date.now(),
		closeFn: () => {},
	};

	return GarbageCollector.create({
		runtime: gcRuntime,
		gcOptions,
		baseSnapshot: undefined,
		baseLogger: createChildLogger({}),
		existing: false,
		metadata: undefined,
		createContainerMetadata: {
			createContainerRuntimeVersion: pkgVersion,
			createContainerTimestamp: Date.now(),
		},
		// eslint-disable-next-line import/no-deprecated
		isSummarizerClient: true,
		readAndParseBlob: parseNothing,
		getNodePackagePath: async (nodeId: string) => ["gcBenchmarkTestPkg"],
		getLastSummaryTimestampMs: () => Date.now(),
		submitMessage: (message: ContainerRuntimeGCMessage) => {},
	}) as GcWithPrivates;
}

describe("GC benchmark tests", () => {
	describe("initializeOrUpdateGCState", () => {
		const inactiveTimeoutMs = 100;
		let garbageCollector: GcWithPrivates;

		/**
		 * Sets up the garbage collector to have unreferenced nodes that will be updated
		 * in the benchmark tests.
		 */
		const setup = async (unrefNodeCount: number) => {
			garbageCollector = createGarbageCollector({ inactiveTimeoutMs });

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
