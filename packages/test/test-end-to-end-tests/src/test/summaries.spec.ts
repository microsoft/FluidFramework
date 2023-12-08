/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { bufferToString } from "@fluid-internal/client-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
	ContainerRuntime,
	ISummarizer,
	ISummarizeResults,
	ISummaryRuntimeOptions,
	DefaultSummaryConfiguration,
	SummaryCollection,
} from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryBlob, ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { MockLogger, createChildLogger } from "@fluidframework/telemetry-utils";
import {
	waitForContainerConnection,
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
	createSummarizer,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";

const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));
const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		summaryOptions: {
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{ maxOps: 10, initialSummarizerDelayMs: 0, minIdleTime: 10, maxIdleTime: 10 },
			},
		},
	},
};

async function createContainer(
	provider: ITestObjectProvider,
	summaryOpt: ISummaryRuntimeOptions,
	logger?: ITelemetryBaseLogger,
): Promise<IContainer> {
	// Force generateSummaries to false.
	const summaryOptions: ISummaryRuntimeOptions = {
		...summaryOpt,
		summaryConfigOverrides: {
			...summaryOpt.summaryConfigOverrides,
			state: "disabled",
		},
	};

	return provider.makeTestContainer({
		runtimeOptions: { summaryOptions },
		loaderProps: { logger },
	});
}

async function createMainContainerAndSummarizer(
	provider: ITestObjectProvider,
	containerConfig?: ITestContainerConfig,
): Promise<{ mainContainer: IContainer; summarizer: ISummarizer }> {
	const loader = provider.makeTestLoader(containerConfig ?? testContainerConfig);
	const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
	await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
	const absoluteUrl = await container.getAbsoluteUrl("");
	if (absoluteUrl === undefined) {
		throw new Error("URL could not be resolved");
	}
	const { summarizer } = await createSummarizer(
		provider,
		container,
		containerConfig ?? testContainerConfig,
	);
	return {
		mainContainer: container,
		summarizer,
	};
}

function readBlobContent(content: ISummaryBlob["content"]): unknown {
	const json = typeof content === "string" ? content : bufferToString(content, "utf8");
	return JSON.parse(json);
}

class TestDataObject1 extends DataObject {
	protected async initializingFromExisting(): Promise<void> {
		// This test data object will verify full initialization does not happen for summarizer client.
		if (this.context.clientDetails.capabilities.interactive === false) {
			throw Error(
				"Non interactive/summarizer client's data object should not be initialized",
			);
		}
	}
}

