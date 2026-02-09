/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { benchmark, type BenchmarkTimingOptions } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	CompressionAlgorithms,
	ContainerRuntime,
} from "@fluidframework/container-runtime/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

// NOTE: Changing this will rename the benchmark which will create a new chart on the dashboard
const batchSize: number = 1000;

/**
 * Number of batches to process during setup to populate the DuplicateBatchDetector's tracked batch IDs.
 * This simulates a scenario where many batches are tracked (e.g., high-latency network conditions where MSN lags behind).
 * The goal is to measure the overhead of batch ID tracking when there are many tracked batches.
 *
 * Note: Values above ~150 may cause issues due to timing/backpressure interactions with the local driver.
 */
const trackedBatchCount: number = 100;

/**
 * Key configurations:
 * - Grouped Batching: ON  (this is the default and a critical part of submitting a batch)
 * - Compression/Chunking: OFF (these don't always run anyway, based on content size, and should be profiled separately)
 * - Summarization: OFF (irrelevant, and can cause interference)
 * - MaxConsecutiveReconnects: Infinity (disable reconnection limit for benchmark stability)
 */
const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		enableGroupedBatching: true,
		compressionOptions: {
			minimumBatchSizeInBytes: Infinity,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		},
		chunkSizeInBytes: 1024 * 1024 * 1024,
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	},
};

/**
 * Same as testContainerConfig but with batch ID tracking enabled
 */
const testContainerConfigWithBatchIdTracking: ITestContainerConfig = {
	...testContainerConfig,
	loaderProps: {
		configProvider: {
			getRawConfig: (name: string) => {
				if (name === "Fluid.ContainerRuntime.enableBatchIdTracking") {
					return true;
				}
				return undefined;
			},
		},
	},
};

type Patch<T, U> = Omit<T, keyof U> & U;

/**
 * Interface for accessing the private DuplicateBatchDetector from ContainerRuntime for testing purposes.
 */
interface IDuplicateBatchDetectorForTesting {
	getRecentBatchInfoForSummary(): [number, string][] | undefined;
}

type ContainerRuntime_WithPrivates = Patch<
	ContainerRuntime,
	{
		flush: () => void;
		readonly duplicateBatchDetector: IDuplicateBatchDetectorForTesting | undefined;
	}
>;

/**
 * This benchmark specifically measures the overhead of batch ID tracking when there are many tracked batches.
 * The DuplicateBatchDetector's clearOldBatchIds iterates over all tracked batch IDs, so having many tracked
 * batches could slow down op processing. This test pre-populates the detector with many batches during setup.
 * Running with and without batch ID tracking allows comparing the overhead.
 */
