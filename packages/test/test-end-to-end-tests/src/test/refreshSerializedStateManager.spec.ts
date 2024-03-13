/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IHostLoader } from "@fluidframework/container-definitions";
import type { SharedString } from "@fluidframework/sequence";
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	ITestContainerConfig,
	ITestObjectProvider,
	DataObjectFactoryType,
	createAndAttachContainer,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainerExperimental } from "@fluidframework/container-loader";
import { Deferred } from "@fluidframework/core-utils";
import { ConfigTypes, IConfigProviderBase, IRequest } from "@fluidframework/core-interfaces";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
// eslint-disable-next-line import/no-internal-modules
import { IPendingContainerState } from "@fluidframework/container-loader/test/container";
import { wrapObjectAndOverride } from "../mocking.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat("Refresh serializedStateAttributes", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	const stringId = "sharedStringKey";
	const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						maxTime: 5000 * 12,
						maxAckWaitTime: 120000,
						maxOps: 1,
						initialSummarizerDelayMs: 20,
					},
				},
			},
			enableRuntimeIdCompressor: true,
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	const isIPendingContainerState = (c: any) => {
		if (
			c?.baseSnapshot === undefined ||
			c?.snapshotBlobs === undefined ||
			c?.url === undefined
		) {
			return false;
		}
		return true;
	};

	const getPendingState = async (
		args: ITestObjectProvider,
		savedOps: (string1: SharedString) => Promise<void>,
		pendingOps: (string1: SharedString) => Promise<void>,
	) => {
		const container: IContainerExperimental = await args.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container);
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const string = await dataStore.getSharedObject<SharedString>(stringId);

		await savedOps(string);
		await args.ensureSynchronized();
		await args.opProcessingController.pauseProcessing(container);
		assert(dataStore.runtime.deltaManager.outbound.paused);
		await pendingOps(string);

		const pendingState = await container.closeAndGetPendingLocalState?.();
		args.opProcessingController.resumeProcessing();
		assert.ok(pendingState);
		const parsed = JSON.parse(pendingState);
		assert.strictEqual(isIPendingContainerState(parsed), true);

		return { pendingState, parsed };
	};

	const getAndAssertAttributes = (pending: string | IPendingContainerState) => {
		const parsed = typeof pending === "string" ? JSON.parse(pending) : pending;
		const id = parsed.baseSnapshot.trees[".protocol"]?.blobs?.attributes;
		const attributes = JSON.parse(parsed.snapshotBlobs[id]);
		const snapshotSequenceNumber = attributes.sequenceNumber;
		const firstSavedOpSequenceNumber = parsed.savedOps[0].sequenceNumber;
		assert.strictEqual(
			firstSavedOpSequenceNumber,
			snapshotSequenceNumber + 1,
			"discontinuity between snapshot ops and saved ops",
		);
		return attributes as IDocumentAttributes;
	};

	async function loadOffline(
		testObjectProvider: ITestObjectProvider,
		request: IRequest,
		pendingLocalState?: string,
	): Promise<{ container: IContainerExperimental; connect: () => void }> {
		const p = new Deferred();

		const documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
			provider.documentServiceFactory,
			{
				createDocumentService: {
					connectToDeltaStream: (_ds) => async (client) => {
						await p.promise;
						return _ds.connectToDeltaStream(client);
					},
					connectToDeltaStorage: (_ds) => async () => {
						await p.promise;
						return _ds.connectToDeltaStorage();
					},
					connectToStorage: (_ds) => async () => {
						await p.promise;
						return _ds.connectToStorage();
					},
				},
			},
		);
		const offloader = testObjectProvider.createLoader(
			[
				[
					testObjectProvider.defaultCodeDetails,
					testObjectProvider.createFluidEntryPoint(testContainerConfig),
				],
			],
			{ ...testContainerConfig.loaderProps, documentServiceFactory },
		);
		const container = await offloader.resolve(request, pendingLocalState);
		return { container, connect: () => p.resolve(undefined) };
	}

	let provider: ITestObjectProvider;
	let url;
	let loader: IHostLoader;
	let container1: IContainerExperimental;
	let string1: SharedString;
	let waitForSummary: () => Promise<void>;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		loader = provider.makeTestLoader(testContainerConfig);
		container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		url = await container1.getAbsoluteUrl("");
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		string1 = await dataStore1.getSharedObject<SharedString>(stringId);
		// string1.insertText(0, "hello");

		waitForSummary = async () => {
			await new Promise<void>((resolve, reject) => {
				let summarized = false;
				container1.on("op", (op) => {
					if (op.type === "summarize") {
						summarized = true;
					} else if (summarized && op.type === "summaryAck") {
						resolve();
					} else if (op.type === "summaryNack") {
						reject(new Error("summaryNack"));
					}
				});
			});
		};
	});

	it("validates pending and saved ops with initial snapshot", async function () {
		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(0, "hello ");
				s.insertText(s.getLength(), "world ");
			},
			async (s) => {
				s.insertText(s.getLength(), "how");
			},
		);
		const attributes = getAndAssertAttributes(pendingState.parsed);
		// sequenceNumber 0 = attach snapshot
		assert.strictEqual(attributes.sequenceNumber, 0);
		const savedOps = pendingState.parsed.savedOps.filter((op) => op.type === "op");
		assert.strictEqual(savedOps.length, 2);
		const pendingOps = pendingState.parsed.pendingRuntimeState.pending.pendingStates;
		assert.strictEqual(pendingOps.length, 3); // pending ops include saved ops
		const container2: IContainerExperimental = await loader.resolve(
			{ url },
			pendingState.pendingState,
		);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string2.getText(), "hello world how");
	});

	it("validates pending and saved ops with load snapshot", async function () {
		// to not use an empty base snapshot for container2
		string1.insertText(0, "hello ");
		await waitForSummary();
		await provider.ensureSynchronized();

		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(s.getLength(), "world ");
			},
			async (s) => {
				s.insertText(s.getLength(), "how");
			},
		);
		const attributes = getAndAssertAttributes(pendingState.parsed);
		// loaded snapshot
		assert.strictEqual(attributes.sequenceNumber, 3);
		const container2: IContainerExperimental = await loader.resolve(
			{ url },
			pendingState.pendingState,
		);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await provider.ensureSynchronized();
		assert.strictEqual(string2.getText(), "hello world how");
	});

	it("resolve with same snapshot as before", async function () {
		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(s.getLength(), "a");
				s.insertText(s.getLength(), "b");
			},
			async (s) => {
				s.insertText(s.getLength(), "c");
			},
		);
		getAndAssertAttributes(pendingState.parsed);

		const attributes = getAndAssertAttributes(pendingState.parsed);

		const container2: IContainerExperimental = await loader.resolve(
			{ url },
			pendingState.pendingState,
		);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		const pendingState2 = await container2.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);

		const attributes2 = getAndAssertAttributes(pendingState2);

		// no new summary generated since first stashing
		assert(attributes.sequenceNumber === attributes2.sequenceNumber);

		const container4: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore4 = (await container4.getEntryPoint()) as ITestFluidObject;
		const string4 = await dataStore4.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container4);
		assert.strictEqual(string1.getText(), string4.getText());
		assert.strictEqual(string1.getText(), "abc");
	});

	it("refresh the base snapshot at loading", async function () {
		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(s.getLength(), "a");
				// new summary, will fetch new snapshot at resolve
				await waitForSummary();
				s.insertText(s.getLength(), "b");
			},
			async (s) => {
				s.insertText(s.getLength(), "c");
			},
		);
		const attributes = getAndAssertAttributes(pendingState.parsed);

		const container2: IContainerExperimental = await loader.resolve(
			{ url },
			pendingState.pendingState,
		);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		const pendingState2 = await container2.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);
		const attributes2 = getAndAssertAttributes(pendingState2);

		// the base snapshot was refreshed. sequenceNumber would be the same in case we haven't
		assert(attributes.sequenceNumber < attributes2.sequenceNumber);

		const container3: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container3);
		// all correct after applying a stashed container with a refresh snapshot
		assert.strictEqual(string1.getText(), string3.getText());
		assert.strictEqual(string1.getText(), "abc");
	});

	it("refresh the base snapshot while summary offline", async function () {
		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(s.getLength(), "a");
				s.insertText(s.getLength(), "b");
			},
			async (s) => {
				s.insertText(s.getLength(), "c");
			},
		);
		assert.strictEqual(string1.getText(), "ab");
		const attributes = getAndAssertAttributes(pendingState.parsed);

		// ops and summaries being generated after getting pending state
		// new summary will make resolve to fetch a different snapshot
		string1.insertText(string1.getLength(), "d");
		await waitForSummary();
		string1.insertText(string1.getLength(), "e");
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "abde");

		// should apply pending op and move base snapshot forward
		const container2: IContainerExperimental = await loader.resolve(
			{ url },
			pendingState.pendingState,
		);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string2.getText(), "abcde");

		string2.insertText(string1.getLength(), "f");
		const pendingState2 = await container2.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);
		const attributes2 = getAndAssertAttributes(pendingState2);
		// the base snapshot was refreshed. sequenceNumber would be the same in case we haven't
		assert(attributes.sequenceNumber < attributes2.sequenceNumber);

		const container3: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container3);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), string3.getText());
		assert.strictEqual(string3.getText(), "abcdef");
	});

	it("can load offline", async function () {
		const pendingOps = await getPendingState(
			provider,
			async (s) => {},
			async (s) => {
				s.insertText(s.getLength(), ` a`);
			},
		);
		const attributes = getAndAssertAttributes(pendingOps.parsed);
		string1.insertText(string1.getLength(), " b");
		await waitForSummary();

		const container2 = await loadOffline(provider, { url }, pendingOps.pendingState);
		const dataStore2 = (await container2.container.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);

		// pending changes should be applied
		assert.strictEqual(string2.getText(), " a");

		// make more changes while offline
		string2.insertText(string2.getLength(), ` c`);

		container2.connect();
		await waitForContainerConnection(container2.container);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), " a c b");
		assert.strictEqual(string2.getText(), " a c b");
		const pendingState2 = await container2.container.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);
		const attributes2 = getAndAssertAttributes(pendingState2);
		// the base snapshot was refreshed. sequenceNumber would be the same in case we haven't
		assert(attributes.sequenceNumber < attributes2.sequenceNumber);
		const container3: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		assert.strictEqual(string3.getText(), " a c b");
	});

	it("does not refresh on snapshot fetch failure", async () => {
		let failSnapshot = false;
		(provider as any)._documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
			provider.documentServiceFactory,
			{
				createDocumentService: {
					connectToStorage: {
						getSnapshotTree: (dss) => async () => {
							if (failSnapshot) {
								throw new Error("fake error");
							}
							return dss.getSnapshotTree();
						},
					},
				},
			},
		);
		const wrapLoader = provider.makeTestLoader(testContainerConfig);
		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(s.getLength(), "a");
			},
			async (s) => {
				s.insertText(s.getLength(), "b");
			},
		);
		const attributes = getAndAssertAttributes(pendingState.parsed);
		failSnapshot = true;
		const container2: IContainerExperimental = await wrapLoader.resolve(
			{ url },
			pendingState.pendingState,
		);
		await waitForContainerConnection(container2);
		const pendingState2 = await container2.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);
		const attributes2 = getAndAssertAttributes(pendingState2);
		// the base snapshot was not refreshed due to fetch failure but pending state was applied.
		assert(attributes.sequenceNumber === attributes2.sequenceNumber);
		const container3: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		assert.strictEqual(string3.getText(), "ab");
	});

	it("refresh only while processing new ops", async () => {
		let failSnapshot = false;
		(provider as any)._documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
			provider.documentServiceFactory,
			{
				createDocumentService: {
					connectToStorage: {
						getSnapshotTree: (dss) => async () => {
							if (failSnapshot) {
								throw new Error("fake error");
							}
							return dss.getSnapshotTree();
						},
					},
				},
			},
		);
		const wrapLoader = provider.makeTestLoader(testContainerConfig);
		const pendingState = await getPendingState(
			provider,
			async (s) => {
				s.insertText(s.getLength(), "a");
			},
			async (s) => {
				s.insertText(s.getLength(), "b");
			},
		);
		const attributes = getAndAssertAttributes(pendingState.parsed);
		failSnapshot = true;
		const container2: IContainerExperimental = await wrapLoader.resolve(
			{ url },
			pendingState.pendingState,
		);
		await waitForContainerConnection(container2);
		failSnapshot = false;
		// bunch of ops to trigger refreshAttributes at addProcessedOps time.
		for (let i = 0; i < 50; i++) {
			string1.insertText(string1.getLength(), "c");
			string1.removeText(string1.getLength() - 1, string1.getLength());
		}
		await provider.ensureSynchronized();
		const pendingState2 = await container2.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);

		const attributes2 = getAndAssertAttributes(pendingState2);
		// the base snapshot was not refreshed at loading but refreshed while processing new ops
		assert(attributes.sequenceNumber < attributes2.sequenceNumber);
		const container3: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		assert.strictEqual(string3.getText(), "ab");
	});
});
