/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
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
import { wrapObjectAndOverride } from "../mocking.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat("Refresh serializedStateAttributes", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	const stringId = "sharedStringKey";
	const lots = 30;
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

	const getPendingOps = async (
		args: ITestObjectProvider,
		cb: (container: IContainer, dataStore: ITestFluidObject) => void | Promise<void> = () =>
			undefined,
	) => {
		const container: IContainerExperimental = await args.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container);
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		await args.ensureSynchronized();
		await args.opProcessingController.pauseProcessing(container);
		assert(dataStore.runtime.deltaManager.outbound.paused);

		await cb(container, dataStore);
		
		const pendingState = await container.closeAndGetPendingLocalState?.();
		args.opProcessingController.resumeProcessing();
		assert.ok(pendingState);
		const parsed = JSON.parse(pendingState);
		assert.strictEqual(isIPendingContainerState(parsed), true);

		return {pendingState, parsed};
	};

	const getAttributesFromPendingState = (pending) => {
		const id = pending.baseSnapshot.trees[".protocol"]?.blobs?.attributes;
		const attributes = JSON.parse(pending.snapshotBlobs[id]);
		return attributes as IDocumentAttributes	;
	}

	const assertPendingStateSequence = (pending) => {
		const id = pending.baseSnapshot.trees[".protocol"]?.blobs?.attributes;
		const attributes = JSON.parse(pending.snapshotBlobs[id]);
		const snapshotSequenceNumber = attributes.sequenceNumber;
		const firstSavedOpSequenceNumber = pending.savedOps[0].sequenceNumber;
		assert.strictEqual(firstSavedOpSequenceNumber, snapshotSequenceNumber + 1, "discontinuity between snapshot ops and saved ops");
	}

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
		string1.insertText(0, "hello");

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

	it("validates pending and saved ops", async function () {
		await provider.opProcessingController.pauseProcessing(container1);
		string1.insertText(0, "world ");
		const containerStateString = await container1.closeAndGetPendingLocalState?.();
		assert(containerStateString);
		const containerState = JSON.parse(containerStateString);
		const pendingOps = containerState.pendingRuntimeState.pending.pendingStates;
		assert.strictEqual(pendingOps.length, 2); // hello and world
		const savedOps = containerState.savedOps.filter((op) => op.type === "op");
		assert.strictEqual(savedOps.length, 0);
		const container2: IContainerExperimental = await loader.resolve(
			{ url },
			containerStateString,
		);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		await provider.opProcessingController.pauseProcessing(container2);
		string2.insertText(0, "how are you ");
		const containerStateString2 = await container2.closeAndGetPendingLocalState?.();
		provider.opProcessingController.resumeProcessing();
		assert(containerStateString2);
		const containerState2 = JSON.parse(containerStateString2);
		const pendingOps2 = containerState2.pendingRuntimeState.pending.pendingStates;
		assert.strictEqual(pendingOps2.length, 3); // hello, world and how are you
		const savedOps2 = containerState2.savedOps.filter((op) => op.type === "op");
		assert.strictEqual(savedOps2.length, 2); // hello and world
		const container3: IContainerExperimental = await loader.resolve(
			{ url },
			containerStateString2,
		);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container3);
		await provider.ensureSynchronized();
		assert.strictEqual(string3.getText(), "how are you world hello");
		const containerStateString3 = await container3.closeAndGetPendingLocalState?.();
		assert(containerStateString3);
		const containerState3 = JSON.parse(containerStateString3);
		assert.strictEqual(containerState3.pendingRuntimeState, undefined);
		const savedOps3 = containerState3.savedOps.filter((op) => op.type === "op");
		assert.strictEqual(savedOps3.length, 3); // how are you, world and hello
	});

	it("snapshot seq number is one below the first saved op", async function () {
		// to not use an empty base snapshot for container2
		string1.insertText(0, "world");
		string1.insertText(0, "hello ");
		string1.insertText(0, "hi ");
		await waitForSummary();
		await provider.ensureSynchronized();
		const container2: IContainerExperimental = await loader.resolve({ url });
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		// to have savedOps in the stashed container
		string2.insertText(0, "1");
		string1.insertText(0, "2");
		string2.insertText(0, "3");
		string1.insertText(0, "4");
		await provider.ensureSynchronized();

		const containerStateString2 = await container2.closeAndGetPendingLocalState?.();
		assert(containerStateString2);
		assertPendingStateSequence(JSON.parse(containerStateString2));
	});

	it("refresh the base snapshot at loading", async function () {
		// to not use an empty base snapshot for container2
		string1.insertText(0, "a");
		await waitForSummary();
		await provider.ensureSynchronized();
		const container2: IContainerExperimental = await loader.resolve({ url });
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);

		// to have more savedOps in the stashed container
		string2.insertText(0, "CCC");
		string2.insertText(0, "DDD");
		await provider.ensureSynchronized();

		const containerStateString2 = await container2.closeAndGetPendingLocalState?.();
		assert(containerStateString2);
		const containerState2 = JSON.parse(containerStateString2);
		assertPendingStateSequence(containerState2);

		const baseSnapshotAttibutes2 = getAttributesFromPendingState(containerState2);
		assert.strictEqual(
			baseSnapshotAttibutes2.sequenceNumber,
			containerState2.savedOps[0].sequenceNumber - 1,
		);
		// send ops and summarize after stashing
		string1.insertText(0, "EEE");
		await waitForSummary();
		// send another op just to check it works with saved ops after summarize
		string1.insertText(0, "FFF");
		await provider.ensureSynchronized();
		const container3: IContainerExperimental = await loader.resolve(
			{ url },
			containerStateString2,
		);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container3);
		string1.insertText(0, "GGG");
		await provider.ensureSynchronized();
		// no corruption after "coming back online" and ops were sent in the meanwhile
		assert.strictEqual(string1.getText(), string3.getText());
		const containerStateString3 = await container3.closeAndGetPendingLocalState?.();
		const containerState3 = JSON.parse(containerStateString3 as string);

		const baseSnapshotAttibutes3 = getAttributesFromPendingState(containerState3);
		// the base snapshot was refreshed. sequenceNumber would be the same in case we don't
		assert(baseSnapshotAttibutes2.sequenceNumber < baseSnapshotAttibutes3.sequenceNumber);
		assert.strictEqual(
			baseSnapshotAttibutes3.sequenceNumber,
			containerState3.savedOps[0].sequenceNumber - 1,
		);
		const container4: IContainerExperimental = await loader.resolve(
			{ url },
			containerStateString3,
		);
		const dataStore4 = (await container4.getEntryPoint()) as ITestFluidObject;
		const string4 = await dataStore4.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container4);
		// all correct after applying a stashed container with a refresh snapshot
		assert.strictEqual(string1.getText(), string4.getText());
	});

	it("works with summary while offline", async function () {
		for (let i = 0; i < 5; i++) {
			string1.insertText(string1.getLength(), `a `);
		}
		await waitForSummary();

		for (let i = 5; i < 10; i++) {
			string1.insertText(string1.getLength(), `b `);
		}
		const pendingOps = await getPendingOps(provider, async (c, d) => {
			const string = await d.getSharedObject<SharedString>(stringId);
			string.insertText(string.getLength(), `st `);
		});
		const pendingOpsSnapAtt = getAttributesFromPendingState(pendingOps.parsed);

		for (let i = 0; i < 10; i++) {
			string1.insertText(string1.getLength(), `c `);
		}
		await waitForSummary();
		for (let i = 0; i < 5; i++) {
			string1.insertText(string1.getLength(), `d `);
		}
		await provider.ensureSynchronized();
		for (let i = 5; i < 100; i++) {
			string1.insertText(string1.getLength(), `e `);
		}
		// load container with pending ops, which should resend the op not sent by previous container
		const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps.pendingState);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		// console.log(string1.getText());
		// console.log(string2.getText());
		for (let i = 5; i < 10; i++) {
			string2.insertText(string1.getLength(), `t `);
		}
		await provider.ensureSynchronized();
		for (let i = 5; i < 10; i++) {
			string1.insertText(string1.getLength(), `s `);
		}
		const containerStateString2 = await container2.closeAndGetPendingLocalState?.();
		const parsed2 = JSON.parse(containerStateString2 as string);
		const att2 = getAttributesFromPendingState(parsed2);
		// console.log(att2);
		const container3: IContainerExperimental = await loader.resolve(
			{ url },
			containerStateString2,
		);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container3);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), string3.getText());
		console.log(string1.getText());
		console.log(string2.getText());
		console.log(string3.getText());
	});

	it("can summarize while offline and refresh", async function () {
		const pendingOps = await getPendingOps(provider, async (c, d) => {
			const string = await d.getSharedObject<SharedString>(stringId);
			string.insertText(string.getLength(), ` a`);
		});

		const attributes = getAttributesFromPendingState(pendingOps.parsed);
		console.log(attributes);
		string1.insertText(string1.getLength(), " b");
		await waitForSummary();

		const container2 = await loadOffline(provider, { url }, pendingOps.pendingState);
		const dataStore2 = (await container2.container.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);

		// pending changes should be applied
		assert.strictEqual(string2.getText(), "hello a");

		// make more changes while offline
		string2.insertText(string2.getLength(), ` c`);

		container2.connect();
		await waitForContainerConnection(container2.container);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "hello a c b");
		assert.strictEqual(string2.getText(), "hello a c b");
		const pendingState2 = await container2.container.closeAndGetPendingLocalState?.();
		assert.ok(pendingState2);
		const attributes2 = getAttributesFromPendingState(JSON.parse(pendingState2));
		console.log(attributes2);
		const container3: IContainerExperimental = await loader.resolve({ url }, pendingState2);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const string3 = await dataStore3.getSharedObject<SharedString>(stringId);
		assert.strictEqual(string3.getText(), "hello a c b");
	});
});
