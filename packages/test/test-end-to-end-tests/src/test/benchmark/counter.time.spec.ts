/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-private/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";

const counterId = "counterKey";
const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeNoCompat("SharedCounter - runtime benchmarks", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const counters: ISharedCounter[] = [];

	beforeEach(async () => {
		provider = getTestObjectProvider();

		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		counters[0] = await dataStore1.getSharedObject<SharedCounter>(counterId);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		counters[1] = await dataStore2.getSharedObject<SharedCounter>(counterId);

		// Load the Container that was created by the first client.
		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		counters[2] = await dataStore3.getSharedObject<SharedCounter>(counterId);

		await provider.ensureSynchronized();
	});

	benchmark({
		title: "increment value in 3 containers",
		benchmarkFnAsync: async () => {
			counters[0].increment(1);
			await provider.ensureSynchronized();
			// Something in the way the benchmark tool works makes it so we can't try to verify values;
			// the check might pass the first time, but at some point during the samples/iterations the
			// validation will fail and we'll see a (supposedly) successful test but an exit status 1.
		},
	});
});
