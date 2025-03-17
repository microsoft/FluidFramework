/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { benchmark, Phase, type BenchmarkTimingOptions } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	CompressionAlgorithms,
	ContainerRuntime,
} from "@fluidframework/container-runtime/internal";
import {
	toIDeltaManagerFull,
	ITestContainerConfig,
	ITestObjectProvider,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

export const ___x = Phase;

// NOTE: Changing this will rename the benchmark which will create a new chart on the dashboard
const batchSize: number = 1000;

/**
 * Key configurations:
 * - Grouped Batching: ON  (this is the default and a critical part of submitting a batch)
 * - Compression/Chunking: OFF (these don't always run anyway, based on content size, and should be profiled separately)
 * - Summarization: OFF (irrelevant, and can cause interference)
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

type Patch<T, U> = Omit<T, keyof U> & U;

type ContainerRuntime_WithPrivates = Patch<ContainerRuntime, { flush: () => void }>;

describeCompat(
	"Op Critical Paths - runtime benchmarks",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let defaultDataStore: ITestDataObject;
		let containerRuntime: ContainerRuntime_WithPrivates;

		let testId = 0;

		const setup = async () => {
			testId++;
			provider = getTestObjectProvider();
			const loader = provider.makeTestLoader(testContainerConfig);
			mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

			await mainContainer.attach(provider.driver.createCreateNewRequest(`test-${testId}`));
			defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			containerRuntime = defaultDataStore._context
				.containerRuntime as ContainerRuntime_WithPrivates;

			defaultDataStore._root.set("force", "write connection");
			await provider.ensureSynchronized();
		};

		const executionOptions: BenchmarkTimingOptions = {
			minBatchDurationSeconds: 0, // This ensures we only run one iteration per batch. These operations are slow enough that 1 iteration can be measured alone.
			minBatchCount: 100, // Since we're only running one iteration per batch, we need to run a lot of batches to get a good sample (even if it takes longer than default 5s)
		};

		function sendOps(label: string) {
			Array.from({ length: batchSize }).forEach((_, i) => {
				defaultDataStore._root.set(`key-${i}-${label}`, `value-${label}`);
			});

			containerRuntime.flush();
		}

		benchmark({
			title: `Submit+Flush a single batch of ${batchSize} ops`,
			...executionOptions, // We could use the defaults for this one, but this way the measurement is symmetrical with the "Process" benchmark below.
			before: async () => {
				await setup();
			},
			benchmarkFnAsync: async () => {
				sendOps("A");
				// There's no event fired for "flush" so the simplest thing is to wait for the outbound queue to be idle.
				// This should not add much time, and is part of the real flow so it's ok to include it in the benchmark.
				const opsSent = await timeoutPromise<number>(
					(resolve) => {
						toIDeltaManagerFull(containerRuntime.deltaManager).outbound.once("idle", resolve);
					},
					{ errorMsg: "container's outbound queue never reached idle state" },
				);
				assert(opsSent === 1, "Expecting the single grouped batch op to be sent.");
			},
		});

		benchmark({
			title: `Process a single batch of ${batchSize} Inbound ops (local)`,
			...executionOptions,
			async benchmarkFnCustom(state): Promise<void> {
				let running = true;
				let batchId = 0;
				do {
					await setup();

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
	},
);
