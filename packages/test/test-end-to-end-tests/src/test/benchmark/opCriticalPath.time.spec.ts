/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import {
	toIDeltaManagerFull,
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

describeCompat(
	"Op Critical Paths - runtime benchmarks",
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
			title: "Submit+Flush",
			benchmarkFnAsync: async () => {
				sendOps("A");
				const opsSent = await timeoutPromise<number>(
					(resolve) => {
						toIDeltaManagerFull(containerRuntime.deltaManager).outbound.once("idle", resolve);
					},
					{ errorMsg: "container2 outbound queue never reached idle state" },
				);
				assert(opsSent > 0, "Expecting op(s) to be sent.");
			},
		});

		benchmark({
			title: "Roundtrip",
			benchmarkFnAsync: async () => {
				sendOps("B");
				await provider.ensureSynchronized();
			},
		});
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
