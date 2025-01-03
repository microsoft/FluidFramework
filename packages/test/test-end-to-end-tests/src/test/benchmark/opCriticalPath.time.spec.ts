/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { benchmark, Phase, type BenchmarkTimingOptions } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import {
	toIDeltaManagerFull,
	ITestContainerConfig,
	ITestObjectProvider,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

export const ___x = Phase;

const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		enableGroupedBatching: true,
		chunkSizeInBytes: 1024 * 1024 * 1024,
		summaryOptions: {
			initialSummarizerDelayMs: 0, // back-compat - Old runtime takes 5 seconds to start summarizer without thi
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	},
};

type Patch<T, U> = Omit<T, keyof U> & U;

type ContainerRuntime_WithPrivates = Patch<ContainerRuntime, { flush: () => void }>;

//* ONLY
//* ONLY
//* ONLY
//* ONLY
//* ONLY
describeCompat.only(
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
			//* startPhase: Phase.CollectData, // This ensures we only run one iteration per batch, so beforeEachBatch becomes beforeEach
			//* 50 enough? 100?
			minBatchCount: 50, // Since we're only running one iteration per batch, we need to run a lot of batches to get a good sample
			//* maxBenchmarkDurationSeconds: 0,
			minBatchDurationSeconds: 0,
		};

		function sendOps(label: string) {
			Array.from({ length: 2000 }).forEach((_, i) => {
				defaultDataStore._root.set(`key-${i}-${label}`, `value-${label}`);
			});

			containerRuntime.flush();
		}

		benchmark({
			//* only: true, //*
			title: "Submit+Flush",
			...executionOptions,
			benchmarkFnAsync: async () => {
				sendOps("A");
				const opsSent = await timeoutPromise<number>(
					(resolve) => {
						toIDeltaManagerFull(containerRuntime.deltaManager).outbound.once("idle", resolve);
					},
					{ errorMsg: "container's outbound queue never reached idle state" },
				);
				assert(opsSent > 0, "Expecting op(s) to be sent (likely multiple chunked ops).");
			},
		});

		benchmark({
			only: true, //*
			title: "Process 2000 Inbound ops (local)",
			...executionOptions,
			async benchmarkFnCustom(state): Promise<void> {
				let running = true;
				let batchId = 0;
				do {
					await setup();

					//* Let it calibrate this...??
					assert(state.iterationsPerBatch === 1, "Expecting only one iteration per batch");

					// This will get the ops to the server, but the inbound queue will remain paused
					await provider.opProcessingController.pauseProcessing();
					sendOps(`[Batch-${batchId++}]`);
					await provider.opProcessingController.processOutgoing();

					// Measure how long it takes to process the ops when they roundtrip
					const start = state.timer.now();
					await provider.opProcessingController.processIncoming();
					const end = state.timer.now();

					// Record the result
					const duration = state.timer.toSeconds(start, end);
					running = state.recordBatch(duration);

					mainContainer.dispose();
				} while (running);
			},
			//* IMPORTANT - Must add await to doBatchAsync in dist/runBenchmark.js
			// beforeEachBatchX: (async () => {
			// 	await toIDeltaManagerFull(containerRuntime.deltaManager).inbound.pause();
			// 	sendOps("B");
			// 	const opsSent = await timeoutPromise<number>(
			// 		(resolve) => {
			// 			toIDeltaManagerFull(containerRuntime.deltaManager).outbound.once("idle", resolve);
			// 		},
			// 		{ errorMsg: "container's outbound queue never reached idle state" },
			// 	);
			// 	assert(opsSent > 0, "Expecting op(s) to be sent (likely multiple chunked ops).");
			// }) as any, //* Until new benchmark pkg release
			// benchmarkFnAsyncX: async () => {
			// 	toIDeltaManagerFull(containerRuntime.deltaManager).inbound.resume();
			// 	await provider.ensureSynchronized();
			// },
		});

		//*
		// benchmark({
		// 	title: "Roundtrip (includes local server sequencing time)",
		// 	...executionOptions,
		// 	benchmarkFnAsync: async () => {
		// 		sendOps("B");
		// 		await provider.ensureSynchronized();
		// 	},
		// });
	},
);

describeCompat(
	"Op Critical Paths - for investigating curious benchmark interference",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let defaultDataStore: ITestDataObject;
		let containerRuntime: ContainerRuntime_WithPrivates;

		before(async () => {
			provider = getTestObjectProvider();
			const loader = provider.makeTestLoader(testContainerConfig);
			mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

			await mainContainer.attach(provider.driver.createCreateNewRequest());
			defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			containerRuntime = defaultDataStore._context
				.containerRuntime as ContainerRuntime_WithPrivates;

			defaultDataStore._root.set("force", "write connection");
			await provider.ensureSynchronized();
		});

		function sendOps(label: string) {
			Array.from({ length: 100 }).forEach((_, i) => {
				defaultDataStore._root.set(`key-${i}`, `value-${label}`);
			});

			containerRuntime.flush();
		}

		benchmark({
			title: "Roundtrip - Alone in describe block - takes 10x longer!",
			benchmarkFnAsync: async () => {
				sendOps("B");
				await provider.ensureSynchronized();
			},
		});
	},
);
