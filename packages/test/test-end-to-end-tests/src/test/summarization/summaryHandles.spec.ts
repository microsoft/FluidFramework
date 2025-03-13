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
	createContainerRuntimeFactoryWithDefaultDataStore,
	createTestConfigProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

/**
 * The test is skipped as we have an existing bug in our code where if the use of short ids for data stores and dds is enabled, the summaries will start failing.
 * Without short ids, the code works because the handle for a tree node is exactly able to point to a path of node in the summary tree, because the ids do not have any special characters which
 * could change with the encodeURIComponent(). Once ShortIds feature is enabled in container runtime, the ids can have special characters (like '[' ) which can result in a handle containing %5b -
 * this will be problematic because when uploading a summary with such handles, the server will try to look for a path with %5b but will not find it, as the path to the tree will still be '['
 * since we removed encoding logic from the driver layer with this PR: https://github.com/microsoft/FluidFramework/pull/21680
 *
 * ADO:18003
 */
describeCompat.skip(
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
		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory,
				registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
				runtimeOptions: {
					summaryOptions: {
						summaryConfigOverrides: {
							state: "disabled",
						},
					},
				},
			},
		);

		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "odsp") {
				this.skip();
			}
		});

		it("A data store id with special character `[` works properly with summary handles", async () => {
			// Enable short ids for this test to create a data store with special character.
			configProvider.set("Fluid.Runtime.UseShortIds", true);
			// Enable single-commit summaries so that when the test runs with old odsp driver, it doesn't fail with summary nacks.
			configProvider.set("Fluid.Container.summarizeProtocolTree2", true);
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

			const dsWithSpecialHandle = dataObject.root.get<IFluidHandle<ITestFluidObject>>("[");
			assert(dsWithSpecialHandle !== undefined, "data store handle not found");
			const dsSpecial = await dsWithSpecialHandle.get();
			dsSpecial.root.set(`key13`, `value13`);

			// Create first summary
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				defaultFactory,
			);

			await provider.ensureSynchronized();

			// Following summarize fails with error that looks something like: "Cannot locate node with path '.app/.channels/%5B' under 'wAw'." when containerRuntime tries to upload the summary.
			// ADO:18003
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

			const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const dsWithSpecialHandle2 = dataObject2.root.get<IFluidHandle<ITestFluidObject>>("[");
			assert(
				dsWithSpecialHandle2 !== undefined,
				"data store handle not found in the loaded container",
			);
			const dsSpecial2 = await dsWithSpecialHandle2?.get();
			assert(dsSpecial2 !== undefined, "unable to get the data store in the loaded container");
		});
	},
);
