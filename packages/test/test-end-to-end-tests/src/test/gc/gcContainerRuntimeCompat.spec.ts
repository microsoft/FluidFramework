/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	describeCompat,
	type getContainerRuntimeApi,
	type getDataRuntimeApi,
	type getLoaderApi,
} from "@fluid-private/test-version-utils";
import {
	IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type {
	IContainerRuntimeOptions,
	ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	ITestFluidObject,
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerCore,
	getContainerEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { getGCFeatureFromSummary, getGCStateFromSummary } from "./gcTestSummaryUtils.js";

interface LayerApis {
	containerRuntime: ReturnType<typeof getContainerRuntimeApi>;
	dataRuntime: ReturnType<typeof getDataRuntimeApi>;
	loader: ReturnType<typeof getLoaderApi>;
}

const defaultSummaryOptions: ISummaryRuntimeOptions = {
	summaryConfigOverrides: {
		state: "disableHeuristics",
		maxAckWaitTime: 20000, // Some of the AFR tests take a long time to ack.
		maxOpsSinceLastSummary: 7000,
		initialSummarizerDelayMs: 0,
	},
};

/**
 * These tests validate the compatibility of the GC data in the summary tree across the past 2 container runtime
 * versions. A version of container runtime generates the summary and then we validate that another version can
 * read and process it successfully.
 */
describeCompat(
	"GC summary compatibility tests",
	"FullCompat",
	(getTestObjectProvider, compatApis) => {
		const version1Apis: LayerApis = {
			containerRuntime: compatApis.containerRuntime,
			dataRuntime: compatApis.dataRuntime,
			loader: compatApis.loader,
		};

		const version2Apis: LayerApis = {
			containerRuntime: compatApis.containerRuntimeForLoading ?? compatApis.containerRuntime,
			dataRuntime: compatApis.dataRuntimeForLoading ?? compatApis.dataRuntime,
			loader: compatApis.loaderForLoading ?? compatApis.loader,
		};

		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let dataStoreA: ITestFluidObject;
		let dataObjectType: string;

		async function createRuntimeFactory(
			apis: LayerApis,
			type: "interactive" | "summarizer",
		): Promise<IRuntimeFactory> {
			const dataObjectFactory = new apis.dataRuntime.TestFluidObjectFactory([]);
			dataObjectType = dataObjectFactory.type;
			const runtimeOptions: IContainerRuntimeOptions = {
				summaryOptions:
					type === "summarizer"
						? defaultSummaryOptions
						: {
								summaryConfigOverrides: {
									state: "disabled",
								},
							},
			};
			const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
				apis.containerRuntime.ContainerRuntimeFactoryWithDefaultDataStore,
				{
					defaultFactory: dataObjectFactory,
					registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
					runtimeOptions,
				},
			);
			return runtimeFactory;
		}

		async function createContainer(apis: LayerApis): Promise<IContainer> {
			const runtimeFactory = await createRuntimeFactory(apis, "interactive");
			return provider.createContainer(runtimeFactory);
		}

		beforeEach("setupContainer", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });

			// ODSP only supports single commit summaries now. Loaders running 1.x didn't have single commit summaries
			// and only supported two commit summaries. If this test runs with 1.x loaders, summaries fail because ODSP
			// nacks them. So, skip the test for those combinations.
			if (provider.driver.type === "odsp") {
				const loaderVersion = compatApis.loader.version;
				const loaderVersionForLoading = compatApis.loaderForLoading?.version;
				if (loaderVersion.startsWith("1.") || loaderVersionForLoading?.startsWith("1.")) {
					this.skip();
				}
			}

			mainContainer = await createContainer(version1Apis);
			dataStoreA = await getContainerEntryPointBackCompat<ITestFluidObject>(mainContainer);
			await waitForContainerConnection(mainContainer);
		});

		async function createSummarizer(apis: LayerApis, summaryVersion?: string) {
			const runtimeFactory = await createRuntimeFactory(apis, "summarizer");
			const loader = provider.createLoader(
				[[provider.defaultCodeDetails, runtimeFactory]],
				{
					logger: provider.logger,
				},
				// Whether to force-use the create version to load the document.
				// Note that since we're simulating a summarizer being created using both old & new version
				// at different parts of this test,
				// we need to specify this explicitly rather than rely on default behavior.
				apis.loader.version === version1Apis.loader.version,
			);
			const { summarizer } = await createSummarizerCore(mainContainer, loader, summaryVersion);
			return summarizer;
		}

		/**
		 * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
		 * referenced, the unreferenced timestamp is undefined.
		 * @returns a map of nodeId to its unreferenced timestamp.
		 */
		async function getUnreferencedTimestamps(summaryTree: ISummaryTree) {
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			const nodeTimestamps: Map<string, number | undefined> = new Map();
			for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
				nodeTimestamps.set(nodeId.slice(1), nodeData.unreferencedTimestampMs);
			}
			return nodeTimestamps;
		}

		/**
		 * This test validates that the unreferenced timestamp in the summary generated by a container runtime can
		 * be read by older / newer versions of the container runtime.
		 */
		it("load version validates unreferenced timestamp from summary by create version", async function () {
			// Create a new summarizer running version 1 runtime. This client will generate a summary which will be used to load
			// a new client using the runtime factory version 2.
			const summarizer1 = await createSummarizer(version1Apis);

			// Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
			const dataStoreB =
				await dataStoreA.context.containerRuntime.createDataStore(dataObjectType);
			let dataObjectB: ITestFluidObject;
			if (dataStoreB.entryPoint !== undefined) {
				dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			} else {
				// Back-compat: old runtime versions won't have an entry point API.
				const result = await (dataStoreB as any).request({ url: "/" });
				assert.equal(result.status, 200, `Request failed: ${result.value}\n${result.stack}`);
				dataObjectB = result.value;
			}
			dataStoreA.root.set("dataStoreB", dataObjectB.handle);

			// Validate that the new data store does not have unreferenced timestamp.
			await provider.ensureSynchronized();
			const summaryResult1 = await summarizeNow(summarizer1);
			const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
			const dsBTimestamp1 = timestamps1.get(dataObjectB.context.id);
			assert(
				dsBTimestamp1 === undefined,
				`new data store should not have unreferenced timestamp`,
			);

			// Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has
			// an unreferenced timestamp.
			dataStoreA.root.delete("dataStoreB");
			await provider.ensureSynchronized();
			const summaryResult2 = await summarizeNow(summarizer1);
			const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
			const dsBTimestamp2 = timestamps2.get(dataObjectB.context.id);
			assert(dsBTimestamp2 !== undefined, `new data store should have unreferenced timestamp`);

			// Create a new summarizer running version 2 from the summary generated by the client running version 1.
			summarizer1.close();
			const summarizer2 = await createSummarizer(version2Apis, summaryResult2.summaryVersion);

			// `getUnreferencedTimestamps` assumes that the GC result isn't incremental.
			// Passing fullTree explicitly ensures that.
			const summaryResult3 = await summarizeNow(summarizer2, {
				reason: "end-to-end test",
				fullTree: true,
			});
			const timestamps3 = await getUnreferencedTimestamps(summaryResult3.summaryTree);
			const dsBTimestamp3 = timestamps3.get(dataObjectB.context.id);
			assert(
				dsBTimestamp3 !== undefined,
				`new data store should still have unreferenced timestamp`,
			);
			if (
				getGCFeatureFromSummary(summaryResult2.summaryTree) ===
				getGCFeatureFromSummary(summaryResult3.summaryTree)
			) {
				assert.strictEqual(
					dsBTimestamp3,
					dsBTimestamp2,
					"The unreferenced timestamp should not have changed",
				);
			} else {
				// The newer runtime version may have regenerated all GC data (and timestamps) if it detected the previous
				// runtime taking a summary had an older gcFeature, see gcVersionUpdate.spec.ts.
				assert(
					dsBTimestamp3 >= dsBTimestamp2,
					"The unreferenced timestamp should not have moved back",
				);
			}
		});
	},
);
