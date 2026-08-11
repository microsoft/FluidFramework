/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { waitContainerToCatchUp } from "@fluidframework/container-loader/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { toDeltaManagerInternal } from "@fluidframework/runtime-utils/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	toIDeltaManagerFull,
	createAndAttachContainer,
} from "@fluidframework/test-utils/internal";

const mapId = "map";

// This is a regression test for https://github.com/microsoft/FluidFramework/issues/9163
describeCompat("t9s issue regression test", "NoCompat", (getTestObjectProvider, apis) => {
	const registry: ChannelFactoryRegistry = [[mapId, apis.dds.SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
	};

	// TODO: Unskip once a Tinylicious version containing the fix for range queries with a lower bound of 0 is published.
	it.skip("waitContainerToCatchUp catches up from the first op", async function () {
		const provider = getTestObjectProvider();
		if (provider.driver.type !== "tinylicious" && provider.driver.type !== "t9s") {
			this.skip();
		}
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const url = await container1.getAbsoluteUrl("");
		assert(typeof url === "string");

		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		map1.set("key", "value");
		await provider.ensureSynchronized();

		const loader = provider.makeTestLoader(testContainerConfig);
		const container2 = await loader.resolve({ url });
		await waitContainerToCatchUp(container2);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		assert.equal(map2.get("key"), "value");
	});

	it("handles long logtail", async function () {
		const provider = getTestObjectProvider();
		const loader1 = provider.makeTestLoader(testContainerConfig);
		const container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader1,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		const url = await container1.getAbsoluteUrl("");
		assert(typeof url === "string");
		console.log(url);
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		if (!(container2 as any).connected) {
			await new Promise((resolve) => container2.on("connected", resolve));
		}
		[...Array(60).keys()].map((i) => map2.set(`test op ${i}`, i));
		await provider.ensureSynchronized();
		await provider.opProcessingController.pauseProcessing(container2);
		const deltaManagerFull = toIDeltaManagerFull(
			toDeltaManagerInternal(dataStore2.runtime.deltaManager),
		);
		assert(deltaManagerFull.outbound.paused);

		map2.set("a key", "a value");
		await provider.ensureSynchronized();
		container2.close();

		map1.set("some key", "some value");
		await provider.ensureSynchronized();

		// use a new loader so we don't get a cached container
		const loader2 = provider.makeTestLoader(testContainerConfig);
		const container3 = await loader2.resolve({ url });
		if (!(container3 as any).connected) {
			console.log("waiting");
			await new Promise((resolve) => container3.on("connected", resolve));
		}
	});
});