describeCompat("Summaries", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	it("On demand summaries", async () => {
		const { summarizer } = await createMainContainerAndSummarizer(provider);

		let result: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test" });
		let negResult: ISummarizeResults | undefined = summarizer.summarizeOnDemand({
			reason: "negative test",
		});

		let submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		assert(
			submitResult.data.stage === "submit",
			"on-demand summary submitted data stage should be submit",
		);
		assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

		let broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		let ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");

		await flushPromises();

		assert(
			(await negResult.summarySubmitted).success === false,
			"Should fail to submit summary",
		);

		const seq: number = (summarizer as any).runtime.deltaManager.lastSequenceNumber;
		result = summarizer.summarizeOnDemand({ reason: "test" });
		try {
			negResult = undefined;
			negResult = summarizer.summarizeOnDemand({ reason: "negative test" });
		} catch (reason) {}
		assert(negResult === undefined, "Should not have attempted to summarize while summarizing");

		submitResult = await result.summarySubmitted;
		assert(submitResult.success, "Result should be complete on success");
		assert(submitResult.data.referenceSequenceNumber === seq, "ref seq num");
		assert(submitResult.data.stage === "submit", "Should have been submitted");
		assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

		broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		assert(
			broadcastResult.data.summarizeOp.referenceSequenceNumber === seq,
			"summarize op ref seq num should be same as summary seq",
		);

		ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");
	});

	it("should fail on demand summary on stopped summarizer", async () => {
		const { summarizer } = await createMainContainerAndSummarizer(provider);
		let result: ISummarizeResults | undefined = summarizer.summarizeOnDemand({
			reason: "test",
		});

		const submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		assert(
			submitResult.data.stage === "submit",
			"on-demand summary submitted data stage should be submit",
		);

		assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

		const broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		const ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary should be acked");

		summarizer.stop("summarizerClientDisconnected");
		await flushPromises();

		try {
			result = undefined;
			result = summarizer.summarizeOnDemand({ reason: "test" });
		} catch (error: any) {
			assert(error.errorType === "summarizingError", "Should throw a summarizer error");
		}
		assert(result === undefined, "Should not have attempted summary with disposed summarizer");
	});

	it("summarizer client should be read-only", async () => {
		const container1 = await createContainer(provider, {});
		const dsContainer1 = (await container1.getEntryPoint()) as ITestDataObject;
		const readOnlyContainer1 = dsContainer1._context.deltaManager.readOnlyInfo.readonly;
		assert(readOnlyContainer1 !== true, "Non-summarizer container 1 should not be readonly");

		const { summarizer } = await createSummarizer(provider, container1);
		const readOnlySummarizer = (summarizer as any).runtime.deltaManager.readOnlyInfo.readonly;
		assert(readOnlySummarizer === true, "Summarizer should be readonly");
	});
	it("should generate summary tree", async () => {
		const container = await createContainer(provider, {});
		const defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		const containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;

		await provider.ensureSynchronized();

		const { stats, summary } = await containerRuntime.summarize({
			runGC: false,
			fullTree: false,
			trackState: false,
			summaryLogger: createChildLogger(),
		});

		// Validate stats
		assert(stats.handleNodeCount === 0, "Expecting no handles for first summary.");
		// .metadata, .component, and .attributes blobs
		assert(
			stats.blobNodeCount >= 3,
			`Stats expected at least 3 blob nodes, but had ${stats.blobNodeCount}.`,
		);
		// root node, data store .channels, default data store, dds .channels, and default root dds
		assert(
			stats.treeNodeCount >= 5,
			`Stats expected at least 5 tree nodes, but had ${stats.treeNodeCount}.`,
		);

		// Validate summary
		assert(!summary.unreferenced, "Root summary should be referenced.");

		assert(
			summary.tree[".metadata"]?.type === SummaryType.Blob,
			"Expected .metadata blob in summary root.",
		);
		const metadata = readBlobContent(summary.tree[".metadata"].content) as Record<
			string,
			unknown
		>;
		assert(
			metadata.summaryFormatVersion === 1,
			"Metadata blob should have summaryFormatVersion 1",
		);
		assert(
			metadata.disableIsolatedChannels === undefined,
			"Unexpected metadata blob disableIsolatedChannels",
		);

		const channelsTree = summary.tree[channelsTreeName];
		assert(channelsTree?.type === SummaryType.Tree, "Expected .channels tree in summary root.");

		const defaultDataStoreNode = channelsTree.tree[defaultDataStore._context.id];
		assert(
			defaultDataStoreNode?.type === SummaryType.Tree,
			"Expected default data store tree in summary.",
		);
		assert(!defaultDataStoreNode.unreferenced, "Default data store should be referenced.");
		assert(
			defaultDataStoreNode.tree[".component"]?.type === SummaryType.Blob,
			"Expected .component blob in default data store summary tree.",
		);
		const dataStoreChannelsTree = defaultDataStoreNode.tree[channelsTreeName];
		const attributes = readBlobContent(
			defaultDataStoreNode.tree[".component"].content,
		) as Record<string, unknown>;
		assert(
			attributes.snapshotFormatVersion === undefined,
			"Unexpected datastore attributes snapshotFormatVersion",
		);
		assert(
			attributes.summaryFormatVersion === 2,
			"Datastore attributes summaryFormatVersion should be 2",
		);
		assert(
			attributes.disableIsolatedChannels === undefined,
			"Unexpected datastore attributes disableIsolatedChannels",
		);
		assert(
			dataStoreChannelsTree?.type === SummaryType.Tree,
			"Expected .channels tree in default data store.",
		);

		const defaultDdsNode = dataStoreChannelsTree.tree.root;
		assert(defaultDdsNode?.type === SummaryType.Tree, "Expected default root DDS in summary.");
		assert(!defaultDdsNode.unreferenced, "Default root DDS should be referenced.");
		assert(
			defaultDdsNode.tree[".attributes"]?.type === SummaryType.Blob,
			"Expected .attributes blob in default root DDS summary tree.",
		);
	});

	it("full initialization of data object should not happen by default", async () => {
		const dataStoreFactory1 = new DataObjectFactory(
			"@fluid-example/test-dataStore1",
			TestDataObject1,
			[],
			[],
		);
		const registryStoreEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[dataStoreFactory1.type, Promise.resolve(dataStoreFactory1)],
		]);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataStoreFactory1,
			registryEntries: registryStoreEntries,
		});

		// Create a container for the first client.
		const container1 = await provider.createContainer(runtimeFactory);
		await assert.doesNotReject(
			container1.getEntryPoint(),
			"Initial creation of container and data store should succeed.",
		);

		// Create a summarizer for the container and do a summary shouldn't throw.
		const createSummarizerResult = await createSummarizerFromFactory(
			provider,
			container1,
			dataStoreFactory1,
			undefined,
			ContainerRuntimeFactoryWithDefaultDataStore,
			registryStoreEntries,
		);
		await assert.doesNotReject(
			summarizeNow(createSummarizerResult.summarizer, "test"),
			"Summarizing should not throw",
		);

		// In summarizer, load the data store should fail.
		await assert.rejects(
			async () => {
				const runtime = (createSummarizerResult.summarizer as any)
					.runtime as ContainerRuntime;
				const dsEntryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
				await dsEntryPoint?.get();
			},
			(e: Error) =>
				e.message ===
				"Non interactive/summarizer client's data object should not be initialized",
			"Loading data store in summarizer did not throw as it should, or threw an unexpected error.",
		);

		// Load second container, load the data store will also call initializingFromExisting and succeed.
		const container2 = await provider.loadContainer(runtimeFactory);
		await assert.doesNotReject(
			container2.getEntryPoint(),
			"Initial creation of container and data store should succeed.",
		);
	});

	/**
	 * This test validates that the first summary for a container by the first summarizer client does not violate
	 * incremental summary principles, i.e. we should not get "IncrementalSummaryViolation" error log.
	 * In the first summary all data stores are summarized because GC hasn't run yet so it has to summarize every data
	 * store to update "unreferenced" flag in its summary.
	 */
	it("should not violate incremental summary principles on first summary", async () => {
		const loader = provider.makeTestLoader(testContainerConfig);
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		const summaryCollection = new SummaryCollection(
			container.deltaManager,
			createChildLogger(),
		);

		const defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		const containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;

		// Create a bunch of data stores before the container is attached so that they are part of the summary that the
		// first summarizer client loads from.
		const dataStore = await containerRuntime.createDataStore(TestDataObjectType);
		const testDataObject = (await dataStore.entryPoint.get()) as ITestDataObject;
		defaultDataStore._root.set("ds2", testDataObject.handle);

		const dataStore2 = await containerRuntime.createDataStore(TestDataObjectType);
		const testDataObject2 = (await dataStore2.entryPoint.get()) as ITestDataObject;
		defaultDataStore._root.set("ds3", testDataObject2.handle);

		const dataStore3 = await containerRuntime.createDataStore(TestDataObjectType);
		const testDataObject3 = (await dataStore3.entryPoint.get()) as ITestDataObject;
		defaultDataStore._root.set("ds4", testDataObject3.handle);

		await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

		await waitForContainerConnection(container);

		// Send an op to trigger summary. We should not get the "IncrementalSummaryViolation" error log.
		defaultDataStore._root.set("key", "value");
		await provider.ensureSynchronized();
		await summaryCollection.waitSummaryAck(container.deltaManager.lastSequenceNumber);
	});
});

