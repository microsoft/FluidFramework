/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import {
	ContainerErrorTypes,
	IContainer,
} from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { ISharedCounter, SharedCounter } from "@fluidframework/counter/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

const counterId = "counterKey";

describeCompat("SharedCounter", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedCounter } = apis.dds;

	const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});
	let dataStore1: ITestFluidObject;
	let sharedCounter1: ISharedCounter;
	let sharedCounter2: ISharedCounter;
	let sharedCounter3: ISharedCounter;

	beforeEach("setup", async () => {
		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataStore1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedCounter1 = await dataStore1.getSharedObject<SharedCounter>(counterId);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedCounter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);

		// Load the Container that was created by the first client.
		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataStore3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);
		sharedCounter3 = await dataStore3.getSharedObject<SharedCounter>(counterId);

		await provider.ensureSynchronized();
	});

	function verifyCounterValue(counter: ISharedCounter, expectedValue, index: number) {
		const userValue = counter.value;
		assert.equal(
			userValue,
			expectedValue,
			`Incorrect value ${userValue} instead of ${expectedValue} in container ${index}`,
		);
	}

	function verifyCounterValues(value1, value2, value3) {
		verifyCounterValue(sharedCounter1, value1, 1);
		verifyCounterValue(sharedCounter2, value2, 2);
		verifyCounterValue(sharedCounter3, value3, 3);
	}

	describe("constructor", () => {
		it("can create the counter in 3 containers correctly", async () => {
			// SharedCounter was created in beforeEach
			assert.ok(
				sharedCounter1,
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Couldn't find the counter in container1, instead got ${sharedCounter1}`,
			);
			assert.ok(
				sharedCounter2,
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Couldn't find the counter in container2, instead got ${sharedCounter2}`,
			);
			assert.ok(
				sharedCounter3,
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Couldn't find the counter in container3, instead got ${sharedCounter3}`,
			);
		});
	});

	describe("usage", () => {
		it("can get the value in 3 containers correctly", async () => {
			// SharedCounter was created in beforeEach
			verifyCounterValues(0, 0, 0);
		});

		it("can increment and decrement the value in 3 containers correctly", async () => {
			sharedCounter2.increment(7);
			await provider.ensureSynchronized();
			verifyCounterValues(7, 7, 7);
			sharedCounter3.increment(-20);
			await provider.ensureSynchronized();
			verifyCounterValues(-13, -13, -13);
		});

		it("fires incremented events in 3 containers correctly", async function () {
			const incrementSteps: { incrementer: ISharedCounter; incrementAmount: number }[] = [
				{ incrementer: sharedCounter3, incrementAmount: -1 },
				{ incrementer: sharedCounter1, incrementAmount: 3 },
				{ incrementer: sharedCounter2, incrementAmount: 10 },
				{ incrementer: sharedCounter1, incrementAmount: -9 },
				{ incrementer: sharedCounter2, incrementAmount: 4 },
			];

			let expectedEventCount = 0;
			let expectedValue = 0;

			let eventCount1 = 0;
			let eventCount2 = 0;
			let eventCount3 = 0;

			sharedCounter1.on("incremented", (incrementAmount: number, newValue: number) => {
				assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
				assert.equal(newValue, expectedValue);
				eventCount1++;
			});
			sharedCounter2.on("incremented", (incrementAmount: number, newValue: number) => {
				assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
				assert.equal(newValue, expectedValue);
				eventCount2++;
			});
			sharedCounter3.on("incremented", (incrementAmount: number, newValue: number) => {
				assert.equal(incrementAmount, incrementSteps[0].incrementAmount);
				assert.equal(newValue, expectedValue);
				eventCount3++;
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
				assert.equal(eventCount3, expectedEventCount);

				// counter value is updated correctly
				verifyCounterValues(expectedValue, expectedValue, expectedValue);

				// done with this step
				incrementSteps.shift();
			}
		});
	});
});

describeCompat(
	"SharedCounter orderSequentially",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedCounter } = apis.dds;

		const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};

		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		let container: IContainer;
		let dataObject: ITestFluidObject;
		let dataStore: ITestFluidObject;
		let sharedCounter: SharedCounter;
		let containerRuntime: ContainerRuntime;

		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		const errorMessage = "callback failure";

		beforeEach("setup", async () => {
			const configWithFeatureGates = {
				...testContainerConfig,
				loaderProps: {
					configProvider: configProvider({
						"Fluid.ContainerRuntime.EnableRollback": true,
					}),
				},
			};
			container = await provider.makeTestContainer(configWithFeatureGates);
			dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
			dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
			sharedCounter = await dataStore.getSharedObject<SharedCounter>(counterId);
			containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;
		});

		itExpects(
			"Closes container when rollback fails",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "RollbackError: rollback not supported",
					errorType: ContainerErrorTypes.dataProcessingError,
				},
			],
			async () => {
				let error: Error | undefined;
				try {
					containerRuntime.orderSequentially(() => {
						sharedCounter.increment(1);
						throw new Error(errorMessage);
					});
				} catch (err) {
					error = err as Error;
				}

				assert.notEqual(error, undefined, "No error");
				assert.ok(error?.message.startsWith("RollbackError:"), "Unexpected error message");
				assert.equal(container.closed, true);
			},
		);
	},
);
