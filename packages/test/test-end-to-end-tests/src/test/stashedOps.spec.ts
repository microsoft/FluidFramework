/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
import { ISharedDirectory, SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import {
	ReferenceType,
	reservedMarkerIdKey,
	reservedMarkerSimpleTypeKey,
	reservedTileLabelsKey,
} from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { getTextAndMarkers, SharedString } from "@fluidframework/sequence";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	ITestContainerConfig,
	ITestObjectProvider,
	DataObjectFactoryType,
	createAndAttachContainer,
	createDocumentId,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { ConnectionState, IContainerExperimental } from "@fluidframework/container-loader";
import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { Deferred } from "@fluidframework/core-utils";
import { IRequest, IRequestHeader } from "@fluidframework/core-interfaces";
import {
	ContainerMessageType,
	ContainerRuntimeMessage,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

const mapId = "map";
const stringId = "sharedStringKey";
const cellId = "cellKey";
const counterId = "counterKey";
const directoryId = "directoryKey";
const registry: ChannelFactoryRegistry = [
	[mapId, SharedMap.getFactory()],
	[stringId, SharedString.getFactory()],
	[cellId, SharedCell.getFactory()],
	[counterId, SharedCounter.getFactory()],
	[directoryId, SharedDirectory.getFactory()],
];

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

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

const lots = 30;
const testKey = "test key";
const testKey2 = "another test key";
const testValue = "test value";
const testIncrementValue = 5;

type SharedObjCallback = (
	container: IContainer,
	dataStore: ITestFluidObject,
) => void | Promise<void>;

// load container, pause, create (local) ops from callback, then optionally send ops before closing container
const getPendingOps = async (
	args: ITestObjectProvider,
	send: boolean,
	cb: SharedObjCallback = () => undefined,
) => {
	const container: IContainerExperimental = await args.loadTestContainer(testContainerConfig);
	await waitForContainerConnection(container);
	const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");

	[...Array(lots).keys()].map((i) =>
		dataStore.root.set(`make sure csn is > 1 so it doesn't hide bugs ${i}`, i),
	);

	await args.ensureSynchronized();
	await args.opProcessingController.pauseProcessing(container);
	assert(dataStore.runtime.deltaManager.outbound.paused);

	await cb(container, dataStore);

	let pendingState: string | undefined;
	if (send) {
		pendingState = await container.getPendingLocalState?.();
		await args.ensureSynchronized();
		container.close();
	} else {
		pendingState = await container.closeAndGetPendingLocalState?.();
	}

	args.opProcessingController.resumeProcessing();

	assert.ok(pendingState);
	return pendingState;
};

async function waitForDataStoreRuntimeConnection(runtime: IFluidDataStoreRuntime): Promise<void> {
	if (!runtime.connected) {
		const executor: any = (resolve) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			runtime.once("connected", () => resolve());
		};

		return new Promise(executor);
	}
}

async function loadOffline(
	provider: ITestObjectProvider,
	request: IRequest,
	pendingLocalState?: string,
): Promise<{ container: IContainerExperimental; connect: () => void }> {
	const p = new Deferred();
	const documentServiceFactory = provider.driver.createDocumentServiceFactory();

	// patch document service methods to simulate offline by not resolving until we choose to
	const boundFn = documentServiceFactory.createDocumentService.bind(documentServiceFactory);
	documentServiceFactory.createDocumentService = async (...args) => {
		const docServ = await boundFn(...args);
		const boundCTDStream = docServ.connectToDeltaStream.bind(docServ);
		docServ.connectToDeltaStream = async (...args2) => {
			await p.promise;
			return boundCTDStream(...args2);
		};
		const boundCTDStorage = docServ.connectToDeltaStorage.bind(docServ);
		docServ.connectToDeltaStorage = async (...args2) => {
			await p.promise;
			return boundCTDStorage(...args2);
		};
		const boundCTStorage = docServ.connectToStorage.bind(docServ);
		docServ.connectToStorage = async (...args2) => {
			await p.promise;
			return boundCTStorage(...args2);
		};

		return docServ;
	};
	const loader = provider.createLoader(
		[[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
		{ ...testContainerConfig.loaderProps, documentServiceFactory },
	);
	const container = await loader.resolve(
		request,
		pendingLocalState ?? (await getPendingOps(provider, false)),
	);
	return { container, connect: () => p.resolve(undefined) };
}

// Introduced in 0.37
// REVIEW: enable compat testing
describeNoCompat("stashed ops", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let url;
	let loader: IHostLoader;
	let container1: IContainerExperimental;
	let map1: SharedMap;
	let string1: SharedString;
	let cell1: SharedCell;
	let counter1: SharedCounter;
	let directory1: ISharedDirectory;
	let waitForSummary: () => Promise<void>;

	beforeEach(async () => {
		provider = getTestObjectProvider();
		loader = provider.makeTestLoader(testContainerConfig);
		container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		url = await container1.getAbsoluteUrl("");
		const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		map1 = await dataStore1.getSharedObject<SharedMap>(mapId);
		cell1 = await dataStore1.getSharedObject<SharedCell>(cellId);
		counter1 = await dataStore1.getSharedObject<SharedCounter>(counterId);
		directory1 = await dataStore1.getSharedObject<SharedDirectory>(directoryId);
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

	it("resends op", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.set(testKey, testValue);
			const cell = await d.getSharedObject<SharedCell>(cellId);
			cell.set(testValue);
			const counter = await d.getSharedObject<SharedCounter>(counterId);
			counter.increment(testIncrementValue);
			const directory = await d.getSharedObject<SharedDirectory>(directoryId);
			directory.set(testKey, testValue);

			// Submit a message with an unrecognized type
			// Super rare corner case where you stash an op and then roll back to a previous runtime version that doesn't recognize it
			(
				d.context.containerRuntime as unknown as {
					submit: (containerRuntimeMessage: ContainerRuntimeMessage) => void;
				}
			).submit({
				type: "FUTURE_TYPE" as ContainerMessageType,
				contents: "Hello",
				compatDetails: { behavior: "Ignore" },
			});
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<SharedCell>(cellId);
		const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
		const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
		assert.strictEqual(cell1.get(), testValue);
		assert.strictEqual(cell2.get(), testValue);
		assert.strictEqual(counter1.value, testIncrementValue);
		assert.strictEqual(counter2.value, testIncrementValue);
		assert.strictEqual(directory1.get(testKey), testValue);
		assert.strictEqual(directory2.get(testKey), testValue);
	});

	it("resends compressed Ids and correctly assumes session", async function () {
		let mapCompressedId;
		let cellCompressedId;
		let directoryCompressedId;

		let mapDecompressedId;
		let cellDecompressedId;
		let directoryDecompressedId;

		let sessionId;

		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			assert((map as any).runtime.idCompressor !== undefined);
			mapCompressedId = (map as any).runtime.idCompressor.generateCompressedId();
			mapDecompressedId = (map as any).runtime.idCompressor.decompress(mapCompressedId);
			map.set(mapDecompressedId, testValue);
			const cell = await d.getSharedObject<SharedCell>(cellId);
			assert((cell as any).runtime.idCompressor !== undefined);
			cellCompressedId = (cell as any).runtime.idCompressor.generateCompressedId();
			cellDecompressedId = (cell as any).runtime.idCompressor.decompress(cellCompressedId);
			cell.set(cellDecompressedId);
			const directory = await d.getSharedObject<SharedDirectory>(directoryId);
			assert((directory as any).runtime.idCompressor !== undefined);
			directoryCompressedId = (directory as any).runtime.idCompressor.generateCompressedId();
			directoryDecompressedId = (directory as any).runtime.idCompressor.decompress(
				directoryCompressedId,
			);
			directory.set(directoryDecompressedId, testValue);

			// All will have the same sessionId, it doesn't matter which DDS I use
			sessionId = (map as any).runtime.idCompressor.localSessionId;
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<SharedCell>(cellId);
		const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);
		assert((map2 as any).runtime.idCompressor !== undefined);
		assert((cell2 as any).runtime.idCompressor !== undefined);
		assert((directory2 as any).runtime.idCompressor !== undefined);
		await waitForContainerConnection(container2, true);
		await provider.ensureSynchronized();

		// Loaded container should reassume the state of the stashed compressor - so same sessionId as before
		const runtimeIdCompressor = (map2 as any).runtime.dataStoreContext.idCompressor;
		const dataStoreIdCompressor = (map2 as any).runtime.idCompressor;
		assert.strictEqual(
			runtimeIdCompressor.localSessionId,
			dataStoreIdCompressor.localSessionId,
		);
		assert.strictEqual(sessionId, (map2 as any).runtime.idCompressor.localSessionId);
		assert.strictEqual(sessionId, (cell2 as any).runtime.idCompressor.localSessionId);
		assert.strictEqual(sessionId, (directory2 as any).runtime.idCompressor.localSessionId);
		assert.strictEqual(
			(map2 as any).runtime.idCompressor.recompress(mapDecompressedId),
			mapCompressedId,
		);
		assert.strictEqual(
			(cell2 as any).runtime.idCompressor.recompress(cellDecompressedId),
			cellCompressedId,
		);
		assert.strictEqual(
			(directory2 as any).runtime.idCompressor.recompress(directoryDecompressedId),
			directoryCompressedId,
		);

		assert.strictEqual(map1.get(mapDecompressedId), testValue);
		assert.strictEqual(map2.get(mapDecompressedId), testValue);
		assert.strictEqual(cell1.get(), cellDecompressedId);
		assert.strictEqual(cell2.get(), cellDecompressedId);
		assert.strictEqual(directory1.get(directoryDecompressedId), testValue);
		assert.strictEqual(directory2.get(directoryDecompressedId), testValue);
	});

	it("connects in write mode and resends op when loaded with no delta connection", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.set(testKey, testValue);
			const cell = await d.getSharedObject<SharedCell>(cellId);
			cell.set(testValue);
			const counter = await d.getSharedObject<SharedCounter>(counterId);
			counter.increment(testIncrementValue);
			const directory = await d.getSharedObject<SharedDirectory>(directoryId);
			directory.set(testKey, testValue);
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const headers: IRequestHeader = { [LoaderHeader.loadMode]: { deltaConnection: "none" } };
		const container2 = await loader.resolve({ url, headers }, pendingOps);
		container2.connect();
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<SharedCell>(cellId);
		const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
		const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
		assert.strictEqual(cell1.get(), testValue);
		assert.strictEqual(cell2.get(), testValue);
		assert.strictEqual(counter1.value, testIncrementValue);
		assert.strictEqual(counter2.value, testIncrementValue);
		assert.strictEqual(directory1.get(testKey), testValue);
		assert.strictEqual(directory2.get(testKey), testValue);
	});

	it("doesn't resend successful op", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.set(testKey, "something unimportant");
			const cell = await d.getSharedObject<SharedCell>(cellId);
			cell.set("something unimportant");
			const counter = await d.getSharedObject<SharedCounter>(counterId);
			counter.increment(3);
			const directory = await d.getSharedObject<SharedDirectory>(directoryId);
			directory.set(testKey, "I will be erased");
		});

		map1.set(testKey, testValue);
		cell1.set(testValue);
		counter1.increment(testIncrementValue);
		directory1.set(testKey, testValue);
		await provider.ensureSynchronized();

		// load with pending ops, which it should not resend because they were already sent successfully
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<SharedCell>(cellId);
		const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
		const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);

		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
		assert.strictEqual(cell1.get(), testValue);
		assert.strictEqual(cell2.get(), testValue);
		assert.strictEqual(counter1.value, testIncrementValue + 3);
		assert.strictEqual(counter2.value, testIncrementValue + 3);
		assert.strictEqual(directory1.get(testKey), testValue);
		assert.strictEqual(directory2.get(testKey), testValue);
	});

	it("resends delete op and can set after", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.delete("clear");
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.has("clear"), false);
		assert.strictEqual(map2.has("clear"), false);
		map1.set("clear", "test1");
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get("clear"), "test1");
		assert.strictEqual(map2.get("clear"), "test1");
	});

	it("resends a lot of ops", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
		});

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		[...Array(lots).keys()].map((i) =>
			assert.strictEqual(
				map1.get(i.toString()),
				i,
				`map 1 ${map1.get(i.toString())} !== ${i}`,
			),
		);
		[...Array(lots).keys()].map((i) =>
			assert.strictEqual(
				map2.get(i.toString()),
				i,
				`map 2 ${map2.get(i.toString())} !== ${i}`,
			),
		);
	});

	it("doesn't resend a lot of successful ops", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
		});

		// send a bunch from first container that should not be overwritten
		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
		await provider.ensureSynchronized();

		// load container with pending ops, which should not resend the ops sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		[...Array(lots).keys()].map((i) => assert.strictEqual(map1.get(i.toString()), testValue));
		[...Array(lots).keys()].map((i) => assert.strictEqual(map2.get(i.toString()), testValue));
	});

	it("resends all shared directory ops", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const directory = await d.getSharedObject<SharedDirectory>(directoryId);
			directory.set("key1", "value1");
			directory.set("key2", "value2");
			directory.createSubDirectory("subdir1");
			directory.createSubDirectory("subdir2");
			directory.delete("key2");
			directory.deleteSubDirectory("subdir2");
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(directory1.get("key1"), "value1");
		assert.strictEqual(directory2.get("key1"), "value1");
		assert.strictEqual(directory1.get("key2"), undefined);
		assert.strictEqual(directory2.get("key2"), undefined);
		assert.strictEqual(directory1.getSubDirectory("subdir1")?.absolutePath, "/subdir1");
		assert.strictEqual(directory2.getSubDirectory("subdir1")?.absolutePath, "/subdir1");
		assert.strictEqual(directory1.getSubDirectory("subdir2"), undefined);
		assert.strictEqual(directory2.getSubDirectory("subdir2"), undefined);
	});

	it("resends batched ops", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			(c as any).runtime.orderSequentially(() => {
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			});
		});

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		[...Array(lots).keys()].map((i) =>
			assert.strictEqual(
				map1.get(i.toString()),
				i,
				`map 1 ${map1.get(i.toString())} !== ${i}`,
			),
		);
		[...Array(lots).keys()].map((i) =>
			assert.strictEqual(
				map2.get(i.toString()),
				i,
				`map 2 ${map2.get(i.toString())} !== ${i}`,
			),
		);
	});

	it("doesn't resend successful batched ops", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			(c as any).runtime.orderSequentially(() => {
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			});
		});

		// send a bunch from first container that should not be overwritten
		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));

		// load container with pending ops, which should not resend the ops sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await provider.ensureSynchronized();
		[...Array(lots).keys()].map((i) => assert.strictEqual(map1.get(i.toString()), testValue));
		[...Array(lots).keys()].map((i) => assert.strictEqual(map2.get(i.toString()), testValue));
	});

	it("resends chunked op", async function () {
		const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.set(testKey, bigString);
		});

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(
			map1.get(testKey),
			bigString,
			`map 1 ${map1.get(testKey)} !== ${bigString}`,
		);
		assert.strictEqual(
			map2.get(testKey),
			bigString,
			`map 2 ${map2.get(testKey)} !== ${bigString}`,
		);
	});

	it("doesn't resend successful chunked op", async function () {
		const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.set(testKey, bigString);
			map.set(testKey2, bigString);
		});

		// set on first container which should not be overwritten
		map1.set(testKey, testValue);
		map1.set(testKey2, testValue);

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
		assert.strictEqual(map1.get(testKey2), testValue);
		assert.strictEqual(map2.get(testKey2), testValue);
	});

	it("pending map clear resend", async function () {
		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
		await provider.ensureSynchronized();

		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.clear();
		});

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		[...Array(lots).keys()].map(async (i) =>
			assert.strictEqual(map1.get(i.toString()), undefined),
		);
		[...Array(lots).keys()].map(async (i) =>
			assert.strictEqual(map2.get(i.toString()), undefined),
		);
	});

	it("successful map clear no resend", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.clear();
		});

		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
		await provider.ensureSynchronized();

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		await Promise.all(
			[...Array(lots).keys()].map(async (i) =>
				assert.strictEqual(await map1.get(i.toString()), testValue),
			),
		);
		await Promise.all(
			[...Array(lots).keys()].map(async (i) =>
				assert.strictEqual(await map2.get(i.toString()), testValue),
			),
		);
	});

	it("resends string insert op", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.insertText(s.getLength(), " world!");
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "hello world!");
		assert.strictEqual(string2.getText(), "hello world!");
	});

	it("doesn't resend successful string insert op", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.insertText(s.getLength(), " world!");
		});

		// load with pending ops, which it should not resend because they were already sent successfully
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "hello world!");
		assert.strictEqual(string2.getText(), "hello world!");
	});

	it("resends string remove op", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.removeText(0, s.getLength());
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "");
		assert.strictEqual(string2.getText(), "");
	});

	it("doesn't resend successful string remove op", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.removeText(0, s.getLength());
		});

		string1.insertText(0, "goodbye cruel world");

		// load with pending ops, which it should not resend because they were already sent successfully
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "goodbye cruel world");
		assert.strictEqual(string2.getText(), "goodbye cruel world");
	});

	it("resends string annotate op", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.annotateRange(0, s.getLength(), { bold: true });
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getPropertiesAtPosition(0)?.bold, true);
		assert.strictEqual(string2.getPropertiesAtPosition(0)?.bold, true);
	});

	it("doesn't resend successful string annotate op", async function () {
		const pendingOps = await getPendingOps(provider, true, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.annotateRange(0, s.getLength(), { bold: true });
		});

		// change annotation, which should not be overwritten by successful stashed ops
		string1.annotateRange(0, string1.getLength(), { bold: false });

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getPropertiesAtPosition(0)?.bold, false);
		assert.strictEqual(string2.getPropertiesAtPosition(0)?.bold, false);
	});

	it("resends marker ops", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const s = await d.getSharedObject<SharedString>(stringId);
			s.insertMarker(s.getLength(), ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
				[reservedMarkerSimpleTypeKey]: "markerKeyValue",
			});

			s.insertMarker(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: ["tileLabel"],
				[reservedMarkerIdKey]: "tileMarkerId",
			});
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();

		const simpleMarker1 = string1.getMarkerFromId("markerId");

		assert.strictEqual(simpleMarker1?.type, "Marker", "Could not get simple marker");
		assert.strictEqual(
			simpleMarker1?.properties?.markerId,
			"markerId",
			"markerId is incorrect",
		);
		assert.strictEqual(simpleMarker1?.properties?.markerSimpleType, "markerKeyValue");
		const parallelMarkers1 = getTextAndMarkers(string1, "tileLabel");
		const parallelMarker1 = parallelMarkers1.parallelMarkers[0];
		assert.strictEqual(parallelMarker1.type, "Marker", "Could not get tile marker");
		assert.strictEqual(
			parallelMarker1.properties?.markerId,
			"tileMarkerId",
			"tile markerId is incorrect",
		);

		const simpleMarker2 = string2.getMarkerFromId("markerId");
		assert.strictEqual(simpleMarker2?.type, "Marker", "Could not get simple marker");
		assert.strictEqual(
			simpleMarker2?.properties?.markerId,
			"markerId",
			"markerId is incorrect",
		);
		assert.strictEqual(simpleMarker2?.properties?.markerSimpleType, "markerKeyValue");
		const parallelMarkers2 = getTextAndMarkers(string2, "tileLabel");
		const parallelMarker2 = parallelMarkers2.parallelMarkers[0];
		assert.strictEqual(parallelMarker2.type, "Marker", "Could not get tile marker");
		assert.strictEqual(
			parallelMarker2.properties?.markerId,
			"tileMarkerId",
			"tile markerId is incorrect",
		);
	});

	it("resends attach op", async function () {
		const newMapId = "newMap";
		let id;
		const pendingOps = await getPendingOps(provider, false, async (container, d) => {
			const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
			const runtime = defaultDataStore.context.containerRuntime;

			const router = await runtime.createDataStore(["default"]);
			const dataStore: ITestFluidObject = await requestFluidObject<ITestFluidObject>(
				router,
				"/",
			);
			id = dataStore.context.id;

			const channel = dataStore.runtime.createChannel(
				newMapId,
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			((await channel.handle.get()) as SharedObject).bindToContext();
			defaultDataStore.root.set("someDataStore", dataStore.handle);
			(channel as SharedMap).set(testKey, testValue);
		});

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);

		// get new datastore from first container
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container1, id);
		const map2 = await requestFluidObject<SharedMap>(dataStore2.runtime, newMapId);
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("doesn't resend successful attach op", async function () {
		const newMapId = "newMap";
		const pendingOps = await getPendingOps(provider, true, async (container, d) => {
			const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
			const runtime = defaultDataStore.context.containerRuntime;

			const router = await runtime.createDataStore(["default"]);
			const dataStore = await requestFluidObject<ITestFluidObject>(router, "/");

			const channel = dataStore.runtime.createChannel(
				newMapId,
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			((await channel.handle.get()) as SharedObject).bindToContext();
			defaultDataStore.root.set("someDataStore", dataStore.handle);
			(channel as SharedMap).set(testKey, testValue);
		});

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);
	});

	it("resends DDS attach op", async function () {
		const newMapId = "newMap";
		const pendingOps = await getPendingOps(provider, false, async (_, dataStore) => {
			const channel = dataStore.runtime.createChannel(
				newMapId,
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			((await channel.handle.get()) as SharedObject).bindToContext();
			assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
			(channel as SharedMap).set(testKey, testValue);
		});

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);

		// get new DDS from first container
		await provider.ensureSynchronized();
		const dataStore1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		const map2 = await requestFluidObject<SharedMap>(dataStore1.runtime, newMapId);
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("handles stashed ops for local DDS", async function () {
		const newCounterId = "newCounter";
		const container = (await provider.loadTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;
		const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");

		await provider.opProcessingController.pauseProcessing(container);

		// create new DDS
		const channel = defaultDataStore.runtime.createChannel(
			newCounterId,
			"https://graph.microsoft.com/types/counter",
		);
		assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");
		((await channel.handle.get()) as SharedObject).bindToContext();
		assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");

		// op referencing new DDS is submitted at some later time (not in the same JS turn, so not batched)
		await Promise.resolve();
		(channel as SharedCounter).increment(0);
		const stashP = new Promise<string>((resolve) => {
			container.on("op", (op) => {
				// Stash right after we see the DDS attach op. If we stash the DDS attach op, it will be applied
				// first and everything will work fine. If ops are arriving on the network, there's no guarantee
				// of how small this window is.
				if (JSON.stringify(op).includes("attach")) {
					(container as any).processRemoteMessage = (message) => null;
					const pendingStateP = container.closeAndGetPendingLocalState?.();
					assert.ok(pendingStateP);
					resolve(pendingStateP);
				}
			});
		});
		provider.opProcessingController.resumeProcessing(container);
		const stashedOps = await stashP;

		// when this container tries to apply the stashed DDS op, it will not have replayed the DDS attach
		// op yet, because the reference sequence number of the DDS op is lower than the sequence number
		// of the attach op
		const container2 = await loader.resolve({ url }, stashedOps);
		await waitForContainerConnection(container2);
	});

	it("handles stashed ops created on top of sequenced local ops", async function () {
		const container = (await provider.loadTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;
		const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
		const string = await defaultDataStore.getSharedObject<SharedString>(stringId);

		await provider.ensureSynchronized();
		await provider.opProcessingController.pauseProcessing(container);

		// generate local op
		assert.strictEqual(string.getText(), "hello");
		string.insertText(5, "; long amount of text that will produce a high index");

		// op is submitted on top of first op at some later time (not in the same JS turn, so not batched)
		await Promise.resolve();
		string.insertText(string.getLength(), ", for testing purposes");
		assert.strictEqual(
			string.getText(),
			"hello; long amount of text that will produce a high index, for testing purposes",
		);

		const stashP = new Promise<string>((resolve) => {
			container.on("op", (op) => {
				// Stash right after we see the first op. If we stash the first op, it will be applied
				// first and everything will work fine. If ops are arriving on the network, there's no guarantee
				// of how small this window is.
				if (op.clientId === container.clientId) {
					// hacky; but we need to make sure we don't process further ops
					(container as any).processRemoteMessage = (message) => null;
					const pendingStateP = container.closeAndGetPendingLocalState?.();
					assert.ok(pendingStateP);
					resolve(pendingStateP);
				}
			});
		});
		provider.opProcessingController.resumeProcessing(container);
		const stashedOps = await stashP;

		// when this container tries to apply the second op, it will not have replayed the first
		// op yet, because the reference sequence number of the second op is lower than the sequence number
		// of the first op
		const container2 = await loader.resolve({ url }, stashedOps);
		const defaultDataStore2 = await requestFluidObject<ITestFluidObject>(container2, "/");
		const string2 = await defaultDataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		assert.strictEqual(
			string2.getText(),
			"hello; long amount of text that will produce a high index, for testing purposes",
		);
		await provider.ensureSynchronized();
		assert.strictEqual(string2.getText(), string1.getText());
	});

	itExpects(
		"waits for previous container's leave message",
		[
			{ eventName: "fluid:telemetry:Container:connectedStateRejected" },
			{ eventName: "fluid:telemetry:Container:WaitBeforeClientLeave_end" },
		],
		async () => {
			const container: IContainerExperimental = await provider.loadTestContainer(
				testContainerConfig,
			);
			const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
			// Force to write mode to get a leave message
			dataStore.root.set("forceWrite", true);
			await provider.ensureSynchronized();

			const serializedClientId = container.clientId;
			assert.ok(serializedClientId);

			await provider.opProcessingController.pauseProcessing(container);
			assert(dataStore.runtime.deltaManager.outbound.paused);

			[...Array(lots).keys()].map((i) => dataStore.root.set(`test op #${i}`, i));

			const pendingState = await container.getPendingLocalState?.();

			const container2 = await loader.resolve({ url }, pendingState);

			const connectP = new Promise<void>((resolve, reject) => {
				container2.on("connected", () => {
					if (container2.getQuorum().getMember(serializedClientId) === undefined) {
						resolve();
					} else {
						reject(new Error("connected while previous client in quorum"));
					}
				});
			});

			// wait for the join message so we see connectedStateRejected
			if (container2.connectionState !== ConnectionState.CatchingUp) {
				await new Promise((resolve) => container2.deltaManager.on("connect", resolve));
			}

			container.close();
			await connectP;
		},
	);

	it("can make changes offline and resubmit them", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
		});

		const container2 = await loadOffline(provider, { url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(
			container2.container,
			"default",
		);
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

		// pending changes should be applied
		[...Array(lots).keys()].map((i) =>
			assert.strictEqual(
				map2.get(i.toString()),
				i,
				`map 2 ${map2.get(i.toString())} !== ${i}`,
			),
		);
		// make more changes while offline
		[...Array(lots).keys()].map((i) => map2.set((i + lots).toString(), i + lots));

		container2.connect();
		await waitForContainerConnection(container2.container);
		await provider.ensureSynchronized();
		[...Array(lots * 2).keys()].map((i) =>
			assert.strictEqual(
				map1.get(i.toString()),
				i,
				`map 1 ${map1.get(i.toString())} !== ${i}`,
			),
		);
		[...Array(lots * 2).keys()].map((i) =>
			assert.strictEqual(
				map2.get(i.toString()),
				i,
				`map 2 ${map2.get(i.toString())} !== ${i}`,
			),
		);
	});

	it("can make changes offline and stash them", async function () {
		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
		});

		const container2 = await loadOffline(provider, { url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(
			container2.container,
			"default",
		);
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

		// pending changes should be applied
		[...Array(lots).keys()].map((i) =>
			assert.strictEqual(
				map2.get(i.toString()),
				i,
				`map 2 ${map2.get(i.toString())} !== ${i}`,
			),
		);
		// make more changes while offline
		[...Array(lots).keys()].map((i) => map2.set((i + lots).toString(), i + lots));

		// get stashed ops from this container without connecting
		const morePendingOps = await container2.container.closeAndGetPendingLocalState?.();

		const container3 = await loadOffline(provider, { url }, morePendingOps);
		const dataStore3 = await requestFluidObject<ITestFluidObject>(
			container3.container,
			"default",
		);
		const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);

		// pending changes from both containers should be applied
		[...Array(lots * 2).keys()].map((i) =>
			assert.strictEqual(
				map3.get(i.toString()),
				i,
				`map 3 ${map2.get(i.toString())} !== ${i}`,
			),
		);
		// make more changes while offline
		[...Array(lots).keys()].map((i) => map3.set((i + lots * 2).toString(), i + lots * 2));

		container3.connect();
		await waitForContainerConnection(container3.container);
		await provider.ensureSynchronized();
		[...Array(lots * 3).keys()].map((i) =>
			assert.strictEqual(
				map1.get(i.toString()),
				i,
				`map 1 ${map1.get(i.toString())} !== ${i}`,
			),
		);
		[...Array(lots * 3).keys()].map((i) =>
			assert.strictEqual(
				map3.get(i.toString()),
				i,
				`map 3 ${map3.get(i.toString())} !== ${i}`,
			),
		);
	});

	itExpects(
		"waits for previous container's leave message after rehydration",
		[
			{ eventName: "fluid:telemetry:Container:connectedStateRejected" },
			{ eventName: "fluid:telemetry:Container:WaitBeforeClientLeave_end" },
		],
		async () => {
			const pendingOps = await getPendingOps(provider, false, async (c, d) => {
				const map = await d.getSharedObject<SharedMap>(mapId);
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			});

			const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps);
			const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
			const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
			await waitForContainerConnection(container2);
			const serializedClientId = container2.clientId;
			assert.ok(serializedClientId);
			await provider.ensureSynchronized();
			[...Array(lots).keys()].map((i) =>
				assert.strictEqual(
					map1.get(i.toString()),
					i,
					`map 1 ${map1.get(i.toString())} !== ${i}`,
				),
			);
			[...Array(lots).keys()].map((i) =>
				assert.strictEqual(
					map2.get(i.toString()),
					i,
					`map 2 ${map2.get(i.toString())} !== ${i}`,
				),
			);

			await provider.opProcessingController.pauseProcessing(container2);
			assert(dataStore2.runtime.deltaManager.outbound.paused);
			[...Array(lots).keys()].map((i) => map2.set((i + lots).toString(), i + lots));

			const morePendingOps = await container2.getPendingLocalState?.();
			assert.ok(morePendingOps);

			const container3 = await loader.resolve({ url }, morePendingOps);

			const connectP = new Promise<void>((resolve, reject) => {
				container3.on("connected", () => {
					if (container3.getQuorum().getMember(serializedClientId) === undefined) {
						resolve();
					} else {
						reject(new Error("connected while previous client in quorum"));
					}
				});
			});

			// wait for the join message so we see connectedStateRejected
			if (container3.connectionState !== ConnectionState.CatchingUp) {
				await new Promise((resolve) => container3.deltaManager.on("connect", resolve));
			}

			container2.close();
			await connectP;
		},
	);

	it("offline blob upload", async function () {
		const container = await loadOffline(provider, { url });
		const dataStore = await requestFluidObject<ITestFluidObject>(
			container.container,
			"default",
		);
		const map = await dataStore.getSharedObject<SharedMap>(mapId);

		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		container.connect();
		await waitForContainerConnection(container.container);

		const handle = await handleP;
		assert.strictEqual(bufferToString(await handle.get(), "utf8"), "blob contents");
		map.set("blob handle", handle);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

		await provider.ensureSynchronized();
		assert.strictEqual(
			bufferToString(await map2.get("blob handle").get(), "utf8"),
			"blob contents",
		);
	});

	it("close while uploading blob", async function () {
		const dataStore = await requestFluidObject<ITestFluidObject>(container1, "default");
		const map = await dataStore.getSharedObject<SharedMap>(mapId);
		await provider.ensureSynchronized();

		const blobP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		const pendingOpsP = container1.closeAndGetPendingLocalState?.();
		const handle = await blobP;
		map.set("blob handle", handle);
		const pendingOps = await pendingOpsP;

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);

		await provider.ensureSynchronized();
		assert.strictEqual(
			bufferToString(await map1.get("blob handle").get(), "utf8"),
			"blob contents",
		);
		assert.strictEqual(
			bufferToString(await map2.get("blob handle").get(), "utf8"),
			"blob contents",
		);
	});

	it("close while uploading multiple blob", async function () {
		const dataStore = await requestFluidObject<ITestFluidObject>(container1, "default");
		const map = await dataStore.getSharedObject<SharedMap>(mapId);
		await provider.ensureSynchronized();

		const blobP1 = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 1", "utf8"));
		const blobP2 = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 2", "utf8"));
		const blobP3 = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 3", "utf8"));
		const pendingOpsP = container1.closeAndGetPendingLocalState?.();
		map.set("blob handle 1", await blobP1);
		map.set("blob handle 2", await blobP2);
		map.set("blob handle 3", await blobP3);
		const pendingOps = await pendingOpsP;

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await provider.ensureSynchronized();
		for (let i = 1; i <= 3; i++) {
			assert.strictEqual(
				bufferToString(await map1.get(`blob handle ${i}`).get(), "utf8"),
				`blob contents ${i}`,
			);
			assert.strictEqual(
				bufferToString(await map2.get(`blob handle ${i}`).get(), "utf8"),
				`blob contents ${i}`,
			);
		}
	});

	it("load offline with blob redirect table", async function () {
		// upload blob offline so an entry is added to redirect table
		const container = await loadOffline(provider, { url });
		const dataStore = await requestFluidObject<ITestFluidObject>(
			container.container,
			"default",
		);
		const map = await dataStore.getSharedObject<SharedMap>(mapId);

		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		container.connect();
		const handle = await handleP;
		map.set("blob handle", handle);
		assert.strictEqual(bufferToString(await handle.get(), "utf8"), "blob contents");

		// wait for summary with redirect table
		await provider.ensureSynchronized();
		await waitForSummary();

		// should be able to load entirely offline
		const stashBlob = await getPendingOps(provider, true);
		await loadOffline(provider, { url }, stashBlob);
	});

	it("stashed changes with blobs", async function () {
		const container = await loadOffline(provider, { url });
		const dataStore = await requestFluidObject<ITestFluidObject>(
			container.container,
			"default",
		);
		const map = await dataStore.getSharedObject<SharedMap>(mapId);

		// Call uploadBlob() while offline to get local ID handle, and generate an op referencing it
		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 1", "utf8"));
		const stashedChangesP = container.container.closeAndGetPendingLocalState?.();
		const handle = await handleP;
		map.set("blob handle 1", handle);

		const stashedChanges = await stashedChangesP;

		const container3 = await loader.resolve({ url }, stashedChanges);
		const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
		const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);

		await provider.ensureSynchronized();

		// Blob is uploaded and accessible by all clients
		assert.strictEqual(
			bufferToString(await map1.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
		assert.strictEqual(
			bufferToString(await map3.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
	});

	it("not expired stashed blobs", async function () {
		if (provider.driver.type === "tinylicious" || provider.driver.type === "t9s") {
			this.skip();
		}
		const container = await loadOffline(provider, { url });
		const dataStore = await requestFluidObject<ITestFluidObject>(
			container.container,
			"default",
		);
		const map = await dataStore.getSharedObject<SharedMap>(mapId);

		// Call uploadBlob() while offline to get local ID handle, and generate an op referencing it
		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 1", "utf8"));

		container.connect();
		await waitForDataStoreRuntimeConnection(dataStore.runtime);

		const stashedChangesP = container.container.closeAndGetPendingLocalState?.();
		const handle = await handleP;
		map.set("blob handle 1", handle);
		const stashedChanges = await stashedChangesP;
		assert.ok(stashedChanges);
		const parsedChanges = JSON.parse(stashedChanges);
		const pendingBlobs = parsedChanges.pendingRuntimeState.pendingAttachmentBlobs;
		// verify we have a blob in pending upload array
		assert.strictEqual(Object.keys(pendingBlobs).length, 1, "no pending blob");

		const container3 = await loadOffline(provider, { url }, stashedChanges);
		const dataStore3 = await requestFluidObject<ITestFluidObject>(
			container3.container,
			"default",
		);
		const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
		container3.connect();
		await waitForContainerConnection(container3.container, true);
		await provider.ensureSynchronized();

		// Blob is uploaded and accessible by all clients
		assert.strictEqual(
			bufferToString(await map1.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
		assert.strictEqual(
			bufferToString(await map3.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
	});

	it("offline attach", async function () {
		const newMapId = "newMap";
		let id;
		// stash attach op
		const pendingOps = await getPendingOps(provider, false, async (container, d) => {
			const defaultDataStore = await requestFluidObject<ITestFluidObject>(container, "/");
			const runtime = defaultDataStore.context.containerRuntime;

			const router = await runtime.createDataStore(["default"]);
			const dataStore = await requestFluidObject<ITestFluidObject>(router, "/");
			id = dataStore.context.id;

			const channel = dataStore.runtime.createChannel(
				newMapId,
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			((await channel.handle.get()) as SharedObject).bindToContext();
			defaultDataStore.root.set("someDataStore", dataStore.handle);
			(channel as SharedMap).set(testKey, testValue);
		});

		// load offline; new datastore should be accessible
		const container2 = await loadOffline(provider, { url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2.container, id);
		const map2 = await requestFluidObject<SharedMap>(dataStore2.runtime, newMapId);
		assert.strictEqual(map2.get(testKey), testValue);
		map2.set(testKey2, testValue);

		container2.connect();
		await waitForContainerConnection(container2.container);

		// get new datastore from first container
		const dataStore3 = await requestFluidObject<ITestFluidObject>(container1, id);
		const map3 = await requestFluidObject<SharedMap>(dataStore3.runtime, newMapId);
		await provider.ensureSynchronized();
		assert.strictEqual(map3.get(testKey), testValue);
		assert.strictEqual(map3.get(testKey2), testValue);
	});

	it("works for detached container", async function () {
		const loader2 = provider.makeTestLoader(testContainerConfig);
		const detachedContainer: IContainerExperimental = await loader2.createDetachedContainer(
			provider.defaultCodeDetails,
		);
		const dataStore = await requestFluidObject<ITestFluidObject>(detachedContainer, "default");
		const map = await dataStore.getSharedObject<SharedMap>(mapId);
		map.set(testKey, testValue);

		await detachedContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
		const pendingOps = await detachedContainer.closeAndGetPendingLocalState?.();

		const url2 = await detachedContainer.getAbsoluteUrl("");
		assert.ok(url2);
		const container2 = await loader2.resolve({ url: url2 }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("works for rehydrated container", async function () {
		const loader2 = provider.makeTestLoader(testContainerConfig);
		const detachedContainer = await loader2.createDetachedContainer(
			provider.defaultCodeDetails,
		);
		const dataStore = await requestFluidObject<ITestFluidObject>(detachedContainer, "default");
		const map = await dataStore.getSharedObject<SharedMap>(mapId);
		map.set(testKey, testValue);

		const summary = detachedContainer.serialize();
		detachedContainer.close();
		const rehydratedContainer: IContainerExperimental =
			await loader2.rehydrateDetachedContainerFromSnapshot(summary);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(
			rehydratedContainer,
			"default",
		);
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		map2.set(testKey2, testValue);

		await rehydratedContainer.attach(
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		const pendingOps = await rehydratedContainer.closeAndGetPendingLocalState?.();

		const url2 = await rehydratedContainer.getAbsoluteUrl("");
		assert.ok(url2);

		const container3 = await loader2.resolve({ url: url2 }, pendingOps);
		const dataStore3 = await requestFluidObject<ITestFluidObject>(container3, "default");
		const map3 = await dataStore3.getSharedObject<SharedMap>(mapId);
		assert.strictEqual(map3.get(testKey), testValue);
		assert.strictEqual(map3.get(testKey2), testValue);
	});

	// TODO: https://github.com/microsoft/FluidFramework/issues/10729
	it("works with summary while offline", async function () {
		map1.set("test op 1", "test op 1");
		await waitForSummary();

		const pendingOps = await getPendingOps(provider, false, async (c, d) => {
			const map = await d.getSharedObject<SharedMap>(mapId);
			map.set(testKey, testValue);
		});

		map1.set("test op 2", "test op 2");
		await waitForSummary();

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
	});

	// TODO: https://github.com/microsoft/FluidFramework/issues/10729
	it("can stash between summary op and ack", async function () {
		map1.set("test op 1", "test op 1");
		const container: IContainerExperimental = await provider.loadTestContainer(
			testContainerConfig,
		);
		const pendingOps = await new Promise<string | undefined>((resolve, reject) =>
			container.on("op", (op) => {
				if (op.type === "summarize") {
					resolve(container.closeAndGetPendingLocalState?.());
				}
			}),
		);
		assert.ok(pendingOps);

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
	});

	it("get pending state without close resends ops", async () => {
		const container = (await provider.loadTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;

		// pause outgoing ops so we can detect dropped stashed changes
		await container.deltaManager.outbound.pause();
		let pendingState: string | undefined;
		let pendingStateP;
		const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
		const map = await dataStore.getSharedObject<SharedMap>(mapId);
		for (let i = 5; i--; ) {
			map.set(`${i}`, `${i}`);
			container.disconnect();
			container.connect();
			pendingStateP = await new Promise<string>((resolve) => {
				container.once("connected", (clientId: string) => resolve(clientId));
			}).then(async (clientId: string) => {
				pendingState = await container.getPendingLocalState?.();
				assert(typeof pendingState === "string");

				// the pending data in the stash blob may not have changed, but the clientId should match our new
				// clientId, which will now be used to attempt to resubmit pending changes
				assert.strictEqual(clientId, JSON.parse(pendingState).clientId);

				return pendingState;
			});
		}
		pendingState = await pendingStateP;
		container.close();
		// no pending changes went through
		for (let i = 5; i--; ) {
			assert.strictEqual(map1.get(`${i}`), undefined);
		}

		const container2 = await loader.resolve({ url }, pendingState);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await provider.ensureSynchronized();
		for (let i = 5; i--; ) {
			// local value is what we expect
			assert.strictEqual(map2.get(`${i}`), `${i}`);
			// remote value is what we expect
			assert.strictEqual(map1.get(`${i}`), `${i}`);
		}
	});

	it("get pending state without close doesn't duplicate ops", async () => {
		const container = (await provider.loadTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;

		let pendingState;
		let pendingStateP;

		const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
		const counter = await dataStore.getSharedObject<SharedCounter>(counterId);
		for (let i = 5; i--; ) {
			counter.increment(1);
			container.disconnect();
			container.connect();
			pendingStateP = await new Promise<string>((resolve) => {
				container.once("connected", (clientId: string) => resolve(clientId));
			}).then(async (clientId: string) => {
				pendingState = await container.getPendingLocalState?.();
				assert(typeof pendingState === "string");

				// the pending data in the stash blob may not have changed, but the clientId should match our new
				// clientId, which will now be used to attempt to resubmit pending changes
				assert.strictEqual(clientId, JSON.parse(pendingState).clientId);

				return pendingState;
			});
		}
		pendingState = await pendingStateP;
		container.close();

		// because the event listener was always refreshing pendingState on "connected", the stash blob
		// should be safe to use
		const container2 = await loader.resolve({ url }, pendingState);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
		await provider.ensureSynchronized();
		// local value is what we expect
		assert.strictEqual(counter2.value, 5);
		// remote value is what we expect
		assert.strictEqual(counter1.value, 5);
	});
});

describeNoCompat("stashed ops", (getTestObjectProvider) => {
	it("handles stashed ops with reference sequence number of 0", async function () {
		const provider2 = getTestObjectProvider();
		const loader2 = provider2.makeTestLoader(testContainerConfig);
		const container: IContainerExperimental = await createAndAttachContainer(
			provider2.defaultCodeDetails,
			loader2,
			provider2.driver.createCreateNewRequest(createDocumentId()),
		);

		await provider2.ensureSynchronized();
		const url = await container.getAbsoluteUrl("");
		assert(url, "no url");
		container.disconnect();

		const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
		const map = await dataStore.getSharedObject<SharedMap>(mapId);
		map.set(testKey, testValue);
		const pendingOps = await container.closeAndGetPendingLocalState?.();
		assert.ok(pendingOps);
		// make sure we got stashed ops with refseqnum === 0, otherwise we are not testing the scenario we want to
		assert(/referenceSequenceNumber[^\w,}]*0/.test(pendingOps));

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader2.resolve({ url }, pendingOps);
		const dataStore2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const map2 = await dataStore2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(container2, true);
		await provider2.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});
});
