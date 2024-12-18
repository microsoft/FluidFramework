/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import {
	IContainer,
	IHostLoader,
	LoaderHeader,
	type ILoaderHeader,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	CompressionAlgorithms,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntimeWithResolveHandle_Deprecated } from "@fluidframework/container-runtime-definitions/internal";
import {
	ConfigTypes,
	IConfigProviderBase,
	IRequest,
	IRequestHeader,
} from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { SharedCounter } from "@fluidframework/counter/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	ISharedDirectory,
	SharedDirectory,
	ISharedMap,
} from "@fluidframework/map/internal";
import {
	ReferenceType,
	reservedMarkerIdKey,
	reservedMarkerSimpleTypeKey,
	reservedTileLabelsKey,
} from "@fluidframework/merge-tree/internal";
import { toDeltaManagerInternal } from "@fluidframework/runtime-utils/internal";
import type {
	IIntervalCollection,
	SequenceInterval,
	SharedString,
} from "@fluidframework/sequence/internal";
import { SharedObject } from "@fluidframework/shared-object-base/internal";
import {
	ChannelFactoryRegistry,
	createSummarizer,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createAndAttachContainer,
	createDocumentId,
	summarizeNow,
	timeoutPromise,
	waitForContainerConnection,
	timeoutAwait,
	toIDeltaManagerFull,
} from "@fluidframework/test-utils/internal";
import { SchemaFactory, ITree, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

import { wrapObjectAndOverride } from "../mocking.js";

const mapId = "map";
const stringId = "sharedStringKey";
const cellId = "cellKey";
const counterId = "counterKey";
const directoryId = "directoryKey";
const collectionId = "collectionKey";
const treeId = "treeKey";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const lots = 30;
const testKey = "test key";
const testKey2 = "another test key";
const testValue = "test value";
const testIncrementValue = 5;
const testStart = 0;
const testEnd = 3;

type SharedObjCallback = (
	container: IContainer,
	dataStore: ITestFluidObject,
) => void | Promise<void>;

/**
 * load container, pause, create (local) ops from callback, then optionally send ops before closing container
 */
const getPendingOps = async (
	testContainerConfig: ITestContainerConfig,
	testObjectProvider: ITestObjectProvider,
	send: false | true | "afterReconnect",
	cb: SharedObjCallback = () => undefined,
) => {
	const container: IContainerExperimental =
		await testObjectProvider.loadTestContainer(testContainerConfig);
	await waitForContainerConnection(container);
	const dataStore = (await container.getEntryPoint()) as ITestFluidObject;

	[...Array(lots).keys()].map((i) =>
		dataStore.root.set(`make sure csn is > 1 so it doesn't hide bugs ${i}`, i),
	);

	await testObjectProvider.ensureSynchronized();
	await testObjectProvider.opProcessingController.pauseProcessing(container);
	const deltaManagerInternal = toIDeltaManagerFull(
		toDeltaManagerInternal(dataStore.runtime.deltaManager),
	);
	assert(deltaManagerInternal.outbound.paused);

	await cb(container, dataStore);

	let pendingState: string | undefined;
	if (send === true) {
		pendingState = await container.getPendingLocalState?.();
		await testObjectProvider.ensureSynchronized(); // Note: This will resume processing to get synchronized
		container.close();
	} else if (send === "afterReconnect") {
		pendingState = await container.getPendingLocalState?.();
		container.disconnect();
		container.connect();
		await testObjectProvider.ensureSynchronized(); // Note: This will have a different clientId than in pendingState
		container.close();
	} else {
		pendingState = await container.closeAndGetPendingLocalState?.();
	}

	testObjectProvider.opProcessingController.resumeProcessing();

	assert.ok(pendingState);
	return pendingState;
};

/**
 * Load a Container using testContainerConfig and the given testObjectProvider,
 * Deferring connection to the service until the returned connect function is called
 * (simulating returning from offline)
 *
 * @param testObjectProvider - For accessing Loader/Driver
 * @param request - Request to use when loading
 * @param pendingLocalState - (Optional) custom PendingLocalState to load from. Defaults to using getPendingOps helper if omitted.
 * @returns A container instance with a connect function to unblock the Driver (simulating coming back from offline)
 */
async function loadOffline(
	testContainerConfig: ITestContainerConfig,
	testObjectProvider: ITestObjectProvider,
	request: IRequest,
	pendingLocalState?: string,
): Promise<{ container: IContainerExperimental; connect: () => void }> {
	const p = new Deferred();
	// This documentServiceFactory will wait for the promise p to resolve before connecting to the service
	const documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
		testObjectProvider.documentServiceFactory,
		{
			createDocumentService: {
				connectToDeltaStream: (ds) => async (client) => {
					await p.promise;
					return ds.connectToDeltaStream(client);
				},
				connectToDeltaStorage: (ds) => async () => {
					await p.promise;
					return ds.connectToDeltaStorage();
				},
				connectToStorage: (ds) => async () => {
					await p.promise;
					return ds.connectToStorage();
				},
			},
		},
	);

	const loader = testObjectProvider.createLoader(
		[
			[
				testObjectProvider.defaultCodeDetails,
				testObjectProvider.createFluidEntryPoint(testContainerConfig),
			],
		],
		{ ...testContainerConfig.loaderProps, documentServiceFactory },
	);
	const container = await loader.resolve(
		request,
		pendingLocalState ??
			(await getPendingOps(testContainerConfig, testObjectProvider, false /* send */)),
	);
	return { container, connect: () => p.resolve(undefined) };
}

