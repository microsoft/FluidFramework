/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
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
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";

describeNoCompat("Concurrent op processing via DDS event handlers", (getTestObjectProvider) => {
	const mapId = "mapKey";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};
	let provider: ITestObjectProvider;
	let container1: Container;
	let container2: Container;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedMap1: SharedMap;
	let sharedMap2: SharedMap;

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
			...containerConfig,
			loaderProps: { configProvider: configProvider(featureGates) },
		};
		container1 = (await provider.makeTestContainer(configWithFeatureGates)) as Container;
		container2 = (await provider.loadTestContainer(configWithFeatureGates)) as Container;

		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

		sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);
		sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		await provider.ensureSynchronized();
	};

	itExpects(
		"Should close the container when submitting an op while processing a batch",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Op was submitted from within a `ensureNoDataModelChanges` callback",
			},
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
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

	const allowReentry = [
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
	];

	describe("Allow reentry", () =>
		allowReentry.forEach((testConfig) => {
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
