/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import { benchmark } from "@fluid-tools/benchmark";
import type { FluidObject } from "@fluidframework/core-interfaces";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

const counterId = "counterKey";
const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeCompat("SharedCounter - runtime benchmarks", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const counters: ISharedCounter[] = [];

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();

		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const maybeTestFluidObject: FluidObject<ITestFluidObject> | undefined =
			await container1.getEntryPoint();
		const dataStore1 = maybeTestFluidObject.ITestFluidObject;
		assert(dataStore1 !== undefined, "dataStore1 not a ITestFluidObject");
		counters[0] = await dataStore1.getSharedObject<SharedCounter>(counterId);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const maybeTestFluidObject2: FluidObject<ITestFluidObject> | undefined =
			await container2.getEntryPoint();
		const dataStore2 = maybeTestFluidObject2.ITestFluidObject;
		assert(dataStore2 !== undefined, "dataStore2 not a ITestFluidObject");
		counters[1] = await dataStore2.getSharedObject<SharedCounter>(counterId);

		// Load the Container that was created by the first client.
		const container3 = await provider.loadTestContainer(testContainerConfig);
		const maybeTestFluidObject3: FluidObject<ITestFluidObject> | undefined =
			await container3.getEntryPoint();
		const dataStore3 = maybeTestFluidObject3.ITestFluidObject;
		assert(dataStore3 !== undefined, "dataStore3 not a ITestFluidObject");
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
