/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	ISequencedDocumentMessage,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	createSummarizerWithContainer,
	ITestObjectProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeNoCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluidframework/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs";
import { getGCStateFromSummary } from "./gcTestSummaryUtils";

/**
 * Validates that that reference state of nodes is correct irrespective of whether a summarizer loads from the latest
 * summary or an older summary. When a summarizer loads from an older summary, it gets the ack for newer summaries and
 * refreshes its state from the newer summary. These tests validates that the GC state is correctly refreshed.
 */
describeNoCompat("GC loading from older summaries", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let containerRuntime: IContainerRuntime;
	let dataStoreA: ITestDataObject;

	/**
	 * Creates a summarizer with the given summary version and returns the IContainer along with the ISummarizer.
	 */
	async function createSummarizerAndContainer(summaryVersion?: string) {
		const url = await mainContainer.getAbsoluteUrl("");
		return createSummarizerWithContainer(provider, url, summaryVersion);
	}

	/**
	 * Returns the reference state for all the nodes in the given summary tree.
	 * If a node is referenced, its value is true. If it's unreferenced, its value is false.
	 * @returns a map of nodePath to its unreferenced timestamp.
	 */
	async function getReferenceState(summaryTree: ISummaryTree) {
		const gcState = getGCStateFromSummary(summaryTree);
		assert(gcState !== undefined, "GC tree is not available in the summary");

		const nodeIsReferencedMap: Map<string, boolean> = new Map();
		for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
			nodeIsReferencedMap.set(
				nodePath.slice(1),
				nodeData.unreferencedTimestampMs === undefined ? true : false,
			);
		}
		return nodeIsReferencedMap;
	}

	/**
	 * Returns the unreferenced timestamp for all the nodes in the given summary tree.
	 * If a node is referenced, the unreferenced timestamp is undefined.
	 * @returns a map of nodePath to its unreferenced timestamp.
	 */
	async function getUnreferencedTimestamps(summaryTree: ISummaryTree) {
		const gcState = getGCStateFromSummary(summaryTree);
		assert(gcState !== undefined, "GC tree is not available in the summary");

		const nodeTimestamps: Map<string, number | undefined> = new Map();
		for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
			nodeTimestamps.set(nodePath.slice(1), nodeData.unreferencedTimestampMs);
		}
		return nodeTimestamps;
	}

	/*
	 * Utility function that returns the sequence number of a summary from the summary metadata.
	 */
	function getSummarySequenceNumber(summaryTree: ISummaryTree) {
		const metadataBlob = summaryTree.tree[".metadata"];
		assert(metadataBlob.type === SummaryType.Blob, "Container runtime metadata is not a blob");
		const metadata = JSON.parse(metadataBlob.content as string) as Record<string, unknown>;
		return (metadata.message as ISequencedDocumentMessage).sequenceNumber;
	}

	/**
	 * Reconnects the summarizer so that it is elected as the current summarizer. This is needed for two reasons:
	 * 1. In ODSP, when a summary is submitted, the previous one may be deleted based on heuristics. Since these tests
	 * need to load a container from an older summary, we need to load a summarizer with the old summary before a new
	 * one is generated. This poses problem with summarizer election because of the second reason below.
	 * 2. In these tests, summarization is disabled on the main container. However, when the first summarizer container
	 * is closed, the main container is still chosen as the summarizer due to a bug. If we reconnect a new summarizer
	 * after this happens, it will be chosen as the summarizer client and can do on-demand summaries.
	 */
	async function reconnectSummarizerToBeElected(container: IContainer) {
		container.disconnect();
		container.connect();
		await waitForContainerConnection(container);
	}

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await provider.makeTestContainer(defaultGCConfig);
		const defaultDataStore = await requestFluidObject<ITestDataObject>(
			mainContainer,
			"default",
		);
		containerRuntime = defaultDataStore._context.containerRuntime as IContainerRuntime;

		// Create data store B and mark it referenced. This will be used to manage reference of another data store.
		// We create a new data store because the default data store and is always realized by the test infrastructure.
		// In these tests, the data store managing referencing should not be realized by default.
		const dataStoreAHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreAHandle !== undefined, "data store does not have a handle");
		dataStoreA = await dataStoreAHandle.get();
		defaultDataStore._root.set("dataStoreA", dataStoreAHandle);

		await provider.ensureSynchronized();
		await waitForContainerConnection(mainContainer);
	});

	it("updates referenced nodes correctly when loading from an older summary", async () => {
		const { summarizer: summarizer1 } = await createSummarizerAndContainer();

		// Create a data store and mark it unreferenced to begin with.
		const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
		const dataStoreB = await dataStoreBHandle.get();
		dataStoreA._root.set("dataStoreB", dataStoreBHandle);
		dataStoreA._root.delete("dataStoreB");

		await provider.ensureSynchronized();

		// Summarize - summary1. dataStoreB should be unreferenced.
		const summaryResult1 = await summarizeNow(summarizer1);
		const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
		const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
		assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
		const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
		assert(dsBReferenceState1 === false, `dataStoreB should be unreferenced`);

		// Create a second summarizer with summary1. Note that this is done before posting another summary because ODSP
		// may delete this summary when a new one is posted.
		const { container: container2, summarizer: summarizer2 } =
			await createSummarizerAndContainer(summaryResult1.summaryVersion);

		// Reference dataStoreB now.
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);

		// Summarize - summary2. dataStoreB should now be referenced.
		await provider.ensureSynchronized();
		const summaryResult2 = await summarizeNow(summarizer1);
		const referenceState2 = await getReferenceState(summaryResult2.summaryTree);
		const dsAReferenceState2 = referenceState2.get(dataStoreA._context.id);
		assert(dsAReferenceState2 === true, `dataStoreA should still be referenced (1)`);
		const dsBReferenceState2 = referenceState2.get(dataStoreB._context.id);
		assert(dsBReferenceState2 === true, `dataStoreB should be referenced now`);

		// Close the first summarizer and reconnect the second one. The reconnection is necessary so that it is elected
		// as the new summarizer.
		summarizer1.close();
		await reconnectSummarizerToBeElected(container2);

		// Create a new alias data store so that the GC data changes without changing the GC state of existing data
		// stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
		const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
		const aliasResult = await ds2.trySetAlias("root2");
		assert.strictEqual(aliasResult, "Success", "Failed to alias data store");
		await provider.ensureSynchronized();

		// Summarize - summary3 with the new summarizer. Before it summarizes, it will catch up to latest and so the
		// reference state of the data stores should be the same as in summary2.
		// Also, note that while catching up, it will download summary2 and update state from it.
		const summaryResult3 = await summarizeNow(summarizer2);

		// Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
		const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
		const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
		assert(
			summary3SequenceNumber >= summary2SequenceNumber,
			"Summary 3 should be same or newer than summary 2",
		);

		// Validate that dataStoreB is still referenced in this summary.
		const referenceState3 = await getReferenceState(summaryResult3.summaryTree);
		const dsAReferenceState3 = referenceState3.get(dataStoreA._context.id);
		assert(dsAReferenceState3 === true, `dataStoreA should still be referenced (2)`);
		const dsBReferenceState3 = referenceState3.get(dataStoreB._context.id);
		assert(
			dsBReferenceState3 === true,
			`dataStoreB should still be referenced on loading from old summary`,
		);
	});

	it("updates unreferenced nodes correctly when loading from an older summary", async () => {
		const { summarizer: summarizer1 } = await createSummarizerAndContainer();

		// Create a data store and mark it referenced to begin with.
		const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
		const dataStoreB = await dataStoreBHandle.get();
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);

		await provider.ensureSynchronized();

		// Summarize - summary1. dataStoreB should be referenced.
		const summaryResult1 = await summarizeNow(summarizer1);
		const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
		const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
		assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
		const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
		assert(dsBReferenceState1 === true, `dataStoreB should be referenced`);

		// Create a second summarizer with summary1. Note that this is done before posting another summary because ODSP
		// may delete this summary when a new one is posted.
		const { container: container2, summarizer: summarizer2 } =
			await createSummarizerAndContainer(summaryResult1.summaryVersion);

		// Unreference dataStoreB now.
		dataStoreA._root.delete("dataStoreB");

		// Summarize - summary2. dataStoreB should now be unreferenced.
		await provider.ensureSynchronized();
		const summaryResult2 = await summarizeNow(summarizer1);
		const referenceState2 = await getReferenceState(summaryResult2.summaryTree);
		const dsAReferenceState2 = referenceState2.get(dataStoreA._context.id);
		assert(dsAReferenceState2 === true, `dataStoreA should still be referenced (1)`);
		const dsBReferenceState2 = referenceState2.get(dataStoreB._context.id);
		assert(dsBReferenceState2 === false, `dataStoreB should be unreferenced now`);

		// Close the first summarizer and reconnect the second one. The reconnection is necessary so that it is elected
		// as the new summarizer.
		summarizer1.close();
		await reconnectSummarizerToBeElected(container2);

		// Create a new alias data store so that the GC data changes without changing the GC state of existing data
		// stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
		const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
		const aliasResult = await ds2.trySetAlias("root2");
		assert.strictEqual(aliasResult, "Success", "Failed to alias data store");
		await provider.ensureSynchronized();

		// Summarize - summary3 with the new summarizer. Before it summarizes, it will catch up to latest and so the
		// reference state of the data stores should be the same as in summary2.
		// Also, note that while catching up, it will download summary2 and update state from it.
		const summaryResult3 = await summarizeNow(summarizer2);

		// Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
		const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
		const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
		assert(
			summary3SequenceNumber >= summary2SequenceNumber,
			"Summary 3 should be same or newer than summary 2",
		);

		// Validate that dataStoreB is still unreferenced in this summary.
		const referenceState3 = await getReferenceState(summaryResult3.summaryTree);
		const dsAReferenceState3 = referenceState3.get(dataStoreA._context.id);
		assert(dsAReferenceState3 === true, `dataStoreA should still be referenced (2)`);
		const dsBReferenceState3 = referenceState3.get(dataStoreB._context.id);
		assert(
			dsBReferenceState3 === false,
			`dataStoreB should still be unreferenced on loading from old summary`,
		);
	});

	/**
	 * In this test, the data store containing references to another data store is changed after loading from an older
	 * summary. But the DDS in the data store containing the references is not changed. This validates that the GC data
	 * in older summary is correctly propagated to DDS as well.
	 */
	it("updates unreferenced nodes correctly when DDS is unchanged after loading from older summary", async () => {
		const { summarizer: summarizer1 } = await createSummarizerAndContainer();

		// Create a second DDS in dataStoreA. This will be changed after loading from old summary so that the data store
		// changes but the root DDS containing references is unchanged.
		const dataStoreAdds2 = SharedMap.create(dataStoreA._runtime);
		dataStoreA._root.set("dds2", dataStoreAdds2.handle);

		const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
		const dataStoreB = await dataStoreBHandle.get();
		dataStoreA._root.set("dataStoreB", dataStoreBHandle);
		dataStoreA._root.delete("dataStoreB");

		await provider.ensureSynchronized();

		// Summarize - summary1. dataStoreB should be unreferenced.
		const summaryResult1 = await summarizeNow(summarizer1);
		const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
		const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
		assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
		const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
		assert(dsBReferenceState1 === false, `dataStoreB should be unreferenced`);

		// Create a second summarizer with summary1. Note that this is done before posting another summary because ODSP
		// may delete this summary when a new one is posted.
		const { container: container2, summarizer: summarizer2 } =
			await createSummarizerAndContainer(summaryResult1.summaryVersion);

		// Reference dataStoreB now.
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);

		// Summarize - summary2. dataStoreB should now be referenced.
		await provider.ensureSynchronized();
		const summaryResult2 = await summarizeNow(summarizer1);
		const referenceState2 = await getReferenceState(summaryResult2.summaryTree);
		const dsAReferenceState2 = referenceState2.get(dataStoreA._context.id);
		assert(dsAReferenceState2 === true, `dataStoreA should still be referenced (1)`);
		const dsBReferenceState2 = referenceState2.get(dataStoreB._context.id);
		assert(dsBReferenceState2 === true, `dataStoreB should now be referenced`);

		// Close the first summarizer and reconnect the second one. The reconnection is necessary so that it is elected
		// as the new summarizer.
		summarizer1.close();
		await reconnectSummarizerToBeElected(container2);

		// Create a new alias data store so that the GC data changes without changing the GC state of existing data
		// stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
		const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
		const aliasResult = await ds2.trySetAlias("root2");
		assert.strictEqual(aliasResult, "Success", "Failed to alias data store");

		// Change the second DDS in dataStoreA. This will change dataStoreA but the root DDS that contains references
		// to dataStoreB is unchanged.
		dataStoreAdds2.set("key", "value");
		await provider.ensureSynchronized();

		// Summarize - summary3 with the new summarizer. Before it summarizes, it will catch up to latest and so the
		// reference state of the data stores should be the same as in summary2.
		// Also, note that while catching up, it will download summary2 and update state from it.
		const summaryResult3 = await summarizeNow(summarizer2);

		// Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
		const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
		const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
		assert(
			summary3SequenceNumber >= summary2SequenceNumber,
			"Summary 3 should be same or newer than summary 2",
		);

		// Validate that dataStoreB is still referenced in this summary.
		const referenceState3 = await getReferenceState(summaryResult3.summaryTree);
		const dsAReferenceState3 = referenceState3.get(dataStoreA._context.id);
		assert(dsAReferenceState3 === true, `dataStoreA should still be referenced (2)`);
		const dsBReferenceState3 = referenceState3.get(dataStoreB._context.id);
		assert(
			dsBReferenceState3 === true,
			`dataStoreB should still be referenced on loading from old summary`,
		);
	});

	it("updates unreferenced timestamps correctly when loading from an older summary", async () => {
		const { summarizer: summarizer1 } = await createSummarizerAndContainer();

		// Create a data store and mark it unreferenced to begin with.
		const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
		const dataStoreB = await dataStoreBHandle.get();
		dataStoreA._root.set("dataStoreB", dataStoreBHandle);
		dataStoreA._root.delete("dataStoreB");

		await provider.ensureSynchronized();

		// Summarize - summary1. dataStoreB should have unreferenced timestamp.
		const summaryResult1 = await summarizeNow(summarizer1);
		const unreferencedTimestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
		const dsBTime1 = unreferencedTimestamps1.get(dataStoreB._context.id);
		assert(dsBTime1 !== undefined, `dataStoreB should have unreferenced timestamp`);

		// Create a second summarizer with summary1. Note that this is done before posting another summary because ODSP
		// may delete this summary when a new one is posted.
		const { container: container2, summarizer: summarizer2 } =
			await createSummarizerAndContainer(summaryResult1.summaryVersion);

		// Reference and unreference dataStoreB.
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);
		dataStoreA._root.delete("dataStoreB");

		// Summarize - summary2. dataStoreB's unreferenced timestamp should have updated.
		await provider.ensureSynchronized();
		const summaryResult2 = await summarizeNow(summarizer1);
		const unreferencedTimestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
		const dsBTime2 = unreferencedTimestamps2.get(dataStoreB._context.id);
		assert(
			dsBTime2 !== undefined && dsBTime2 > dsBTime1,
			`dataStoreB's time should have updated`,
		);

		// Close the first summarizer and reconnect the second one. The reconnection is necessary so that it is elected
		// as the new summarizer.
		summarizer1.close();
		await reconnectSummarizerToBeElected(container2);

		// Create a new alias data store so that the GC data changes without changing the GC state of existing data
		// stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
		const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
		const aliasResult = await ds2.trySetAlias("root2");
		assert.strictEqual(aliasResult, "Success", "Failed to alias data store");
		await provider.ensureSynchronized();

		// Summarize - summary3 with the new summarizer. Before it summarizes, it will catch up to latest and so the
		// reference state of the data stores should be the same as in summary2.
		// Also, note that while catching up, it will download summary2 and update state from it.
		const summaryResult3 = await summarizeNow(summarizer2);

		// Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
		const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
		const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
		assert(
			summary3SequenceNumber >= summary2SequenceNumber,
			"Summary 3 should be same or newer than summary 2",
		);

		// Validate that dataStoreB's unreferenced timestamp is the same as from summary2.
		const unreferencedTimestamps3 = await getUnreferencedTimestamps(summaryResult3.summaryTree);
		const dsBTime3 = unreferencedTimestamps3.get(dataStoreB._context.id);
		assert(dsBTime3 === dsBTime2, `dataStoreB's time should be same as in summary2`);
	});

	it("does not log gcUnknownOutboundReferences errors when loading from an older summary", async () => {
		const { summarizer: summarizer1 } = await createSummarizerAndContainer();

		// Create a data store and mark it unreferenced to begin with.
		const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
		const dataStoreB = await dataStoreBHandle.get();
		dataStoreA._root.set("dataStoreB", dataStoreBHandle);
		dataStoreA._root.delete("dataStoreB");

		await provider.ensureSynchronized();

		// Summarize - summary1. dataStoreB should be unreferenced.
		const summaryResult1 = await summarizeNow(summarizer1);
		const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
		const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
		assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
		const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
		assert(dsBReferenceState1 === false, `dataStoreB should be unreferenced`);

		// Create a second summarizer with summary1. Note that this is done before posting another summary because ODSP
		// may delete this summary when a new one is posted.
		const { container: container2, summarizer: summarizer2 } =
			await createSummarizerAndContainer(summaryResult1.summaryVersion);

		// Reference dataStoreB. This should result in an explicit reference from dataStoreA -> dataStoreB.
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);

		// Summarize - summary2. dataStoreB should now be referenced.
		await provider.ensureSynchronized();
		const summaryResult2 = await summarizeNow(summarizer1);
		const unreferencedTimestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
		const dsBTime2 = unreferencedTimestamps2.get(dataStoreB._context.id);
		assert(dsBTime2 === undefined, `dataStoreB's time should have updated`);

		// Close the first summarizer and reconnect the second one. The reconnection is necessary so that it is elected
		// as the new summarizer.
		summarizer1.close();
		await reconnectSummarizerToBeElected(container2);
		await provider.ensureSynchronized();

		// Summarize - summary3 with the new summarizer. Before it summarizes, it will catch up to latest and so the
		// reference state of the data stores should be the same as in summary2.
		// Also, note that while catching up, it will download summary2 and update state from it.
		// When GC runs as part of this summarize, it should not throw "gcUnknownOutboundReferences" error for the
		// dataStoreA -> dataStoreB route.
		const summaryResult3 = await summarizeNow(summarizer2);

		// Validate that summary3 is same or newer than summary2. This is to ensure that it has the latest GC state.
		const summary2SequenceNumber = getSummarySequenceNumber(summaryResult2.summaryTree);
		const summary3SequenceNumber = getSummarySequenceNumber(summaryResult3.summaryTree);
		assert(
			summary3SequenceNumber >= summary2SequenceNumber,
			"Summary 3 should be same or newer than summary 2",
		);
	});
});