describeCompat("Summaries", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	const getTestFn =
		(injectFailure: boolean = false) =>
		async () => {
			const mockLogger = new MockLogger();
			const container = await createContainer(provider, {}, mockLogger);
			const defaultDataStore =
				await getContainerEntryPointBackCompat<ITestDataObject>(container);
			const containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;
			await provider.ensureSynchronized();

			const directory1 = defaultDataStore._root;
			directory1.set("key", "value");
			assert.strictEqual(await directory1.get("key"), "value", "value1 is not set");

			if (injectFailure) {
				// force an exception under containerRuntime.summarize.
				// SummarizeTelemetry event should still be logged
				(containerRuntime as any).summarizerNode = undefined;
			}

			await containerRuntime
				.summarize({
					runGC: false,
					fullTree: false,
					trackState: false,
					summaryLogger: createChildLogger(),
				})
				.catch(() => {});

			const summarizeTelemetryEvents = mockLogger.events.filter(
				(event) =>
					event.eventName === "fluid:telemetry:ContainerRuntime:SummarizeTelemetry",
			);
			assert.strictEqual(
				summarizeTelemetryEvents.length,
				1,
				"There should be exactly one event",
			);

			const parsed = JSON.parse(summarizeTelemetryEvents[0].details as string);
			assert(parsed && typeof parsed === "object", "Should be proper JSON");

			assert.notStrictEqual(
				summarizeTelemetryEvents[0].details,
				"{}",
				"Should not be empty JSON object",
			);
		};

	it("TelemetryContext is populated with data", getTestFn());
	it("TelemetryContext is populated with data even if summarize fails", getTestFn(true));
});

