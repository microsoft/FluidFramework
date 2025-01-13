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
import { ISummarizer } from "@fluidframework/container-runtime/internal";
// eslint-disable-next-line import/no-internal-modules
import { IGarbageCollectionState } from "@fluidframework/container-runtime/internal/test/gc";
import {
	ISummaryBlob,
	SummaryType,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import { gcBlobPrefix, gcTreeKey } from "@fluidframework/runtime-definitions/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";

/**
 * Validates this scenario: When two DDSes in the same datastore has one change, gets summarized, and then gc is called
 * from loading a new container. We do not want to allow duplicate GC routes to be created in this scenario.
 */
describeCompat("GC Data Store Duplicates", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let mainDataStore: ITestDataObject;

	async function waitForSummary(summarizer: ISummarizer) {
		await provider.ensureSynchronized();
		return summarizeNow(summarizer);
	}

	beforeEach("setup", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await provider.makeTestContainer(defaultGCConfig);
		mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(mainContainer);
	});

	it("DDS changes do not create new GC blobs", async () => {
		const dds = SharedMap.create(mainDataStore._runtime);
		mainDataStore._root.set("dds", dds.handle);

		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);
		let summaryResult = await waitForSummary(summarizer1);

		// Change ds1 but not the root dds
		dds.set("change", "change1");

		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryResult.summaryVersion,
		);
		summaryResult = await waitForSummary(summarizer2);
		const gcObject: SummaryObject | undefined = summaryResult.summaryTree.tree[gcTreeKey];
		assert(gcObject !== undefined, "Expected a gc blob!");
		assert(gcObject.type === SummaryType.Handle, "Expected a handle!");
		assert(gcObject.handleType === SummaryType.Tree, "Expected a gc tree handle!");
	});

	it("Back routes added by GC are removed when passed from data stores to DDSes", async () => {
		const dds = SharedMap.create(mainDataStore._runtime);
		mainDataStore._root.set("dds", dds.handle);

		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);
		let summaryResult = await waitForSummary(summarizer1);

		// Change ds1 but not the root dds so that the root dds routes are pulled by default
		dds.set("change", "change1");

		// Create a new dataStore so that the GC blob is regenerated
		const dataStore =
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
		await dataStore.trySetAlias("ARootDataStore");

		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryResult.summaryVersion,
		);

		// Get GC State
		summaryResult = await waitForSummary(summarizer2);
		const gcTree: SummaryObject | undefined = summaryResult.summaryTree.tree[gcTreeKey];
		assert(gcTree?.type === SummaryType.Tree, "Expected a Tree!");
		const gcBlob = gcTree.tree[`${gcBlobPrefix}_root`] as ISummaryBlob;
		const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;

		// Validate GC State that for each GC node, no route is duplicated
		for (const [_, gcData] of Object.entries(gcState.gcNodes)) {
			const seenRoutes = new Set<string>();
			gcData.outboundRoutes.forEach((route) => {
				assert(
					!seenRoutes.has(route),
					`There should be no duplicate routes! Duplicate Route: ${route}`,
				);
				seenRoutes.add(route);
			});
		}
	});
});