const assertIntervals = (
	sharedString: SharedString,
	intervalCollection: IIntervalCollection<SequenceInterval>,
	expected: readonly { start: number; end: number }[],
	validateOverlapping: boolean = true,
) => {
	const actual = Array.from(intervalCollection);
	if (validateOverlapping && sharedString.getLength() > 0) {
		const overlapping = intervalCollection.findOverlappingIntervals(
			0,
			sharedString.getLength() - 1,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
	}
	assert.strictEqual(
		actual.length,
		expected.length,
		`findOverlappingIntervals() must return the expected number of intervals`,
	);

	const actualPos = actual.map((interval) => {
		assert(interval);
		const start = sharedString.localReferencePositionToPosition(interval.start);
		const end = sharedString.localReferencePositionToPosition(interval.end);
		return { start, end };
	});
	assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

/**
 * Waits for a summary op and ack to be seen.
 *
 * Manually summarizes the container
 *
 * @param container - A container, just for the purpose of creating a summarizing container.
 * @returns A promise that resolves when a summary op and ack is received.
 */
const waitForSummary = async (
	provider: ITestObjectProvider,
	container: IContainer,
	testContainerConfig: ITestContainerConfig,
) => {
	const testConfig = {
		...testContainerConfig,
		runtimeOptions: { ...testContainerConfig.runtimeOptions, summaryOptions: undefined },
	};
	const { summarizer, container: summarizingContainer } = await createSummarizer(
		provider,
		container,
		testConfig,
	);
	await summarizeNow(summarizer);
	summarizingContainer.close();
};
// Introduced in 0.37
// REVIEW: enable compat testing
describeCompat("stashed ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedDirectory, SharedCounter, SharedString, SharedCell } = apis.dds;
	const { getTextAndMarkers } = apis.dataRuntime.packages.sequence;

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[stringId, SharedString.getFactory()],
		[cellId, SharedCell.getFactory()],
		[counterId, SharedCounter.getFactory()],
		[directoryId, SharedDirectory.getFactory()],
		[treeId, SharedTree.getFactory()],
	];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: {
			chunkSizeInBytes: Number.POSITIVE_INFINITY, // disable
			compressionOptions: {
				minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			enableRuntimeIdCompressor: "on",
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
				"Fluid.Sequence.intervalStickinessEnabled": true,
			}),
		},
	};

	const sf = new SchemaFactory("stashedTests");

	class Root extends sf.object("Root", {
		map: sf.map(sf.string),
	}) {}

	const treeConfig = new TreeViewConfiguration({ schema: Root });

	interface MinimalMap {
		get(key: string): string | undefined;
		set(key: string, value: string): void;
		has(key: string): boolean;
		delete(key: string): void;
	}

	async function getMapBackedMap(d: ITestFluidObject): Promise<MinimalMap> {
		return d.getSharedObject<ISharedMap>(mapId);
	}

	async function getTreeBackedMap(d: ITestFluidObject): Promise<MinimalMap> {
		const tree = await d.getSharedObject<ITree>(treeId);
		const view = tree.viewWith(treeConfig);
		if (view.compatibility.canInitialize) {
			view.initialize({ map: new Map<string, string>() });
		}
		return view.root.map;
	}

	async function getMapFromProvider(
		getMap: (t: ITestFluidObject) => Promise<MinimalMap>,
	): Promise<MinimalMap> {
		const dataStore = (await container1.getEntryPoint()) as ITestFluidObject;
		return getMap(dataStore);
	}

	let provider: ITestObjectProvider;
	let url;
	let loader: IHostLoader;
	let container1: IContainerExperimental;
	let map1: ISharedMap;
	let string1: SharedString;
	let cell1: ISharedCell;
	let counter1: SharedCounter;
	let directory1: ISharedDirectory;
	let collection1: IIntervalCollection<SequenceInterval>;

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
		map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		cell1 = await dataStore1.getSharedObject<ISharedCell>(cellId);
		counter1 = await dataStore1.getSharedObject<SharedCounter>(counterId);
		directory1 = await dataStore1.getSharedObject<SharedDirectory>(directoryId);
		string1 = await dataStore1.getSharedObject<SharedString>(stringId);
		collection1 = string1.getIntervalCollection(collectionId);
		string1.insertText(0, "hello");
	});

	it("resends op", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.set(testKey, testValue);
				const cell = await d.getSharedObject<ISharedCell>(cellId);
				cell.set(testValue);
				const counter = await d.getSharedObject<SharedCounter>(counterId);
				counter.increment(testIncrementValue);
				const directory = await d.getSharedObject<SharedDirectory>(directoryId);
				directory.set(testKey, testValue);
				const string = await d.getSharedObject<SharedString>(stringId);
				const collection = string.getIntervalCollection(collectionId);
				collection.add({ start: testStart, end: testEnd });
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<ISharedCell>(cellId);
		const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
		const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		const collection2 = string2.getIntervalCollection(collectionId);
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
		assertIntervals(string1, collection1, [{ start: testStart, end: testEnd }]);
		assertIntervals(string2, collection2, [{ start: testStart, end: testEnd }]);
	});

	it("resends compressed Ids and correctly assumes session", async function () {
		let mapCompressedId;
		let cellCompressedId;
		let directoryCompressedId;

		let mapDecompressedId;
		let cellDecompressedId;
		let directoryDecompressedId;

		let sessionId;

		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				assert((map as any).runtime.idCompressor !== undefined);
				mapCompressedId = (map as any).runtime.idCompressor.generateCompressedId();
				mapDecompressedId = (map as any).runtime.idCompressor.decompress(mapCompressedId);
				map.set(mapDecompressedId, testValue);
				const cell = await d.getSharedObject<ISharedCell>(cellId);
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
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<ISharedCell>(cellId);
		const directory2 = await dataStore2.getSharedObject<ISharedDirectory>(directoryId);
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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.set(testKey, testValue);
				const cell = await d.getSharedObject<ISharedCell>(cellId);
				cell.set(testValue);
				const counter = await d.getSharedObject<SharedCounter>(counterId);
				counter.increment(testIncrementValue);
				const directory = await d.getSharedObject<SharedDirectory>(directoryId);
				directory.set(testKey, testValue);
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const headers: IRequestHeader = { [LoaderHeader.loadMode]: { deltaConnection: "none" } };
		const container2 = await loader.resolve({ url, headers }, pendingOps);
		container2.connect();
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		const cell2 = await dataStore2.getSharedObject<ISharedCell>(cellId);
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

	[
		{ name: "tree map", getMap: getTreeBackedMap },
		{ name: "map", getMap: getMapBackedMap },
	].forEach(({ name, getMap }) => {
		it(`doesn't resend successful op (${name})`, async function () {
			const map = await getMapFromProvider(getMap);
			const pendingOps = await getPendingOps(
				testContainerConfig,
				provider,
				true, // Do send ops from first container instance before closing
				async (c, d) => {
					const mapPre = await getMap(d);
					mapPre.set(testKey, "something unimportant");
					const cell = await d.getSharedObject<ISharedCell>(cellId);
					cell.set("something unimportant");
					const counter = await d.getSharedObject<SharedCounter>(counterId);
					counter.increment(3);
					const directory = await d.getSharedObject<SharedDirectory>(directoryId);
					directory.set(testKey, "I will be erased");
				},
			);

			map.set(testKey, testValue);
			cell1.set(testValue);
			counter1.increment(testIncrementValue);
			directory1.set(testKey, testValue);
			await provider.ensureSynchronized();

			// load with pending ops, which it should not resend because they were already sent successfully
			const container2 = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await getMap(dataStore2);
			const cell2 = await dataStore2.getSharedObject<ISharedCell>(cellId);
			const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
			const directory2 = await dataStore2.getSharedObject<SharedDirectory>(directoryId);

			await provider.ensureSynchronized();
			assert.strictEqual(map.get(testKey), testValue);
			assert.strictEqual(map2.get(testKey), testValue);
			assert.strictEqual(cell1.get(), testValue);
			assert.strictEqual(cell2.get(), testValue);
			assert.strictEqual(counter1.value, testIncrementValue + 3);
			assert.strictEqual(counter2.value, testIncrementValue + 3);
			assert.strictEqual(directory1.get(testKey), testValue);
			assert.strictEqual(directory2.get(testKey), testValue);
		});

		it(`resends delete op and can set after (${name})`, async function () {
			const map = await getMapFromProvider(getMap);
			const pendingOps = await getPendingOps(
				testContainerConfig,
				provider,
				false, // Don't send ops from first container instance before closing
				async (c, d) => {
					const mapPre = await getMap(d);
					mapPre.delete("clear");
				},
			);

			// load container with pending ops, which should resend the op not sent by previous container
			const container2 = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await getMap(dataStore2);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();
			assert.strictEqual(map.has("clear"), false);
			assert.strictEqual(map2.has("clear"), false);
			map.set("clear", "test1");
			await provider.ensureSynchronized();
			assert.strictEqual(map.get("clear"), "test1");
			assert.strictEqual(map2.get("clear"), "test1");
		});

		it(`resends a lot of ops (${name})`, async function () {
			const map = await getMapFromProvider(getMap);
			const pendingOps = await getPendingOps(
				testContainerConfig,
				provider,
				false, // Don't send ops from first container instance before closing
				async (c, d) => {
					const mapPre = await getMap(d);
					[...Array(lots).keys()].map((i) => mapPre.set(i.toString(), i.toString()));
				},
			);

			// load container with pending ops, which should resend the ops not sent by previous container
			const container2 = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await getMap(dataStore2);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();
			[...Array(lots).keys()].map((i) =>
				assert.strictEqual(
					map.get(i.toString()),
					i.toString(),
					`map 1 ${map.get(i.toString())} !== ${i}`,
				),
			);
			[...Array(lots).keys()].map((i) =>
				assert.strictEqual(
					map2.get(i.toString()),
					i.toString(),
					`map 2 ${map2.get(i.toString())} !== ${i}`,
				),
			);
		});

		it(`doesn't resend a lot of successful ops (${name})`, async function () {
			const map = await getMapFromProvider(getMap);
			const pendingOps = await getPendingOps(
				testContainerConfig,
				provider,
				true, // Do send ops from first container instance before closing
				async (c, d) => {
					const mapPre = await getMap(d);
					[...Array(lots).keys()].map((i) => map.set(i.toString(), i.toString()));
				},
			);

			// send a bunch from first container that should not be overwritten
			[...Array(lots).keys()].map((i) => map.set(i.toString(), testValue));
			await provider.ensureSynchronized();

			// load container with pending ops, which should not resend the ops sent by previous container
			const container2 = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await getMap(dataStore2);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();
			[...Array(lots).keys()].map((i) => assert.strictEqual(map.get(i.toString()), testValue));
			[...Array(lots).keys()].map((i) =>
				assert.strictEqual(map2.get(i.toString()), testValue),
			);
		});
	});

	it("resends all shared directory ops", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const directory = await d.getSharedObject<SharedDirectory>(directoryId);
				directory.set("key1", "value1");
				directory.set("key2", "value2");
				directory.createSubDirectory("subdir1");
				directory.createSubDirectory("subdir2");
				directory.delete("key2");
				directory.deleteSubDirectory("subdir2");
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				(c as any).runtime.orderSequentially(() => {
					[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
				});
			},
		);

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				(c as any).runtime.orderSequentially(() => {
					[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
				});
			},
		);

		// send a bunch from first container that should not be overwritten
		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));

		// load container with pending ops, which should not resend the ops sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await provider.ensureSynchronized();
		[...Array(lots).keys()].map((i) => assert.strictEqual(map1.get(i.toString()), testValue));
		[...Array(lots).keys()].map((i) => assert.strictEqual(map2.get(i.toString()), testValue));
	});

	it("resends chunked op", async function () {
		const bigString = "a".repeat(container1.deltaManager.maxMessageSize);

		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.set(testKey, bigString);
			},
		);

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
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

		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.set(testKey, bigString);
				map.set(testKey2, bigString);
			},
		);

		// set on first container which should not be overwritten
		map1.set(testKey, testValue);
		map1.set(testKey2, testValue);

		// load container with pending ops, which should resend the ops not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
		assert.strictEqual(map1.get(testKey2), testValue);
		assert.strictEqual(map2.get(testKey2), testValue);
	});

	it("pending map clear resend", async function () {
		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
		await provider.ensureSynchronized();

		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.clear();
			},
		);

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.clear();
			},
		);

		[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
		await provider.ensureSynchronized();

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.insertText(s.getLength(), " world!");
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "hello world!");
		assert.strictEqual(string2.getText(), "hello world!");
	});

	it("doesn't resend successful string insert op", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.insertText(s.getLength(), " world!");
			},
		);

		// load with pending ops, which it should not resend because they were already sent successfully
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "hello world!");
		assert.strictEqual(string2.getText(), "hello world!");
	});

	it("resends string remove op", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.removeText(0, s.getLength());
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "");
		assert.strictEqual(string2.getText(), "");
	});

	it("doesn't resend successful string remove op", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.removeText(0, s.getLength());
			},
		);

		string1.insertText(0, "goodbye cruel world");

		// load with pending ops, which it should not resend because they were already sent successfully
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getText(), "goodbye cruel world");
		assert.strictEqual(string2.getText(), "goodbye cruel world");
	});

	it("resends string annotate op", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.annotateRange(0, s.getLength(), { bold: true });
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getPropertiesAtPosition(0)?.bold, true);
		assert.strictEqual(string2.getPropertiesAtPosition(0)?.bold, true);
	});

	it("doesn't resend successful string annotate op", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.annotateRange(0, s.getLength(), { bold: true });
			},
		);

		// change annotation, which should not be overwritten by successful stashed ops
		string1.annotateRange(0, string1.getLength(), { bold: false });

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await dataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(string1.getPropertiesAtPosition(0)?.bold, false);
		assert.strictEqual(string2.getPropertiesAtPosition(0)?.bold, false);
	});

	it("resends marker ops", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const s = await d.getSharedObject<SharedString>(stringId);
				s.insertMarker(s.getLength(), ReferenceType.Simple, {
					[reservedMarkerIdKey]: "markerId",
					[reservedMarkerSimpleTypeKey]: "markerKeyValue",
				});

				s.insertMarker(0, ReferenceType.Tile, {
					[reservedTileLabelsKey]: ["tileLabel"],
					[reservedMarkerIdKey]: "tileMarkerId",
				});
			},
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (container, d) => {
				const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
				const runtime = defaultDataStore.context.containerRuntime;

				const createdDataStore = await runtime.createDataStore(["default"]);
				const dataStore = (await createdDataStore.entryPoint.get()) as ITestFluidObject;
				id = dataStore.context.id;

				const channel = dataStore.runtime.createChannel(
					newMapId,
					"https://graph.microsoft.com/types/map",
				);
				assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

				((await channel.handle.get()) as SharedObject).bindToContext();
				defaultDataStore.root.set("someDataStore", dataStore.handle);
				(channel as ISharedMap).set(testKey, testValue);
			},
		);

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);

		// get new datastore from first container
		const entryPoint = (await container1.getEntryPoint()) as ITestFluidObject;
		const containerRuntime = entryPoint.context
			.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;

		// TODO: Remove usage of "resolveHandle" AB#6340
		const response = await containerRuntime.resolveHandle({ url: `/${id}/${newMapId}` });
		const map2 = response.value as ISharedMap;
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("doesn't resend successful attach op", async function () {
		const newMapId = "newMap";
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			true, // Do send ops from first container instance before closing
			async (container, d) => {
				const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
				const runtime = defaultDataStore.context.containerRuntime;

				const createdDataStore = await runtime.createDataStore(["default"]);
				const dataStore = (await createdDataStore.entryPoint.get()) as ITestFluidObject;

				const channel = dataStore.runtime.createChannel(
					newMapId,
					"https://graph.microsoft.com/types/map",
				);
				assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

				((await channel.handle.get()) as SharedObject).bindToContext();
				defaultDataStore.root.set("someDataStore", dataStore.handle);
				(channel as ISharedMap).set(testKey, testValue);
			},
		);

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);
	});

	it("resends DDS attach op", async function () {
		const newMapId = "newMap";
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (_, dataStore) => {
				const channel = dataStore.runtime.createChannel(
					newMapId,
					"https://graph.microsoft.com/types/map",
				);
				assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

				((await channel.handle.get()) as SharedObject).bindToContext();
				assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
				(channel as ISharedMap).set(testKey, testValue);
			},
		);

		const container2 = await loader.resolve({ url }, pendingOps);
		await waitForContainerConnection(container2);

		// get new DDS from first container
		await provider.ensureSynchronized();
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const containerRuntime = dataStore1.context
			.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;

		// TODO: Remove usage of "resolveHandle" AB#6340
		const response = await containerRuntime.resolveHandle({ url: `/default/${newMapId}` });
		const map2 = response.value as ISharedMap;
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("handles stashed ops for local DDS", async function () {
		const newCounterId = "newCounter";
		const container = (await provider.loadTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;
		const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;

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
		const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const string = await defaultDataStore.getSharedObject<SharedString>(stringId);

		await provider.ensureSynchronized();
		await provider.opProcessingController.pauseProcessing(container);

		// generate local op
		assert.strictEqual(string.getText(), "hello");
		string.insertText(5, " / First op");

		// op is submitted on top of first op at some later time (not in the same JS turn, so not batched)
		await Promise.resolve();
		string.insertText(string.getLength(), " / Second op");
		assert.strictEqual(string.getText(), "hello / First op / Second op");

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
		const pendingLocalState = await stashP;

		// Op stream [client ID] at this point -- These are in "savedOps" in the pendingLocalState
		// 1: Join op [A]
		// 2: "hello" (from test setup) [A]
		// 3: Join op [B]
		// 4: " / First op" [B]
		//
		// Stashed Ops (ref seq num is 3) -- These are in IContainerRuntime's PendingStateManager.initialMessages
		// 4: "First op" [B]
		// _: " / Second op" [B]

		// This container will have to replay the first op even though it was already sequenced,
		// since both ops' reference sequence number is lower than the first op's sequence number.
		const container2 = await loader.resolve({ url }, pendingLocalState);
		const defaultDataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const string2 = await defaultDataStore2.getSharedObject<SharedString>(stringId);
		await waitForContainerConnection(container2);
		assert.strictEqual(string2.getText(), "hello / First op / Second op");
		await provider.ensureSynchronized();
		assert.strictEqual(string2.getText(), string1.getText());
	});

	itExpects(
		"waits for previous container's leave message",
		[{ eventName: "fluid:telemetry:Container:connectedStateRejected" }],
		async () => {
			const container: IContainerExperimental =
				await provider.loadTestContainer(testContainerConfig);
			const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
			// Force to write mode to get a leave message
			dataStore.root.set("forceWrite", true);
			await provider.ensureSynchronized();

			const serializedClientId = container.clientId;
			assert.ok(serializedClientId);

			await provider.opProcessingController.pauseProcessing(container);
			const deltaManagerFull = toIDeltaManagerFull(
				toDeltaManagerInternal(dataStore.runtime.deltaManager),
			);
			assert(deltaManagerFull.outbound.paused);

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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			},
		);

		const container2 = await loadOffline(testContainerConfig, provider, { url }, pendingOps);
		const dataStore2 = (await container2.container.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);

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

	it("fails when session time expires using stashed time", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			},
		);
		const pendingState = JSON.parse(pendingOps);
		assert.ok(pendingState.pendingRuntimeState.sessionExpiryTimerStarted);
		pendingState.pendingRuntimeState.sessionExpiryTimerStarted = 1;
		const pendingOps2 = JSON.stringify(pendingState);
		await assert.rejects(
			async () => loader.resolve({ url }, pendingOps2),
			/Client session expired./,
		);
	});

	it("can make changes offline and stash them", async function () {
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			},
		);

		const { container: container2 } = await loadOffline(
			testContainerConfig,
			provider,
			{ url },
			pendingOps,
		);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);

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

		// get stashed ops from this container without connecting.  Superset of pendingOps
		const morePendingOps = await container2.closeAndGetPendingLocalState?.();

		const { container: container3, connect: connect3 } = await loadOffline(
			testContainerConfig,
			provider,
			{ url },
			morePendingOps,
		);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);

		// pending changes from both containers should be applied
		[...Array(lots * 2).keys()].map((i) =>
			assert.strictEqual(
				map3.get(i.toString()),
				i,
				`map 3 ${map2.get(i.toString())} !== ${i}`,
			),
		);
		// make EVEN MORE changes while offline
		[...Array(lots).keys()].map((i) => map3.set((i + lots * 2).toString(), i + lots * 2));

		connect3();
		await waitForContainerConnection(container3);
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
		[{ eventName: "fluid:telemetry:Container:connectedStateRejected" }],
		async () => {
			const pendingOps = await getPendingOps(
				testContainerConfig,
				provider,
				false, // Don't send ops from first container instance before closing
				async (c, d) => {
					const map = await d.getSharedObject<ISharedMap>(mapId);
					[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
				},
			);

			const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
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
			const deltaManagerFull = toIDeltaManagerFull(
				toDeltaManagerInternal(dataStore2.runtime.deltaManager),
			);
			assert(deltaManagerFull.outbound.paused);
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

	it("blob upload before loading", async function () {
		// TODO: AB#19035: Blob upload from an offline state does not currently work before establishing a connection on ODSP due to epoch not provided.
		if (provider.driver.type === "odsp") {
			this.skip();
		}
		const container = await loadOffline(testContainerConfig, provider, { url });
		const dataStore = (await container.container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);

		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		container.connect();
		await timeoutAwait(waitForContainerConnection(container.container), {
			errorMsg: "Timeout on waiting for container connection",
		});
		const handle = await timeoutAwait(handleP, {
			errorMsg: "Timeout on waiting for handleP",
		});
	});

	it("offline blob upload", async function () {
		const container = await loader.resolve({ url });
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		container.disconnect();
		// sending ops when we have never been connected does not work because our requests won't
		// have epoch which is been set after connecting to delta connection (connectToDeltaStream)
		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		container.connect();
		await timeoutAwait(waitForContainerConnection(container), {
			errorMsg: "Timeout on waiting for container connection",
		});
		const handle = await timeoutAwait(handleP, {
			errorMsg: "Timeout on waiting for handleP",
		});
		const handleGet = await timeoutAwait(handle.get(), {
			errorMsg: "Timeout on waiting for handle.get() ",
		});
		assert.strictEqual(bufferToString(handleGet, "utf8"), "blob contents");
		map.set("blob handle", handle);

		const container2 = await timeoutAwait(provider.loadTestContainer(testContainerConfig), {
			errorMsg: "Timeout on waiting for container2 load",
		});
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);

		await timeoutAwait(provider.ensureSynchronized(), {
			errorMsg: "Timeout on waiting for ensureSynchronized after creating container2",
		});

		const handleGet2: any = await timeoutAwait(map2.get("blob handle").get(), {
			errorMsg: "Timeout on waiting for handleGet2",
		});
		assert.strictEqual(bufferToString(handleGet2, "utf8"), "blob contents");
	});

	it("close while uploading blob", async function () {
		const dataStore = (await container1.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		await provider.ensureSynchronized();

		const blobP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		const pendingOpsP = container1.closeAndGetPendingLocalState?.();
		const handle = await blobP;
		map.set("blob handle", handle);
		const pendingOps = await pendingOpsP;

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);

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

	it("abort while stashing blobs", async function () {
		const dataStore = (await container1.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		const ac = new AbortController();
		await provider.ensureSynchronized();

		const blobP1 = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		const blobP2 = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		assert(container1.closeAndGetPendingLocalState);
		const pendingOpsP = container1.closeAndGetPendingLocalState(ac.signal);
		map.set("blob handle", await blobP1);
		ac.abort();
		const pendingOps = await pendingOpsP;

		// we are able to load from the pending ops even though we abort
		await loadOffline(testContainerConfig, provider, { url }, pendingOps);
	});

	it("close while uploading multiple blob", async function () {
		const dataStore = (await container1.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
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
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
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
		// TODO: AB#22741: Re-enable "load offline with blob redirect table"
		if (
			provider.driver.type === "odsp" ||
			(provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs")
		) {
			this.skip();
		}

		const container = await loader.resolve({ url });
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		container.disconnect();

		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		container.connect();
		const handle = await timeoutAwait(handleP, {
			errorMsg: "Timeout on waiting for ",
		});
		map.set("blob handle", handle);
		const handleGet = await timeoutAwait(handle.get(), {
			errorMsg: "Timeout on waiting for handleGet",
		});
		assert.strictEqual(bufferToString(handleGet, "utf8"), "blob contents");

		// wait for summary with redirect table
		await timeoutAwait(provider.ensureSynchronized(), {
			errorMsg: "Timeout on waiting for ensureSynchronized",
		});
		await timeoutAwait(waitForSummary(provider, container1, testContainerConfig), {
			errorMsg: "Timeout on waiting for summary",
		});

		// should be able to load entirely offline
		const stashBlob = await timeoutAwait(getPendingOps(testContainerConfig, provider, true), {
			errorMsg: "Timeout on waiting for stashBlob",
		});
		await timeoutAwait(loadOffline(testContainerConfig, provider, { url }, stashBlob), {
			errorMsg: "Timeout on waiting for loadOffline",
		});
	});

	it("load offline from stashed ops with pending blob", async function () {
		const container = await loadOffline(testContainerConfig, provider, { url });
		const dataStore = (await container.container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);

		// Call uploadBlob() while offline to get local ID handle, and generate an op referencing it
		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 1", "utf8"));
		const stashedChangesP = container.container.closeAndGetPendingLocalState?.();
		const handle = await handleP;
		map.set("blob handle 1", handle);

		const stashedChanges = await stashedChangesP;

		const container3 = await loadOffline(
			testContainerConfig,
			provider,
			{ url },
			stashedChanges,
		);
		const dataStore3 = (await container3.container.getEntryPoint()) as ITestFluidObject;
		const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);

		// blob is accessible offline
		assert.strictEqual(
			bufferToString(await map3.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
		container3.connect();
		await waitForContainerConnection(container3.container);
		await provider.ensureSynchronized();

		assert.strictEqual(
			bufferToString(await map3.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
		assert.strictEqual(
			bufferToString(await map1.get("blob handle 1").get(), "utf8"),
			"blob contents 1",
		);
	});

	it("stashed changes with blobs", async function () {
		const container = await loadOffline(testContainerConfig, provider, { url });
		const dataStore = (await container.container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);

		// Call uploadBlob() while offline to get local ID handle, and generate an op referencing it
		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents 1", "utf8"));
		const stashedChangesP = container.container.closeAndGetPendingLocalState?.();
		const handle = await handleP;
		map.set("blob handle 1", handle);

		const stashedChanges = await stashedChangesP;

		const container3 = await loader.resolve({ url }, stashedChanges);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);

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
		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (container, d) => {
				const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
				const runtime = defaultDataStore.context.containerRuntime;

				const createdDataStore = await runtime.createDataStore(["default"]);
				const dataStore = (await createdDataStore.entryPoint.get()) as ITestFluidObject;
				id = dataStore.context.id;

				const channel = dataStore.runtime.createChannel(
					newMapId,
					"https://graph.microsoft.com/types/map",
				);
				assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

				((await channel.handle.get()) as SharedObject).bindToContext();
				defaultDataStore.root.set("someDataStore", dataStore.handle);
				(channel as ISharedMap).set(testKey, testValue);
			},
		);

		// load offline; new datastore should be accessible
		const container2 = await loadOffline(testContainerConfig, provider, { url }, pendingOps);
		{
			const entryPoint = (await container2.container.getEntryPoint()) as ITestFluidObject;
			const containerRuntime = entryPoint.context
				.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;
			// TODO: Remove usage of "resolveHandle" AB#6340
			const response = await containerRuntime.resolveHandle({ url: `/${id}/${newMapId}` });
			const map2 = response.value as ISharedMap;
			assert.strictEqual(map2.get(testKey), testValue);
			map2.set(testKey2, testValue);
		}

		container2.connect();
		await waitForContainerConnection(container2.container);

		// get new datastore from first container
		{
			const entryPoint = (await container1.getEntryPoint()) as ITestFluidObject;
			const containerRuntime = entryPoint.context
				.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;
			// TODO: Remove usage of "resolveHandle" AB#6340
			const response = await containerRuntime.resolveHandle({ url: `/${id}/${newMapId}` });
			const map3 = response.value as ISharedMap;
			await provider.ensureSynchronized();
			assert.strictEqual(map3.get(testKey), testValue);
			assert.strictEqual(map3.get(testKey2), testValue);
		}
	});

	it("works for detached container", async function () {
		const loader2 = provider.makeTestLoader(testContainerConfig);
		const detachedContainer: IContainerExperimental = await loader2.createDetachedContainer(
			provider.defaultCodeDetails,
		);
		const dataStore = (await detachedContainer.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		map.set(testKey, testValue);

		await detachedContainer.attach(
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		const pendingOps = await detachedContainer.closeAndGetPendingLocalState?.();

		const url2 = await detachedContainer.getAbsoluteUrl("");
		assert.ok(url2);
		const container2 = await loader2.resolve({ url: url2 }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("works for rehydrated container", async function () {
		const loader2 = provider.makeTestLoader(testContainerConfig);
		const detachedContainer = await loader2.createDetachedContainer(
			provider.defaultCodeDetails,
		);
		const dataStore = (await detachedContainer.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		map.set(testKey, testValue);

		const summary = detachedContainer.serialize();
		detachedContainer.close();
		const rehydratedContainer: IContainerExperimental =
			await loader2.rehydrateDetachedContainerFromSnapshot(summary);
		const dataStore2 = (await rehydratedContainer.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		map2.set(testKey2, testValue);

		await rehydratedContainer.attach(
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		const pendingOps = await rehydratedContainer.closeAndGetPendingLocalState?.();

		const url2 = await rehydratedContainer.getAbsoluteUrl("");
		assert.ok(url2);

		const container3 = await loader2.resolve({ url: url2 }, pendingOps);
		const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);
		assert.strictEqual(map3.get(testKey), testValue);
		assert.strictEqual(map3.get(testKey2), testValue);
	});

	// TODO: https://github.com/microsoft/FluidFramework/issues/10729
	it("works with summary while offline", async function () {
		// TODO: AB#22740: Re-enable "works with summary while offline" on ODSP
		if (provider.driver.type === "odsp") {
			this.skip();
		}

		map1.set("test op 1", "test op 1");
		await waitForSummary(provider, container1, testContainerConfig);

		const pendingOps = await getPendingOps(
			testContainerConfig,
			provider,
			false, // Don't send ops from first container instance before closing
			async (c, d) => {
				const map = await d.getSharedObject<ISharedMap>(mapId);
				map.set(testKey, testValue);
			},
		);

		map1.set("test op 2", "test op 2");
		await timeoutAwait(waitForSummary(provider, container1, testContainerConfig), {
			errorMsg: "Timeout on waiting for",
		});

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await timeoutAwait(loader.resolve({ url }, pendingOps), {
			errorMsg: "Timeout on waiting for container2",
		});
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await timeoutAwait(waitForContainerConnection(container2), {
			errorMsg: "Timeout on waiting for connection",
		});
		await timeoutAwait(provider.ensureSynchronized(), {
			errorMsg: "Timeout on waiting for ensureSynchronized",
		});

		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
	});

	// TODO: https://github.com/microsoft/FluidFramework/issues/10729
	it("can stash between summary op and ack", async function () {
		map1.set("test op 1", "test op 1");
		const container: IContainerExperimental =
			await provider.loadTestContainer(testContainerConfig);
		const waitForSummaryPromise = waitForSummary(provider, container1, testContainerConfig);
		const pendingOps = await new Promise<string | undefined>((resolve, reject) =>
			container.on("op", (op) => {
				if (op.type === "summarize") {
					resolve(container.closeAndGetPendingLocalState?.());
				}
			}),
		);
		await waitForSummaryPromise;
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
		await toIDeltaManagerFull(container.deltaManager).outbound.pause();
		let pendingState: string | undefined;
		let pendingStateP;
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
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
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await provider.ensureSynchronized();
		for (let i = 5; i--; ) {
			// local value is what we expect
			assert.strictEqual(map2.get(`${i}`), `${i}`);
			// remote value is what we expect
			assert.strictEqual(map1.get(`${i}`), `${i}`);
		}
	});

	it("repeated getPendingLocalState across multiple connections doesn't duplicate ops", async () => {
		const container = (await provider.loadTestContainer(
			testContainerConfig,
		)) as IContainerExperimental;

		let pendingState;
		let pendingStateP;

		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
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
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
		await provider.ensureSynchronized();
		// local value is what we expect
		assert.strictEqual(counter2.value, 5);
		// remote value is what we expect
		assert.strictEqual(counter1.value, 5);
	});

	it("applies stashed ops with no saved ops", async function () {
		// TODO: This test is consistently failing when ran against AFR. See ADO:7968
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
		await waitForSummary(provider, container1, testContainerConfig);

		// avoid our join op being saved
		const headers: IRequestHeader = { [LoaderHeader.loadMode]: { deltaConnection: "none" } };
		const container: IContainerExperimental = await loader.resolve({ url, headers });
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		// generate ops with RSN === summary SN
		map.set(testKey, testValue);
		const stashBlob = await container.closeAndGetPendingLocalState?.();
		assert(stashBlob);
		const pendingState = JSON.parse(stashBlob);
		// make sure the container loaded from summary and we have no saved ops
		assert.strictEqual(pendingState.savedOps.length, 0);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, stashBlob);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
	});
});

describeCompat(
	"Serializing without closing and/or multiple rehydration (aka Offline Phase 3)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedCounter } = apis.dds;
		const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];

		function getIdCompressor(dds: IChannel): IIdCompressor {
			return (dds as any).runtime.idCompressor as IIdCompressor;
		}

		/**
		 * Load the container with the given pendingLocalState, and wait for it to close,
		 * checking that it closed with the given error message (if possible).
		 *
		 * Note: There is a race condition for when the closure happens so we check a few ways the error could propagate.
		 */
		async function waitForExpectedContainerErrorOnLoad(
			pendingLocalState: string,
			expectedErrorMessage: string,
		): Promise<boolean> {
			try {
				// We expect either loader.resolve to throw or else the container to close right after load
				const container = await loader.resolve({ url }, pendingLocalState);

				// This is to workaround a race condition in Container.load where the container might close between microtasks
				// such that it resolves to the closed container rather than rejecting as it's supposed to.
				if (container.closed) {
					// We can't access the error that closed the container due to a gap in the API,
					// so we must assume it is the expected error.
					return true;
				}

				await timeoutPromise((_resolve, reject) => {
					container.once("closed", reject);
				});
			} catch (error) {
				return (error as Error).message === expectedErrorMessage;
			}
			// Unreachable (the timeoutPromise will throw)
			return false;
		}

		// We disable summarization (so no summarizer container is loaded) due to challenges specifying the exact
		// expected behavior of the summarizer container in these tests, in the presence of race conditions.
		// We aren't testing anything about summmarization anyway, so no need for it.
		const testContainerConfig_noSummarizer: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions: {
				chunkSizeInBytes: Number.POSITIVE_INFINITY, // disable
				compressionOptions: {
					minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
			},
			loaderProps: {
				configProvider: configProvider({
					"Fluid.Container.enableOfflineLoad": true,
					"Fluid.Sequence.intervalStickinessEnabled": true,
				}),
			},
		};

		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container1: IContainer;
		let url: string;
		let counter1: SharedCounter;

		beforeEach("setup", async () => {
			provider = getTestObjectProvider();
			loader = provider.makeTestLoader(testContainerConfig_noSummarizer);

			container1 = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container1.resolvedUrl);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Container is attached so it'll have a URL
			url = (await container1.getAbsoluteUrl(""))!;

			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			counter1 = await dataStore1.getSharedObject<SharedCounter>(counterId);
		});

		itExpects(
			`Single-Threaded Fork: Closes (ForkedContainerError) when ops are submitted with different clientId from pendingLocalState (via Counter DDS)`,
			[
				// Temp Container from getPendingOps
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					category: "generic",
				},
				// Second container, attempted to load from pendingLocalState
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "dataProcessingError",
				},
			],
			async function () {
				const incrementValue = 3;
				const pendingLocalState = await getPendingOps(
					testContainerConfig_noSummarizer,
					provider,
					"afterReconnect", // Send ops after reconnecting, to ensure a different clientId
					async (c, d) => {
						const counter = await d.getSharedObject<SharedCounter>(counterId);
						// Include an ID Allocation op to get coverage of the special logic around these ops as well
						getIdCompressor(counter).generateCompressedId();
						counter.increment(incrementValue);
					},
				);

				// When we load the container using the adjusted pendingLocalState, the clientId mismatch should cause a ForkedContainerError
				// when processing the ops submitted by first container before closing, because we recognize them as the same content using batchId.
				const closedWithExpectedError = await waitForExpectedContainerErrorOnLoad(
					pendingLocalState,
					"Forked Container Error! Matching batchIds but mismatched clientId" /* expectedError */,
				);
				assert(
					closedWithExpectedError,
					"Container should have closed due to ForkedContainerError",
				);

				// Since we closed the container before wrongdoing, the counter is correct - no duplicate ops.
				assert.strictEqual(counter1.value, incrementValue);
			},
		);

		for (let i = 0; i < 20; i++) {
			itExpects.only(
				`Parallel Forks: Closes (ForkedContainerError and DuplicateBatchError) when hydrating twice and submitting in parallel (via Counter DDS)`,
				[
					// All containers close: contianer1, container2, container3
					// container2 or container3 (the loser of the race) will close with "Forked Container Error",
					// The other two will close with "Duplicate batch"
					// Due to the race condition, we can't specify the order of the different errors here.
					{
						eventName: "fluid:telemetry:Container:ContainerClose",
						category: "error",
					},
					{
						eventName: "fluid:telemetry:Container:ContainerClose",
						category: "error",
					},
					{
						eventName: "fluid:telemetry:Container:ContainerClose",
						category: "error",
					},
				],
				async function () {
					const incrementValue = 3;
					const pendingLocalState = await getPendingOps(
						testContainerConfig_noSummarizer,
						provider,
						false, // Don't send ops from first container instance before closing
						async (c, d) => {
							const counter = await d.getSharedObject<SharedCounter>(counterId);
							// Include an ID Allocation op to get coverage of the special logic around these ops as well
							// AB#26984: Actually don't, because the ID Compressor is hitting "Ranges finalized out of order" for this test
							// getIdCompressor(counter)?.generateCompressedId();
							counter.increment(incrementValue);
						},
					);

					async function rehydrateConnectAndPause(loggingId: string) {
						// Rehydrate and immediately pause outbound to ensure we don't send the ops yet
						// Container won't be connected yet, so no race here.
						const container = await loader.resolve(
							{
								url,
								headers: {
									[LoaderHeader.loadMode]: { deltaConnection: "none" },
								} satisfies Partial<ILoaderHeader>,
							},
							pendingLocalState,
						);
						await toIDeltaManagerFull(container.deltaManager).outbound.pause();
						container.connect();

						// Wait for the container to connect, and then pause the inbound queue
						// This order matters - we need to process our inbound join op to finish connecting!
						await waitForContainerConnection(container, true /* failOnContainerClose */, {
							reject: true,
							errorMsg: `${loggingId} didn't connect in time`,
						});
						await toIDeltaManagerFull(container.deltaManager).inbound.pause();

						// Now this container should submit the op when we resume the outbound queue
						return container;
					}

					// Rehydrate twice, waiting for each to connect but blocking outgoing for both, to avoid submitting any ops yet
					const container2 = await rehydrateConnectAndPause("container2");
					const container3 = await rehydrateConnectAndPause("container3");

					// Get these before any containers close
					const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
					const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
					const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
					const counter3 = await dataStore3.getSharedObject<SharedCounter>(counterId);

					const container2DeltaManager = toIDeltaManagerFull(container2.deltaManager);
					const container3DeltaManager = toIDeltaManagerFull(container3.deltaManager);
					// Here's the "in parallel" part - resume both outbound queues at the same time,
					// and then resume both inbound queues once the outbound queues are idle (done sending).
					const allSentP = Promise.all([
						timeoutPromise<unknown>(
							(resolve) => {
								container2DeltaManager.outbound.once("idle", resolve);
							},
							{ errorMsg: "container2 outbound queue never reached idle state" },
						),
						timeoutPromise<unknown>(
							(resolve) => {
								container3DeltaManager.outbound.once("idle", resolve);
							},
							{ errorMsg: "container3 outbound queue never reached idle state" },
						),
					]);
					container2DeltaManager.outbound.resume();
					container3DeltaManager.outbound.resume();
					await allSentP;
					container2DeltaManager.inbound.resume();
					container3DeltaManager.inbound.resume();

					// At this point, both rehydrated containers should have submitted the same Counter op.
					// ContainerRuntime will use PSM and BatchTracker and it will play out like this:
					// - One will win the race and get their op sequenced first.
					// - Then the other will close with Forked Container Error when it sees that ack - with matching batchId but from a different client
					// - Each other client (including the winner) will be tracking the batchId, and when it sees the duplicate from the loser, it will close.
					await provider.ensureSynchronized();

					// Both containers will close with the correct value for the counter.
					// The container whose op is sequenced first will close with "Duplicate batch" error
					// when it sees the other container's batch come in.
					// The other container (that loses the race to be sequenced) will close with "Forked Container Error"
					// when it sees the winner's batch come in.
					assert(container2.closed, "container2 should be closed");
					assert(container3.closed, "container3 should be closed");
					assert.strictEqual(
						counter2.value,
						incrementValue,
						"container2 should have incremented to 3 (at least locally)",
					);
					assert.strictEqual(
						counter3.value,
						incrementValue,
						"container3 should have incremented to 3 (at least locally)",
					);

					// Container1 is not used directly in this test, but is present and observing the session,
					// so we can double-check eventual consistency - the container should have closed when processing the duplicate (after applying the first)
					assert(container1.closed, "container1 should be closed");
					assert.strictEqual(
						counter1.value,
						incrementValue,
						"container1 should have incremented to 3 before closing",
					);
				},
			);
		}

		itExpects(
			`Single-Threaded Forks: Closes (ForkedContainerError) when hydrating twice and submitting in serial (via Counter DDS)`,
			[
				// Temp Container from getPendingOps
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					category: "generic",
				},
				// Container 3
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "dataProcessingError",
				},
			],
			async function () {
				const incrementValue = 3;
				const pendingLocalState = await getPendingOps(
					testContainerConfig_noSummarizer,
					provider,
					false, // Don't send ops from first container instance before closing
					async (c, d) => {
						const counter = await d.getSharedObject<SharedCounter>(counterId);
						// Include an ID Allocation op to get coverage of the special logic around these ops as well
						getIdCompressor(counter).generateCompressedId();
						counter.increment(incrementValue);
					},
				);

				// Rehydrate the first time - counter increment will be resubmitted on container2's new clientId
				const container2 = await loader.resolve({ url }, pendingLocalState);
				const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);

				await provider.ensureSynchronized();
				assert.strictEqual(counter1.value, incrementValue);
				assert.strictEqual(counter2.value, incrementValue);

				// Rehydrate the second time - when we are catching up, we'll recognize the incoming op (from container2),
				// and since it's coming from a different clientID we'll realize the container is forked and we'll close
				const closedWithExpectedError = await waitForExpectedContainerErrorOnLoad(
					pendingLocalState,
					"Forked Container Error! Matching batchIds but mismatched clientId" /* expectedError */,
				);
				assert(
					closedWithExpectedError,
					"Container should have closed due to ForkedContainerError",
				);

				// Confirm that rehydrating the second time didn't change the counter value
				await provider.ensureSynchronized();
				assert.strictEqual(counter1.value, incrementValue);
				assert.strictEqual(counter2.value, incrementValue);
			},
		);
	},
);

describeCompat("stashed ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedDirectory, SharedCounter, SharedString, SharedCell } = apis.dds;
	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[stringId, SharedString.getFactory()],
		[cellId, SharedCell.getFactory()],
		[counterId, SharedCounter.getFactory()],
		[directoryId, SharedDirectory.getFactory()],
	];

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
			enableRuntimeIdCompressor: "on",
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

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

		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		map.set(testKey, testValue);
		const pendingOps = await container.closeAndGetPendingLocalState?.();
		assert.ok(pendingOps);
		// make sure we got stashed ops with refseqnum === 0, otherwise we are not testing the scenario we want to
		assert(/referenceSequenceNumber[^\w,}]*0/.test(pendingOps));

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader2.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2, true);
		await provider2.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});
});