describeCompat("SingleCommit Summaries Tests", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let configForSingleCommitSummary: ITestContainerConfig;
	beforeEach(() => {
		provider = getTestObjectProvider();
		configForSingleCommitSummary = {
			...testContainerConfig,
			loaderProps: {
				...testContainerConfig.loaderProps,
				options: { summarizeProtocolTree: true },
			},
		};
	});

	it("Non single commit summary/Match last summary ackHandle  with current summary parent", async function () {
		if (provider.driver.type === "odsp") {
			this.skip();
		}
		const { summarizer } = await createMainContainerAndSummarizer(provider);

		// Summarize
		const result: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test" });
		const submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		assert(
			submitResult.data.stage === "submit",
			"on-demand summary submitted data stage should be submit",
		);
		assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

		const broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		const ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");
		const summary1AckHandle = ackNackResult.data.summaryAckOp.contents.handle;

		await flushPromises();

		// Second Summary
		const result2: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test2" });
		const submitResult2 = await result2.summarySubmitted;
		assert(submitResult2.success, "on-demand summary2 should submit");
		assert(
			submitResult2.data.stage === "submit",
			"on-demand summary2 submitted data stage should be submit",
		);

		const broadcastResult2 = await result2.summaryOpBroadcasted;
		assert(broadcastResult2.success, "summary op2 should be broadcast");
		const summary2ParentHandle = broadcastResult2.data.summarizeOp.contents.head;
		assert(
			summary2ParentHandle === summary1AckHandle,
			"Summary Parent should match ack handle of previous summary",
		);
	});

	it("Non single commit summary/Last summary should be discarded due to missing SummaryOp", async function () {
		if (provider.driver.type === "odsp") {
			this.skip();
		}
		const { mainContainer, summarizer } = await createMainContainerAndSummarizer(provider);

		// Summarize
		const result: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test" });
		const submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		const broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		const ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");
		const summary1AckHandle = ackNackResult.data.summaryAckOp.contents.handle;
		summarizer.close();
		await flushPromises();

		// Create new summarizer
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			testContainerConfig,
		);

		// Second summary should be discarded
		const containerRuntime = (summarizer2 as any).runtime as ContainerRuntime;
		let uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
		const func = async (summary: ISummaryTree, context: ISummaryContext) => {
			uploadSummaryUploaderFunc = uploadSummaryUploaderFunc.bind(containerRuntime.storage);
			const response = await uploadSummaryUploaderFunc(summary, context);
			// Close summarizer so that it does not submit SummaryOp
			summarizer2.close();
			return response;
		};
		containerRuntime.storage.uploadSummaryWithContext = func;

		const result2: ISummarizeResults = summarizer2.summarizeOnDemand({ reason: "test2" });
		assert((await result2.summarySubmitted).success === false, "Summary should fail");
		await flushPromises();

		// Create new summarizer
		const { summarizer: summarizer3 } = await createSummarizer(
			provider,
			mainContainer,
			testContainerConfig,
		);

		// Summarize third time
		const result3: ISummarizeResults = summarizer3.summarizeOnDemand({ reason: "test3" });
		const submitResult3 = await result3.summarySubmitted;
		assert(submitResult3.success, "on-demand summary3 should submit");
		assert(
			submitResult3.data.stage === "submit",
			"on-demand summary3 submitted data stage should be submit",
		);

		const broadcastResult3 = await result3.summaryOpBroadcasted;
		assert(broadcastResult3.success, "summary op3 should be broadcast");
		const summary3ParentHandle = broadcastResult3.data.summarizeOp.contents.head;
		assert(
			summary3ParentHandle === summary1AckHandle,
			"Summary Parent should match ack handle of summary1",
		);
	});

	it("Single commit summary/Match last summary ackHandle  with current summary parent", async function () {
		if (provider.driver.type !== "odsp") {
			this.skip();
		}

		const { mainContainer, summarizer } = await createMainContainerAndSummarizer(
			provider,
			configForSingleCommitSummary,
		);

		// Summarize
		const result: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test" });
		const submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		assert(
			submitResult.data.stage === "submit",
			"on-demand summary submitted data stage should be submit",
		);

		const broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");
		const summary1ProposedHandle = broadcastResult.data.summarizeOp.contents.handle;

		const ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");
		const summary1AckHandle = ackNackResult.data.summaryAckOp.contents.handle;
		assert(
			summary1ProposedHandle === summary1AckHandle,
			"Summary proposed and ack handle should match",
		);
		summarizer.close();

		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			configForSingleCommitSummary,
		);
		// Second Summary
		const result2: ISummarizeResults = summarizer2.summarizeOnDemand({ reason: "test2" });
		const submitResult2 = await result2.summarySubmitted;
		assert(submitResult2.success, "on-demand summary2 should submit");
		assert(
			submitResult2.data.stage === "submit",
			"on-demand summary2 submitted data stage should be submit",
		);

		const broadcastResult2 = await result2.summaryOpBroadcasted;
		assert(broadcastResult2.success, "summary op2 should be broadcast");
		const summary2ParentHandle = broadcastResult2.data.summarizeOp.contents.head;
		assert(
			summary2ParentHandle === summary1AckHandle,
			"Summary Parent should match ack handle of previous summary",
		);
	});

	it("Single commit summary/Last summary should not be discarded due to missing SummaryOp", async function () {
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
		const { mainContainer, summarizer } = await createMainContainerAndSummarizer(
			provider,
			configForSingleCommitSummary,
		);

		// Summarize
		const result: ISummarizeResults = summarizer.summarizeOnDemand({ reason: "test" });
		const submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		const broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		const ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");
		summarizer.close();

		await flushPromises();

		// Create new summarizer
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			configForSingleCommitSummary,
		);

		let summary2AckHandle: string | undefined;
		// Second summary should be discarded
		const containerRuntime = (summarizer2 as any).runtime as ContainerRuntime;
		let uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
		const func = async (summary: ISummaryTree, context: ISummaryContext) => {
			uploadSummaryUploaderFunc = uploadSummaryUploaderFunc.bind(containerRuntime.storage);
			const response = await uploadSummaryUploaderFunc(summary, context);
			summary2AckHandle = response;
			// Close summarizer so that it does not submit SummaryOp
			summarizer2.close();
			return response;
		};
		containerRuntime.storage.uploadSummaryWithContext = func;

		const result2: ISummarizeResults = summarizer2.summarizeOnDemand({ reason: "test2" });
		assert((await result2.summarySubmitted).success === false, "Summary should fail");
		await flushPromises();

		// Create new summarizer
		const { summarizer: summarizer3 } = await createSummarizer(
			provider,
			mainContainer,
			configForSingleCommitSummary,
		);

		// Summarize third time
		const result3: ISummarizeResults = summarizer3.summarizeOnDemand({
			reason: "test3",
			refreshLatestAck: true,
		});
		const submitResult3 = await result3.summarySubmitted;
		assert(submitResult3.success, "on-demand summary3 should submit");
		assert(
			submitResult3.data.stage === "submit",
			"on-demand summary3 submitted data stage should be submit",
		);

		const broadcastResult3 = await result3.summaryOpBroadcasted;
		assert(broadcastResult3.success, "summary op3 should be broadcast");
		const summary3ParentHandle = broadcastResult3.data.summarizeOp.contents.head;
		assert(
			summary3ParentHandle === summary2AckHandle,
			"Summary Parent should match ack handle of summary2",
		);
	});
});
