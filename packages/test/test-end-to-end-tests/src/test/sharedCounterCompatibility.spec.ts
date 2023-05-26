/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import {
	ITestFluidObject,
	ChannelFactoryRegistry,
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
} from "@fluidframework/test-utils";
import {
	describeInstallVersions,
	getContainerRuntimeApi,
	getDataRuntimeApi,
} from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { FlushMode, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { IRequest } from "@fluidframework/core-interfaces";

const previousClientVersion = "1.3.6";

describeInstallVersions(
	{
		requestAbsoluteVersions: [previousClientVersion],
	},
	/* timeoutMs: 3 minutes */ 180000,
)("SharedCounter Version Compatibility", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let oldCounter: ISharedCounter;
	let newCounter: ISharedCounter;
	beforeEach(async () => {
		provider = getTestObjectProvider();
	});
	afterEach(async () => provider.reset());

	const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
		runtime.IFluidHandleContext.resolveHandle(request);
	const counterId = "counterKey";
	const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	/**
	 * Create a container with old version of container runtime and data store runtime.
	 */
	const createOldContainer = async (): Promise<IContainer> => {
		const oldDataRuntimeApi = getDataRuntimeApi(previousClientVersion);
		const oldDataObjectFactory = new oldDataRuntimeApi.TestFluidObjectFactory(
			[[counterId, oldDataRuntimeApi.dds.SharedCounter.getFactory()]],
			"default",
		);

		const ContainerRuntimeFactoryWithDefaultDataStore_Old =
			getContainerRuntimeApi(
				previousClientVersion,
			).ContainerRuntimeFactoryWithDefaultDataStore;
		const oldRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore_Old(
			oldDataObjectFactory,
			[[oldDataObjectFactory.type, Promise.resolve(oldDataObjectFactory)]],
			undefined,
			[innerRequestHandler],
			{
				flushMode: FlushMode.Immediate,
				gcOptions: {
					gcAllowed: true,
				},
			},
		);

		return provider.createContainer(oldRuntimeFactory);
	};

	const setupContainers = async () => {
		const oldContainer = await createOldContainer();
		const oldDataObject = await requestFluidObject<ITestFluidObject>(oldContainer, "default");
		oldCounter = await oldDataObject.getSharedObject<SharedCounter>(counterId);

		const containerOnLatest = await provider.loadTestContainer(testContainerConfig);
		const newDataObject = await requestFluidObject<ITestFluidObject>(
			containerOnLatest,
			"default",
		);
		newCounter = await newDataObject.getSharedObject<SharedCounter>(counterId);

		await provider.ensureSynchronized();
	};

	function verifyCounterValue(counter: ISharedCounter, expectedValue, versionType: string) {
		const userValue = counter.value;
		assert.equal(
			userValue,
			expectedValue,
			`Incorrect value ${userValue} instead of ${expectedValue} in ${versionType} container`,
		);
	}

	function verifyCounterValues(value1, value2) {
		verifyCounterValue(oldCounter, value1, "old");
		verifyCounterValue(newCounter, value2, "new");
	}

	it("can create the counter in both containers correctly", async () => {
		await setupContainers().then(() => {
			assert.ok(
				oldCounter,
				`Couldn't find the counter in oldContainer, instead got ${oldCounter}`,
			);
			assert.ok(
				newCounter,
				`Couldn't find the counter in newContainer, instead got ${newCounter}`,
			);
		});
	});

	it("can get the value in both containers correctly", async () => {
		await setupContainers();
		verifyCounterValues(0, 0);
	});

	it("can increment and decrement the value in both containers correctly", async () => {
		await setupContainers();
		oldCounter.increment(7);
		await provider.ensureSynchronized();
		verifyCounterValues(7, 7);
		newCounter.increment(-20);
		await provider.ensureSynchronized();
		verifyCounterValues(-13, -13);
	});

	it("fires incremented events in both containers correctly", async function () {
		await setupContainers();
		const incrementSteps: { incrementer: ISharedCounter; incrementAmount: number }[] = [
			{ incrementer: oldCounter, incrementAmount: -1 },
			{ incrementer: oldCounter, incrementAmount: 3 },
			{ incrementer: newCounter, incrementAmount: 10 },
			{ incrementer: oldCounter, incrementAmount: -9 },
			{ incrementer: newCounter, incrementAmount: 4 },
		];

		let expectedEventCount = 0;
		let expectedValue = 0;

		let eventCount1 = 0;
		let eventCount2 = 0;

		oldCounter.on("incremented", (incrementAmount: number, newValue: number) => {
			assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
			assert.equal(newValue, expectedValue);
			eventCount1++;
		});
		newCounter.on("incremented", (incrementAmount: number, newValue: number) => {
			assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
			assert.equal(newValue, expectedValue);
			eventCount2++;
		});

		while (incrementSteps.length > 0) {
			// set up for next increment, incrementSteps[0] holds the in-progress step
			const { incrementer, incrementAmount } = incrementSteps[0];
			expectedEventCount++;
			expectedValue += incrementAmount;

			// do the increment
			incrementer.increment(incrementAmount);
			await provider.ensureSynchronized();

			// event count is correct
			assert.equal(eventCount1, expectedEventCount);
			assert.equal(eventCount2, expectedEventCount);

			// counter value is updated correctly
			verifyCounterValues(expectedValue, expectedValue);

			// done with this step
			incrementSteps.shift();
		}
	});
});
