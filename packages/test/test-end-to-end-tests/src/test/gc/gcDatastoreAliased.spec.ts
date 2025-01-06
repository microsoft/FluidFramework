/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	getContainerEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * Validates this scenario: When a datastore is aliased it is always referenced.
 */
describeCompat("GC Data Store Aliased Full Compat", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	async function waitForSummary(container: IContainer) {
		const dataStore = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		return (dataStore._context.containerRuntime as ContainerRuntime).summarize({
			runGC: true,
			trackState: false,
			fullTree: true,
		});
	}

	it("An unreferenced datastore when aliased becomes referenced.", async function () {
		// TODO: Re-enable after cross version compat bugs are fixed - ADO:6978
		if (provider.type === "TestObjectProviderWithVersionedLoad") {
			this.skip();
		}
		const container1 = await provider.makeTestContainer(defaultGCConfig);
		const container2 = await provider.loadTestContainer(defaultGCConfig);
		const mainDataStore1 = await getContainerEntryPointBackCompat<ITestDataObject>(container1);
		const mainDataStore2 = await getContainerEntryPointBackCompat<ITestDataObject>(container2);
		await waitForContainerConnection(container1);
		await waitForContainerConnection(container2);

		const dataStore2 =
			await mainDataStore1._context.containerRuntime.createDataStore(TestDataObjectType);
		const dataObject2 = (await dataStore2.entryPoint?.get()) as ITestDataObject;
		// Make dataStore2 visible but unreferenced by referencing/unreferencing it.
		mainDataStore1._root.set("dataStore2", dataStore2.entryPoint);
		mainDataStore1._root.delete("dataStore2");
		await provider.ensureSynchronized();

		// We run the summary so await this.getInitialSnapshotDetails() is called before the datastore is aliased
		// and after the datastore is attached. This sets the isRootDataStore to false.
		let summaryWithStats = await waitForSummary(container2);
		const gcStatePreAlias = getGCStateFromSummary(summaryWithStats.summary);
		assert(gcStatePreAlias !== undefined, "Should get gc pre state from summary!");
		assert(
			gcStatePreAlias.gcNodes?.[toFluidHandleInternal(dataObject2.handle).absolutePath]
				.unreferencedTimestampMs !== undefined,
			"dataStore2 should be unreferenced as it is not aliased and not root!",
		);

		// Alias a datastore
		const alias = "alias";
		const aliasResult1 = await dataStore2.trySetAlias(alias);
		assert(
			aliasResult1 === "Success",
			`Expected an successful aliasing. Got: ${aliasResult1}`,
		);
		await provider.ensureSynchronized();

		// Should be able to retrieve root datastore from remote
		const containerRuntime2 = mainDataStore2._context
			.containerRuntime as unknown as IContainerRuntime;
		assert.doesNotThrow(
			async () => containerRuntime2.getAliasedDataStoreEntryPoint(alias),
			"Aliased datastore should be root as it is aliased!",
		);
		summaryWithStats = await waitForSummary(container2);
		const gcStatePostAlias = getGCStateFromSummary(summaryWithStats.summary);
		assert(gcStatePostAlias !== undefined, "Should get gc post state from summary!");
		assert(
			gcStatePostAlias.gcNodes?.[toFluidHandleInternal(dataObject2.handle).absolutePath]
				.unreferencedTimestampMs === undefined,
			"dataStore2 should be referenced as it is aliased and thus a root datastore!",
		);
	});
});

describeCompat("GC Data Store Aliased No Compat", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Aliased datastore is referenced even without storing handles", async () => {
		const container = await provider.makeTestContainer(defaultGCConfig);
		const remoteContainer = await provider.loadTestContainer(defaultGCConfig);
		await waitForContainerConnection(container);
		await waitForContainerConnection(remoteContainer);

		// Create and alias datastore
		const mainDatastore = (await container.getEntryPoint()) as ITestDataObject;
		const aliasedDataStore =
			await mainDatastore._context.containerRuntime.createDataStore(TestDataObjectType);
		const alias = "alias";
		await aliasedDataStore.trySetAlias(alias);

		// summarize
		const { summarizer } = await createSummarizer(provider, container);
		const { summaryTree } = await summarizeNow(summarizer);
		const gcState = getGCStateFromSummary(summaryTree);
		assert(
			aliasedDataStore.entryPoint !== undefined,
			"Expecting an entrypoint handle in a non-compat test!",
		);
		assert(
			gcState?.gcNodes[aliasedDataStore.entryPoint.absolutePath].unreferencedTimestampMs ===
				undefined,
			"Aliased datastores should always be referenced!",
		);
	});

	it("Aliased datastore is referenced when removing its stored handles", async () => {
		const container = await provider.makeTestContainer(defaultGCConfig);
		const remoteContainer = await provider.loadTestContainer(defaultGCConfig);
		await waitForContainerConnection(container);
		await waitForContainerConnection(remoteContainer);

		// Create and alias datastore
		const mainDatastore = (await container.getEntryPoint()) as ITestDataObject;
		const aliasedDataStore =
			await mainDatastore._context.containerRuntime.createDataStore(TestDataObjectType);
		const alias = "alias";
		const handleKey = "handle";
		await aliasedDataStore.trySetAlias(alias);
		assert(
			aliasedDataStore.entryPoint !== undefined,
			"We need a defined handle to reference the datastore!",
		);
		mainDatastore._root.set(handleKey, aliasedDataStore.entryPoint);
		mainDatastore._root.delete(handleKey);

		// summarize
		const { summarizer } = await createSummarizer(provider, container);
		const { summaryTree } = await summarizeNow(summarizer);
		const gcState = getGCStateFromSummary(summaryTree);
		assert(
			aliasedDataStore.entryPoint !== undefined,
			"Expecting an entrypoint handle in a non-compat test!",
		);
		assert(
			gcState?.gcNodes[aliasedDataStore.entryPoint.absolutePath].unreferencedTimestampMs ===
				undefined,
			"Aliased datastores should always be referenced!",
		);
	});
});