describeCompat(
	"Batch ID Tracking - runtime benchmarks",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let defaultDataStore: ITestDataObject;
		let containerRuntime: ContainerRuntime_WithPrivates;

		let testId = 0;

		beforeEach("check driver compatibility", function () {
			provider = getTestObjectProvider();
			if (provider.driver.type === "r11s" || provider.driver.type === "routerlicious") {
				this.skip(); // This test triggers 504 errors on AFR occasionally. The test intentionally ignores server interactions anyway.
			}
		});

		const setup = async (config: ITestContainerConfig): Promise<void> => {
			testId++;
			provider = getTestObjectProvider();
			const loader = provider.makeTestLoader(config);
			mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

			await mainContainer.attach(provider.driver.createCreateNewRequest(`test-${testId}`));
			defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			containerRuntime = defaultDataStore._context
				.containerRuntime as ContainerRuntime_WithPrivates;

			defaultDataStore._root.set("force", "write connection");
			await provider.ensureSynchronized();
		};

		/**
		 * Setup function that also pre-populates the DuplicateBatchDetector with many tracked batch IDs.
		 * This is achieved by processing many batches, which will be tracked by the detector.
		 *
		 * Note: With only one container, the MSN advances with each batch we process, which will clear
		 * older tracked batch IDs. To maintain many tracked batches, we need a second container that
		 * doesn't process inbound ops. However, this is complex with the local driver, so we accept
		 * that we may not retain all tracked batches.
		 *
		 * @param config - The test container config to use
		 * @param expectBatchIdTracking - Whether batch ID tracking is expected to be enabled
		 */
		const setupWithTrackedBatches = async (
			config: ITestContainerConfig,
			expectBatchIdTracking: boolean,
		): Promise<void> => {
			await setup(config);

			// Verify the DuplicateBatchDetector state matches expectations
			if (expectBatchIdTracking) {
				assert(
					containerRuntime.duplicateBatchDetector !== undefined,
					"DuplicateBatchDetector should exist when batch ID tracking is enabled",
				);
			} else {
				assert(
					containerRuntime.duplicateBatchDetector === undefined,
					"DuplicateBatchDetector should not exist when batch ID tracking is disabled",
				);
			}

			// Verify starting state - should have no tracked batches yet (or just 1 from the "force write" op)
			if (expectBatchIdTracking) {
				const detector = containerRuntime.duplicateBatchDetector;
				assert(detector !== undefined, "DuplicateBatchDetector should exist");
				const initialBatchInfo = detector.getRecentBatchInfoForSummary();
				const initialTrackedCount = initialBatchInfo?.length ?? 0;
				assert(
					initialTrackedCount <= 1,
					`Expected at most 1 tracked batch initially, got ${initialTrackedCount}`,
				);
			}

			// Process many batches to populate the DuplicateBatchDetector's tracked batch IDs.
			// Each batch is a single op to minimize setup time while maximizing tracked batch count.
			// We process in chunks to avoid backpressure issues with the local driver when sending many ops at once.
			const chunkSize = 50;

			for (let chunk = 0; chunk < trackedBatchCount; chunk += chunkSize) {
				const chunkEnd = Math.min(chunk + chunkSize, trackedBatchCount);

				// Send ops in this chunk
				for (let i = chunk; i < chunkEnd; i++) {
					defaultDataStore._root.set(`setup-key-${i}`, `setup-value-${i}`);
					containerRuntime.flush();
				}

				// Wait for all ops to be fully synchronized
				await provider.ensureSynchronized();
			}

			// With a single container, MSN advances and clears tracked batches.
			// We still verify the setup worked by checking we have at least some tracked batches.
			if (expectBatchIdTracking) {
				const detector = containerRuntime.duplicateBatchDetector;
				assert(detector !== undefined, "DuplicateBatchDetector should exist");
				const finalBatchInfo = detector.getRecentBatchInfoForSummary();
				const finalTrackedCount = finalBatchInfo?.length ?? -1;
				const lastSeqNum = mainContainer.deltaManager.lastSequenceNumber;
				const msn = mainContainer.deltaManager.minimumSequenceNumber;
				// With a single container, MSN = lastSeqNum, so we may not retain all batches.
				// Just verify the detector is working (has at least 1 tracked batch from the last chunk).
				assert(
					finalTrackedCount >= 1,
					`Expected at least 1 tracked batch after setup, got ${finalTrackedCount}. ` +
						`lastSeqNum=${lastSeqNum}, MSN=${msn}.`,
				);
			}
		};

		const executionOptions: BenchmarkTimingOptions = {
			minBatchDurationSeconds: 0, // This ensures we only run one iteration per batch. These operations are slow enough that 1 iteration can be measured alone.
			minBatchCount: 1,
		};

		function sendOps(label: string): void {
			Array.from({ length: batchSize }).forEach((_, i) => {
				defaultDataStore._root.set(`key-${i}-${label}`, `value-${label}`);
			});

			containerRuntime.flush();
		}

		const configs: { name: string; config: ITestContainerConfig }[] = [
			{ name: "without batch ID tracking", config: testContainerConfig },
			{ name: "with batch ID tracking", config: testContainerConfigWithBatchIdTracking },
		];

		for (const { name, config } of configs) {
			const expectBatchIdTracking = config === testContainerConfigWithBatchIdTracking;
			benchmark({
				title: `Process a single batch of ${batchSize} Inbound ops (local, with ${trackedBatchCount} tracked batches, ${name})`,

				...executionOptions,
				async benchmarkFnCustom(state): Promise<void> {
					let running = true;
					let batchId = 0;
					do {
						await setupWithTrackedBatches(config, expectBatchIdTracking);

						// (This is about benchmark's "batch", not the batch of ops we are measuring)
						assert(state.iterationsPerBatch === 1, "Expecting only one iteration per batch");

						// This will get the batch of ops roundtripped and into the inbound queue, but the inbound queue will remain paused
						await provider.opProcessingController.pauseProcessing();
						sendOps(`[Batch-${batchId++}]`);
						await provider.opProcessingController.processOutgoing();

						// Now process the batch of ops that's sitting in the inbound queue.
						// This is the precise duration we want to measure.
						const start = state.timer.now();
						// Note that process is synchronous, but this waits for the queue to become idle so it's async. Shouldn't affect measurement though.
						await provider.opProcessingController.processIncoming();
						const end = state.timer.now();

						// Record the result
						const duration = state.timer.toSeconds(start, end);
						running = state.recordBatch(duration);

						// Tear down this container, we start fresh for each measurement
						mainContainer.dispose();
					} while (running);
				},
			});
		}
	},
);
