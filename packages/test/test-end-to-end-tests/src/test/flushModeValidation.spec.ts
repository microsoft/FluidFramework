/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { ISharedMap } from "@fluidframework/map";
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
	ITestFluidObject,
	ChannelFactoryRegistry,
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	waitForContainerConnection,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";

/**
 * This test validates that changing the FlushMode does not hit any validation errors in PendingStateManager.
 * It also validates the scenario in this bug - https://github.com/microsoft/FluidFramework/issues/9398.
 */
describeCompat("Flush mode validation", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const map1Id = "map1Key";
	const registry: ChannelFactoryRegistry = [[map1Id, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	let dataObject1: ITestFluidObject;
	let dataObject1map1: ISharedMap;

	before(function () {
		provider = getTestObjectProvider();
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	async function setupContainer(runtimeOptions?: IContainerRuntimeOptions) {
		const configCopy = { ...testContainerConfig, runtimeOptions };

		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(configCopy);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		dataObject1map1 = await dataObject1.getSharedObject<ISharedMap>(map1Id);
		// Send an op in container1 so that it switches to "write" mode and wait for it to be connected.
		dataObject1map1.set("key", "value");
		await waitForContainerConnection(container1);
		await provider.ensureSynchronized();
	}

	it("can set flush mode to Immediate and send ops", async () => {
		await setupContainer({ flushMode: FlushMode.Immediate });
		dataObject1map1.set("flushMode", "Immediate");
		await provider.ensureSynchronized();

		assert.strictEqual(
			dataObject1map1.get("flushMode"),
			"Immediate",
			"container1's map did not get updated",
		);
	});

	it("can set flush mode to TurnBased and send ops", async () => {
		await setupContainer({ flushMode: FlushMode.TurnBased });
		dataObject1map1.set("flushMode", "TurnBased");
		await provider.ensureSynchronized();

		assert.strictEqual(
			dataObject1map1.get("flushMode"),
			"TurnBased",
			"container1's map did not get updated",
		);
	});
});
