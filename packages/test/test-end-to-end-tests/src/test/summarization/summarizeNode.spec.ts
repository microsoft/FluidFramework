/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { IFluidHandle, IRequestHeader } from "@fluidframework/core-interfaces";
import {
	ITestFluidObject,
	ITestObjectProvider,
	createTestConfigProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

describeCompat(
	"Summary handles work as expected",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const configProvider = createTestConfigProvider();
		const {
			dataRuntime: { TestFluidObjectFactory },
			containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
			dds: { SharedDirectory },
		} = apis;
		const defaultFactory = new TestFluidObjectFactory([]);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
		});

		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", async function () {
			provider = getTestObjectProvider();
			// Only need to test against one server
			if (provider.driver.type !== "odsp") {
				this.skip();
			}
		});

		it("A data store id with special character `[` works properly with summary handles", async () => {
			// Enable short ids for this test to create a data store with special chanracter.
			configProvider.set("Fluid.Runtime.UseShortIds", true);
			const container = await provider.createDetachedContainer(runtimeFactory, {
				configProvider,
			});
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const containerRuntime = dataObject.context.containerRuntime;

			// 13 datastore produces a shortId of "["
			for (let i = 0; i < 13; i++) {
				const ds = await containerRuntime.createDataStore(defaultFactory.type);
				const dataObjectNew = (await ds.entryPoint.get()) as ITestFluidObject;
				dataObject.root.set(dataObjectNew.context.id, dataObjectNew.handle);
				if (i === 12) {
					assert.equal(dataObjectNew.context.id, "[", "The 13th data store id should be [");
				}
			}

			await provider.attachDetachedContainer(container);

			const dsWithBugHandle = dataObject.root.get<IFluidHandle<ITestFluidObject>>("[");
			assert(dsWithBugHandle !== undefined, "data store handle not found");
			const dsWithBug = await dsWithBugHandle.get();
			dsWithBug.root.set(`key13`, `value13`);

			// Create first summary
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				defaultFactory,
			);
			await summarizeNow(summarizer);

			// Create another summary but with no change in the data object, to emulate the scenario
			// where there has been no change in the data store, and thus summary must create and send a summary handle for it.
			const result = await summarizeNow(summarizer);

			// Load a new container with this summary
			const headers: IRequestHeader = {
				// Force the container to load from the latest created summary.
				[LoaderHeader.version]: result.summaryVersion,
			};
			const container2 = await provider.loadContainer(runtimeFactory, undefined, headers);
			assert(!container2.closed, "container should not be closed");
		});
	},
);
