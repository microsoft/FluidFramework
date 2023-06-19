/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { SharedString } from "@fluidframework/sequence";
import { IContainer } from "@fluidframework/container-definitions";
import { IMergeTreeInsertMsg } from "@fluidframework/merge-tree";
import { FlushMode } from "@fluidframework/runtime-definitions";

describeNoCompat("Concurrent op processing via DDS event handlers", (getTestObjectProvider) => {
	const mapId = "mapKey";
	const sharedStringId = "sharedStringKey";
	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[sharedStringId, SharedString.getFactory()],
	];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};
	let provider: ITestObjectProvider;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedMap1: SharedMap;
	let sharedMap2: SharedMap;
	let sharedString1: SharedString;
	let sharedString2: SharedString;

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	const setupContainers = async (
		containerConfig: ITestContainerConfig,
		featureGates: Record<string, ConfigTypes> = {},
	) => {
		const configWithFeatureGates = {
			// AB#3986 track work to removing this exception using simulateReadConnectionUsingDelay
			simulateReadConnectionUsingDelay: false,
			...containerConfig,
			loaderProps: { configProvider: configProvider(featureGates) },
		};
		container1 = await provider.makeTestContainer(configWithFeatureGates);
		container2 = await provider.loadTestContainer(configWithFeatureGates);

		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

		sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);
		sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		sharedString1 = await dataObject1.getSharedObject<SharedString>(sharedStringId);
		sharedString2 = await dataObject2.getSharedObject<SharedString>(sharedStringId);

		await provider.ensureSynchronized();
	};

	itExpects(
		"Should close the container when submitting an op while processing a batch",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Op was submitted from within a `ensureNoDataModelChanges` callback",
			},
		],
		async () => {
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					enableOpReentryCheck: true,
				},
			});

			sharedMap1.on("valueChanged", (changed) => {
				if (changed.key !== "key2") {
					sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
				}
			});

			assert.throws(() => {
				sharedMap1.set("key1", "1");
			});

			sharedMap2.set("key2", "2");
			await provider.ensureSynchronized();

			// The offending container is closed
			assert.ok(container1.closed);

			// The other container is fine
			assert.equal(sharedMap2.get("key1"), undefined);
			assert.equal(sharedMap2.get("key2"), "2");
		},
	);

	describe("Reentry safeguards", () => {
		it("Deep recursion is not supported", async () => {
			await setupContainers(testContainerConfig);

			sharedString1.on("sequenceDelta", () => {
				sharedString1.insertText(0, "x");
			});
			assert.throws(() => sharedString1.insertText(0, "ad"));
			await provider.ensureSynchronized();
		});

		it("Deep recursion is not supported, two clients, two data structures", async () => {
			await setupContainers(testContainerConfig);

			sharedString1.on("sequenceDelta", () => {
				sharedMap2.set("0", 1);
			});
			sharedMap2.on("valueChanged", () => {
				sharedString1.insertText(0, "x");
			});

			assert.throws(() => sharedString1.insertText(0, "ad"));
			await provider.ensureSynchronized();
		});

		itExpects(
			"Flushing is not supported",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Flushing is not supported inside DDS event handlers",
				},
			],
			async () => {
				await setupContainers({
					...testContainerConfig,
					runtimeOptions: {
						flushMode: FlushMode.Immediate,
					},
				});

				sharedString1.on("sequenceDelta", () =>
					assert.throws(() =>
						dataObject1.context.containerRuntime.orderSequentially(() =>
							sharedMap1.set("0", 1),
						),
					),
				);

				assert.throws(() => sharedString1.insertText(0, "ad"));
				await provider.ensureSynchronized();
			},
		);
	});

	it("Should throw when submitting an op while handling an event - offline", async () => {
		await setupContainers({
			...testContainerConfig,
			runtimeOptions: {
				enableOpReentryCheck: true,
			},
		});

		await container1.deltaManager.inbound.pause();
		await container1.deltaManager.outbound.pause();

		sharedMap1.on("valueChanged", (changed) => {
			if (changed.key !== "key2") {
				sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
			}
		});

		assert.throws(() => {
			sharedMap1.set("key1", "1");
		});

		container1.deltaManager.inbound.resume();
		container1.deltaManager.outbound.resume();

		// The offending container is not closed
		assert.ok(!container1.closed);
	});

	describe("Allow reentry", () =>
		[
			{
				options: testContainerConfig,
				featureGates: {},
				name: "Default config and feature gates",
			},
			{
				options: {
					...testContainerConfig,
					runtimeOptions: {
						enableOpReentryCheck: true,
					},
				},
				featureGates: { "Fluid.ContainerRuntime.DisableOpReentryCheck": true },
				name: "Enabled by options, disabled by feature gate",
			},
		].forEach((testConfig) => {
			it(`Should not close the container when submitting an op while processing a batch [${testConfig.name}]`, async () => {
				await setupContainers(testConfig.options, testConfig.featureGates);

				sharedMap1.on("valueChanged", (changed) => {
					if (changed.key !== "key2") {
						sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
					}
				});

				const outOfOrderObservations: string[] = [];
				sharedMap1.on("valueChanged", (changed) => {
					outOfOrderObservations.push(changed.key);
				});

				sharedMap1.set("key1", "1");
				sharedMap2.set("key2", "2");
				await provider.ensureSynchronized();

				// The offending container is not closed
				assert.ok(!container1.closed);
				assert.equal(sharedMap1.get("key2"), "1 updated");

				// The other container is also fine
				assert.equal(sharedMap2.get("key1"), "1");
				assert.equal(sharedMap2.get("key2"), "1 updated");

				// The second event handler didn't receive the events in the actual order of changes
				assert.deepEqual(outOfOrderObservations, ["key2", "key1"]);
			});

			it(`Should not throw when submitting an op while processing a batch - offline [${testConfig.name}]`, async () => {
				await setupContainers(
					{
						...testContainerConfig,
						runtimeOptions: {
							enableOpReentryCheck: true,
						},
					},
					{ "Fluid.ContainerRuntime.DisableOpReentryCheck": true },
				);

				await container1.deltaManager.inbound.pause();
				await container1.deltaManager.outbound.pause();

				sharedMap1.on("valueChanged", (changed) => {
					if (changed.key !== "key2") {
						sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
					}
				});

				const outOfOrderObservations: string[] = [];
				sharedMap1.on("valueChanged", (changed) => {
					outOfOrderObservations.push(changed.key);
				});

				sharedMap1.set("key1", "1");

				container1.deltaManager.inbound.resume();
				container1.deltaManager.outbound.resume();

				// The offending container is not closed
				assert.ok(!container1.closed);

				// The second event handler didn't receive the events in the actual order of changes
				assert.deepEqual(outOfOrderObservations, ["key2", "key1"]);
			});
		}));
});
