/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	describeCompat,
	itExpects,
	itSkipsFailureOnSpecificDrivers,
} from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import {
	IContainer,
	IHostLoader,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	CompressionAlgorithms,
	ContainerRuntime,
	DefaultSummaryConfiguration,
	type RecentlyAddedContainerRuntimeMessageDetails,
} from "@fluidframework/container-runtime/internal";
import {
	ConfigTypes,
	IConfigProviderBase,
	IRequest,
	IRequestHeader,
} from "@fluidframework/core-interfaces";
import { Deferred, delay } from "@fluidframework/core-utils/internal";
import type { SharedCounter } from "@fluidframework/counter/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import type { ISharedDirectory, SharedDirectory, ISharedMap } from "@fluidframework/map/internal";
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
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createAndAttachContainer,
	createDocumentId,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";
import { ISharedTree, SharedTree } from "@fluidframework/tree/internal";

import { wrapObjectAndOverride } from "../mocking.js";

/** For a negative test, takes in the ideal expectation (which should NOT be met), and the current wrong one, and asserts on them both */
function assertCurrentAndIdealExpectations(
	actual: any,
	expected: { ideal: any; currentButWrong: any },
	message?: string,
) {
	assert.equal(
		actual,
		expected.currentButWrong,
		`Current (wrong) behavior is not as expected. ${message}`,
	);
	assert.notEqual(actual, expected.ideal, `Ideal behavior is unexpectedly met. ${message}`);
}

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
	send: boolean,
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
	assert(toDeltaManagerInternal(dataStore.runtime.deltaManager).outbound.paused);

	await cb(container, dataStore);

	let pendingState: string | undefined;
	if (send) {
		pendingState = await container.getPendingLocalState?.();
		await testObjectProvider.ensureSynchronized(); // Note: This will resume processing to get synchronized
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

/** Returns a new promise that will resolve once we process a summary op followed by a summary ack */
const waitForSummary = async (container: IContainer) =>
	new Promise<void>((resolve, reject) => {
		let summarized = false;
		container.on("op", (op) => {
			if (op.type === "summarize") {
				summarized = true;
			} else if (summarized && op.type === "summaryAck") {
				resolve();
			} else if (op.type === "summaryNack") {
				reject(new Error("summaryNack"));
			}
		});
	});

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
			options: {
				// Smuggle in this option to pass down to DataStoreRuntime and IntervalCollection DDS
				...({ intervalStickinessEnabled: true } as any),
			},
		},
	};

	const sf = new SchemaFactory("stashedTests");

	class Root extends sf.object("Root", {
		map: sf.map(sf.string),
	}) {}

	const treeConfig = new TreeConfiguration(Root, () => ({
		map: new Map<string, string>(),
	}));

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
		const tree = await d.getSharedObject<ISharedTree>(treeId);
		const root = tree.schematize(treeConfig);
		return root.root.map;
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
				// Submit a message with an unrecognized type
				// Super rare corner case where you stash an op and then roll back to a previous runtime version that doesn't recognize it
				(
					d.context.containerRuntime as unknown as {
						submit: (
							containerRuntimeMessage: RecentlyAddedContainerRuntimeMessageDetails &
								Record<string, any>,
						) => void;
					}
				).submit({
					type: "FROM_THE_FUTURE",
					contents: "Hello",
					compatDetails: { behavior: "Ignore" },
				});
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
				cellDecompressedId = (cell as any).runtime.idCompressor.decompress(
					cellCompressedId,
				);
				cell.set(cellDecompressedId);
				const directory = await d.getSharedObject<SharedDirectory>(directoryId);
				assert((directory as any).runtime.idCompressor !== undefined);
				directoryCompressedId = (
					directory as any
				).runtime.idCompressor.generateCompressedId();
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
			[...Array(lots).keys()].map((i) =>
				assert.strictEqual(map.get(i.toString()), testValue),
			);
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
		const containerRuntime = entryPoint.context.containerRuntime as ContainerRuntime;

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
		const containerRuntime = dataStore1.context.containerRuntime as ContainerRuntime;

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
		// Stashed Ops (ref seq num is 3) -- These are in ContainerRuntime's PendingStateManager.initialMessages
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
			assert(toDeltaManagerInternal(dataStore.runtime.deltaManager).outbound.paused);

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

		// get stashed ops from this container without connecting
		const morePendingOps = await container2.container.closeAndGetPendingLocalState?.();

		const container3 = await loadOffline(
			testContainerConfig,
			provider,
			{ url },
			morePendingOps,
		);
		const dataStore3 = (await container3.container.getEntryPoint()) as ITestFluidObject;
		const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);

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
			assert(toDeltaManagerInternal(dataStore2.runtime.deltaManager).outbound.paused);
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
		const container = await loadOffline(testContainerConfig, provider, { url });
		const dataStore = (await container.container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);

		const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
		container.connect();
		await waitForContainerConnection(container.container);

		const handle = await handleP;
		assert.strictEqual(bufferToString(await handle.get(), "utf8"), "blob contents");
		map.set("blob handle", handle);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);

		await provider.ensureSynchronized();
		assert.strictEqual(
			bufferToString(await map2.get("blob handle").get(), "utf8"),
			"blob contents",
		);
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

		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await provider.ensureSynchronized();
		assert.strictEqual(
			bufferToString(await map2.get("blob handle").get(), "utf8"),
			"blob contents",
		);
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

	itSkipsFailureOnSpecificDrivers(
		"load offline with blob redirect table",
		// We've seen this fail a few times against local server with a timeout
		// TODO: AB#5482
		["local"],
		async function () {
			// upload blob offline so an entry is added to redirect table
			const container = await loadOffline(testContainerConfig, provider, { url });
			const dataStore = (await container.container.getEntryPoint()) as ITestFluidObject;
			const map = await dataStore.getSharedObject<ISharedMap>(mapId);

			const handleP = dataStore.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
			container.connect();
			const handle = await handleP;
			map.set("blob handle", handle);
			assert.strictEqual(bufferToString(await handle.get(), "utf8"), "blob contents");

			// wait for summary with redirect table
			await provider.ensureSynchronized();
			await waitForSummary(container1);

			// should be able to load entirely offline
			const stashBlob = await getPendingOps(testContainerConfig, provider, true);
			await loadOffline(testContainerConfig, provider, { url }, stashBlob);
		},
	);

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
			const containerRuntime = entryPoint.context.containerRuntime as ContainerRuntime;
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
			const containerRuntime = entryPoint.context.containerRuntime as ContainerRuntime;
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

		await detachedContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
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
		map1.set("test op 1", "test op 1");
		await waitForSummary(container1);

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
		await waitForSummary(container1);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
	});

	// TODO: https://github.com/microsoft/FluidFramework/issues/10729
	it("can stash between summary op and ack", async function () {
		map1.set("test op 1", "test op 1");
		const container: IContainerExperimental =
			await provider.loadTestContainer(testContainerConfig);
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
		// TODO: This test is consistently failing when ran against FRS. See ADO:7968
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
		// wait for summary
		await new Promise<void>((resolve) =>
			container1.on("op", (op) => {
				if (op.type === "summaryAck") {
					resolve();
				}
			}),
		);

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
		assert(
			pendingState.pendingRuntimeState.pending.pendingStates[0].referenceSequenceNumber > 0,
		);

		// load container with pending ops, which should resend the op not sent by previous container
		const container2 = await loader.resolve({ url }, stashBlob);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();
		assert.strictEqual(map1.get(testKey), testValue);
		assert.strictEqual(map2.get(testKey), testValue);
	});

	describe("Negative tests for Offline Phase 3 - serializing without closing", () => {
		it(`WRONGLY duplicates ops when submitted with different clientId from pendingLocalState (via Counter DDS)`, async function () {
			const incrementValue = 3;
			const pendingLocalState = await getPendingOps(
				testContainerConfig,
				provider,
				true, // Do send ops from first container instance before closing
				async (c, d) => {
					const counter = await d.getSharedObject<SharedCounter>(counterId);
					counter.increment(incrementValue);
				},
			);

			// The real scenario where the clientId would differ from the original container and pendingLocalState is this:
			// 1. container1 - getPendingLocalState (local ops have clientId A), reconnect, submitOp on new clientId B
			// 2. container2 - load with pendingLocalState. There's no way to correlate the local ops from container1 (clientId A) with the remote ops from container1 (clientId B).
			//
			// For simplicity (as opposed to coding up reconnect like that), just tweak the clientId in pendingLocalState.
			const obj = JSON.parse(pendingLocalState);
			obj.clientId = "00000000-0e85-4ea1-983d-3cb72f280701"; // Bogus GUID to simulate reconnect after getPendingLocalState
			const pendingLocalStateAdjusted = JSON.stringify(obj);

			// load with pending ops with bogus clientId, which makes it impossible (today) to correlate the local ops and they're resent
			const container2 = await loader.resolve({ url }, pendingLocalStateAdjusted);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);

			await provider.ensureSynchronized();

			assertCurrentAndIdealExpectations(counter1.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
			assertCurrentAndIdealExpectations(counter2.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
		});

		it(`WRONGLY duplicates ops when hydrating twice and submitting in parallel (via Counter DDS)`, async function () {
			const incrementValue = 3;
			const pendingLocalState = await getPendingOps(
				testContainerConfig,
				provider,
				false, // Don't send ops from first container instance before closing
				async (c, d) => {
					const counter = await d.getSharedObject<SharedCounter>(counterId);
					counter.increment(incrementValue);
				},
			);

			// Rehydrate twice and block incoming for both, submitting the stashed ops in parallel
			const container2 = await loader.resolve({ url }, pendingLocalState);
			await container2.deltaManager.inbound.pause();
			await container2.deltaManager.outbound.pause(); // To protect against container2 submitting the op before container3 pauses inbound.
			const container3 = await loader.resolve({ url }, pendingLocalState);
			await container3.deltaManager.inbound.pause();
			container2.deltaManager.outbound.resume(); // Now that container3 is paused, container2 can submit the op.

			container2.deltaManager.flush();
			container3.deltaManager.flush();
			await delay(0); // Yield to allow the ops to be submitted before resuming
			container2.deltaManager.inbound.resume();
			container3.deltaManager.inbound.resume();

			// At this point, both rehydrated containers should have submitted the same Counter op.
			// Each receiving client (or the service) would have to recognize and ignore the duplicate on receipt,
			// but that is not yet implemented.
			await provider.ensureSynchronized();

			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);
			const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
			const counter3 = await dataStore3.getSharedObject<SharedCounter>(counterId);

			assertCurrentAndIdealExpectations(counter1.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
			assertCurrentAndIdealExpectations(counter2.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
			assertCurrentAndIdealExpectations(counter3.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
		});

		it(`WRONGLY duplicates ops when hydrating twice and submitting in serial (via Counter DDS)`, async function () {
			const incrementValue = 3;
			const pendingLocalState = await getPendingOps(
				testContainerConfig,
				provider,
				false, // Don't send ops from first container instance before closing
				async (c, d) => {
					const counter = await d.getSharedObject<SharedCounter>(counterId);
					counter.increment(incrementValue);
				},
			);

			// Rehydrate the first time - counter increment will be resubmitted on container2's new clientId
			const container2 = await loader.resolve({ url }, pendingLocalState);
			await provider.ensureSynchronized();
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const counter2 = await dataStore2.getSharedObject<SharedCounter>(counterId);

			assert.strictEqual(counter1.value, incrementValue);
			assert.strictEqual(counter2.value, incrementValue);

			// Rehydrate the second time - first counter increment is unrecognizable,
			// so it will be resubmitted again here on container3's new clientId
			const container3 = await loader.resolve({ url }, pendingLocalState);
			await provider.ensureSynchronized();
			const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
			const counter3 = await dataStore3.getSharedObject<SharedCounter>(counterId);

			assertCurrentAndIdealExpectations(counter1.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
			assertCurrentAndIdealExpectations(counter2.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
			assertCurrentAndIdealExpectations(counter3.value, {
				ideal: incrementValue,
				currentButWrong: 2 * incrementValue,
			});
		});
	});
});

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
