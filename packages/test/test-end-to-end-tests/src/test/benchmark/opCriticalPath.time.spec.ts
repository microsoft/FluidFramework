/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { benchmark, Phase } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		enableGroupedBatching: true,
		summaryOptions: {
			initialSummarizerDelayMs: 0, // back-compat - Old runtime takes 5 seconds to start summarizer without thi
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{ maxOps: 10, initialSummarizerDelayMs: 0, minIdleTime: 10, maxIdleTime: 10 },
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

		const before = async () => {
			provider = getTestObjectProvider();
			const loader = provider.makeTestLoader(testContainerConfig);
			mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

			await mainContainer.attach(provider.driver.createCreateNewRequest());
			defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			containerRuntime = defaultDataStore._context
				.containerRuntime as ContainerRuntime_WithPrivates;

			defaultDataStore._root.set("force", "write connection");
			await provider.ensureSynchronized();
		};
		function sendOps(label: string) {
			Array.from({ length: 100 }).forEach((_, i) => {
				defaultDataStore._root.set(`key-${i}`, `value-${label}`);
			});

			containerRuntime.flush();
		}

		benchmark({
			title: "Submit+Flush",
			before, // Set up container for a write connection
			benchmarkFnAsync: async () => {
				sendOps("A");
				const opsSent = await timeoutPromise<number>(
					(resolve) => {
						containerRuntime.deltaManager.outbound.once("idle", resolve);
					},
					{ errorMsg: "container2 outbound queue never reached idle state" },
				);
				assert(opsSent > 0, "Expecting op(s) to be sent.");
			},
		});
	},
);

//* ONLY
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

		const before = async () => {
			provider = getTestObjectProvider();
			const loader = provider.makeTestLoader(testContainerConfig);
			mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);

			await mainContainer.attach(provider.driver.createCreateNewRequest());
			defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			containerRuntime = defaultDataStore._context
				.containerRuntime as ContainerRuntime_WithPrivates;

			defaultDataStore._root.set("force", "write connection");
			await provider.ensureSynchronized();
		};

		function sendOps(label: string) {
			Array.from({ length: 100 }).forEach((_, i) => {
				defaultDataStore._root.set(`key-${i}`, `value-${label}`);
			});

			containerRuntime.flush();
		}

		benchmark({
			title: "Roundtrip",
			startPhase: Phase.CollectData, // This will keep it at 1 iteration per batch, so beforeEachBatch runs before each iteration
			before, // Set up container for a write connection
			beforeEachBatch: () => {
				// DANGER: This really should be awaited.
				containerRuntime.deltaManager.inbound.pause().catch(() => {});
				sendOps("B");
			},
			benchmarkFnAsync: async () => {
				// This will resume the inbound queue and wait for the ops to come back.
				// Since beforeEachBatch is not async, we will likely be measuring
				// some of the sequencing time from the local server here too, unfortunately.
				containerRuntime.deltaManager.inbound.resume();
				await provider.ensureSynchronized();
			},
		});
	},
);
