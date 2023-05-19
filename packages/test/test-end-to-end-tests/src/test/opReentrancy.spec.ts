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
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";

describeNoCompat("Concurrent op processing via DDS event handlers", (getTestObjectProvider) => {
	const mapId = "mapKey";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
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

		await provider.ensureSynchronized();
	};

	it("Ops sent while processing ops will be observed in reverse order although the data model is in sync", async () => {
		await setupContainers(testContainerConfig);
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

		await provider.ensureSynchronized();

		// The offending container is not closed
		assert.ok(!container1.closed);
		assert.equal(sharedMap1.get("key1"), "1");
		assert.equal(sharedMap1.get("key2"), "1 updated");

		// The other container is also fine and in sync
		assert.ok(!container2.closed);
		assert.equal(sharedMap2.get("key1"), "1");
		assert.equal(sharedMap2.get("key2"), "1 updated");

		// The second event handler didn't receive the events in the actual order of changes
		assert.deepEqual(outOfOrderObservations, ["key2", "key1"]);
	});
});
