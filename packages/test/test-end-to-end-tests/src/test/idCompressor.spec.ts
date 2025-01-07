/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import { AttachState } from "@fluidframework/container-definitions";
import {
	IContainer,
	type IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	IContainerRuntimeOptions,
	IdCompressorMode,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { delay } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	type ISequencedDocumentMessage,
	type SummaryObject,
} from "@fluidframework/driver-definitions/internal";
import {
	IIdCompressor,
	SessionSpaceCompressedId,
	StableId,
} from "@fluidframework/id-compressor";
import { ISharedMap, type ISharedDirectory } from "@fluidframework/map/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizer,
	createTestConfigProvider,
	getContainerEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

function getIdCompressor(dds: IChannel): IIdCompressor {
	return (dds as any).runtime.idCompressor as IIdCompressor;
}

describeCompat(
	"Runtime IdCompressor - Schema changes",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		function runTests(explicitSchemaCreation: boolean, explicitSchemaLoading: boolean) {
			let provider: ITestObjectProvider;

			beforeEach("setupContainers", async () => {
				provider = getTestObjectProvider();
			});

			const {
				containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
				dds: { SharedMap, SharedCell },
			} = apis;

			const containerConfigNoCompressor: ITestContainerConfig = {
				registry: [
					["mapId", SharedMap.getFactory()],
					["cellId", SharedCell.getFactory()],
				],
				fluidDataObjectType: DataObjectFactoryType.Test,
				loaderProps: {},
				runtimeOptions: {
					enableRuntimeIdCompressor: undefined,
					explicitSchemaControl: explicitSchemaCreation,
				},
			};

			const containerConfigWithCompressor: ITestContainerConfig = {
				...containerConfigNoCompressor,
				runtimeOptions: {
					enableRuntimeIdCompressor: "on",
					explicitSchemaControl: explicitSchemaLoading,
				},
			};

			it("has no compressor if not enabled", async () => {
				provider.reset();
				const container = await provider.makeTestContainer(containerConfigNoCompressor);
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				const map = await dataObject.getSharedObject<ISharedMap>("mapId");

				assert(getIdCompressor(map) === undefined);
			});

			it("can't enable compressor on an existing container", async () => {
				provider.reset();
				const container = await provider.makeTestContainer(containerConfigNoCompressor);
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				const map = await dataObject.getSharedObject<ISharedMap>("mapId");
				assert(getIdCompressor(map) === undefined);

				const enabledContainer = await provider.loadTestContainer(
					containerConfigWithCompressor,
				);
				const enabledDataObject = (await enabledContainer.getEntryPoint()) as ITestFluidObject;
				const enabledMap = await enabledDataObject.getSharedObject<ISharedMap>("mapId");
				assert(getIdCompressor(enabledMap) === undefined);
			});

			it("can't disable compressor if previously enabled on existing container", async () => {
				const container = await provider.makeTestContainer(containerConfigWithCompressor);
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				const map = await dataObject.getSharedObject<ISharedMap>("mapId");
				assert(getIdCompressor(map) !== undefined);

				const container2 = await provider.loadTestContainer(containerConfigNoCompressor);
				const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const map2 = await dataObject2.getSharedObject<ISharedMap>("mapId");
				assert(getIdCompressor(map2) !== undefined);
			});
		}

		describe("Explicit Schema", () => runTests(true, true));
		describe("Implicit Schema", () => runTests(false, false));
		describe("Explicit Schema on load", () => runTests(false, true));
		describe("Implicit Schema on create", () => runTests(true, false));
	},
);

describeCompat("Runtime IdCompressor", "NoCompat", (getTestObjectProvider, apis) => {
	const {
		dataRuntime: { DataObject, DataObjectFactory },
		containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
		dds: { SharedMap, SharedCell },
	} = apis;
	class TestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}

		public get _context() {
			return this.context;
		}

		private readonly sharedMapKey = "map";
		public map!: ISharedMap;

		private readonly sharedCellKey = "sharedCell";
		public sharedCell!: ISharedCell;

		protected async initializingFirstTime() {
			const sharedMap = SharedMap.create(this.runtime);
			this.root.set(this.sharedMapKey, sharedMap.handle);

			const sharedCell = SharedCell.create(this.runtime);
			this.root.set(this.sharedCellKey, sharedCell.handle);
		}

		protected async hasInitialized() {
			const mapHandle = this.root.get<IFluidHandle<ISharedMap>>(this.sharedMapKey);
			assert(mapHandle !== undefined, "SharedMap not found");
			this.map = await mapHandle.get();

			const sharedCellHandle = this.root.get<IFluidHandle<ISharedCell>>(this.sharedCellKey);
			assert(sharedCellHandle !== undefined, "SharedCell not found");
			this.sharedCell = await sharedCellHandle.get();
		}
	}

	let provider: ITestObjectProvider;
	const defaultFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[SharedMap.getFactory(), SharedCell.getFactory()],
		[],
	);

	const runtimeOptions: IContainerRuntimeOptions = {
		enableRuntimeIdCompressor: "on",
	};

	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		ContainerRuntimeFactoryWithDefaultDataStore,
		{
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			runtimeOptions,
		},
	);

	let containerRuntime: IContainerRuntime;
	let container1: IContainer;
	let container2: IContainer;
	let mainDataStore: TestDataObject;

	let sharedMapContainer1: ISharedMap;
	let sharedMapContainer2: ISharedMap;
	let sharedMapContainer3: ISharedMap;

	let sharedCellContainer1: ISharedCell;

	const createContainer = async (): Promise<IContainer> =>
		provider.createContainer(runtimeFactory);

	beforeEach("setupContainers", async () => {
		provider = getTestObjectProvider();
		container1 = await createContainer();
		mainDataStore = (await container1.getEntryPoint()) as TestDataObject;
		containerRuntime = mainDataStore._context.containerRuntime as IContainerRuntime;
		sharedMapContainer1 = mainDataStore.map;
		sharedCellContainer1 = mainDataStore.sharedCell;

		container2 = await provider.loadContainer(runtimeFactory);
		const container2MainDataStore = (await container2.getEntryPoint()) as TestDataObject;
		sharedMapContainer2 = container2MainDataStore.map;

		const container3 = await provider.loadContainer(runtimeFactory);
		const container3MainDataStore = (await container3.getEntryPoint()) as TestDataObject;
		sharedMapContainer3 = container3MainDataStore.map;

		await waitForContainerConnection(container1);
		await waitForContainerConnection(container2);
		await waitForContainerConnection(container3);
	});

	const containerConfigNoCompressor: ITestContainerConfig = {
		registry: [
			["mapId", SharedMap.getFactory()],
			["cellId", SharedCell.getFactory()],
		],
		fluidDataObjectType: DataObjectFactoryType.Test,
		loaderProps: {},
		runtimeOptions: {
			enableRuntimeIdCompressor: undefined,
		},
	};

	const containerConfigWithCompressor: ITestContainerConfig = {
		...containerConfigNoCompressor,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
		},
	};

	it("can normalize session space IDs to op space", async () => {
		// None of these clusters will be ack'd yet and as such they will all
		// generate local Ids. State of compressors afterwards should be:
		// SharedMap1 Compressor: Local IdRange { first: -1, last: -512 }
		// SharedMap2 Compressor: Local IdRange { first: -1, last: -512 }
		// SharedMap3 Compressor: Local IdRange { first: -1, last: -512 }
		for (let i = 0; i < 512; i++) {
			getIdCompressor(sharedMapContainer1).generateCompressedId();
			getIdCompressor(sharedMapContainer2).generateCompressedId();
			getIdCompressor(sharedMapContainer3).generateCompressedId();
		}

		// Validate the state described above: all compressors should normalize to
		// local, negative ids as they haven't been ack'd and can't eagerly allocate
		for (let i = 0; i < 512; i++) {
			[sharedMapContainer1, sharedMapContainer2, sharedMapContainer3].forEach((map) => {
				assert.strictEqual(
					getIdCompressor(map).normalizeToOpSpace(-(i + 1) as SessionSpaceCompressedId),
					-(i + 1),
				);
			});
		}

		// Generate DDS ops so that the compressors synchronize
		sharedMapContainer1.set("key", "value");
		await provider.ensureSynchronized();
		sharedMapContainer2.set("key2", "value2");
		await provider.ensureSynchronized();
		sharedMapContainer3.set("key3", "value3");
		await provider.ensureSynchronized();

		// After synchronization, each compressor should allocate a cluster. Because the order is deterministic
		// in e2e tests, we can directly validate the cluster ranges. After synchronizing, each compressor will
		// get a positive id cluster that corresponds to its locally allocated ranges. Each cluster will be sized
		// as the number of IDs produced + the default cluster size (512).
		// Compressor states after synchronizing:
		// SharedMap1 Compressor: { first: 0, last: 1023 }
		// SharedMap2 Compressor: { first: 1024, last: 2047 }
		// SharedMap3 Compressor: { first: 2048, last: 2559 }
		const compressors = [sharedMapContainer1, sharedMapContainer2, sharedMapContainer3].map(
			(map) => {
				return getIdCompressor(map);
			},
		);
		const firstIds = compressors.map((compressor) =>
			compressor.normalizeToOpSpace(-1 as SessionSpaceCompressedId),
		);
		for (let i = 0; i < 512; i++) {
			for (let j = 0; j < compressors.length; j++) {
				assert.strictEqual(
					compressors[j].normalizeToOpSpace(-(i + 1) as SessionSpaceCompressedId),
					i + firstIds[j],
				);
			}
		}

		assert.strictEqual(sharedMapContainer1.get("key"), "value");
		assert.strictEqual(sharedMapContainer2.get("key2"), "value2");
		assert.strictEqual(sharedMapContainer3.get("key3"), "value3");
	});

	it("can normalize local op space IDs from a local session to session space", async () => {
		const sessionSpaceId = getIdCompressor(sharedMapContainer1).generateCompressedId();
		sharedMapContainer1.set("key", "value");

		await provider.ensureSynchronized();
		const opSpaceId = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(sessionSpaceId);
		const normalizedSessionSpaceId = getIdCompressor(
			sharedMapContainer1,
		).normalizeToSessionSpace(opSpaceId, getIdCompressor(sharedMapContainer1).localSessionId);

		assert(opSpaceId >= 0);
		assert.strictEqual(normalizedSessionSpaceId, -1);
	});

	it("finalizes IDs made in a detached state immediately upon attach", async () => {
		const loader = provider.makeTestLoader(containerConfigWithCompressor);
		const defaultCodeDetails: IFluidCodeDetails = {
			package: "defaultTestPackage",
			config: {},
		};
		const container = await loader.createDetachedContainer(defaultCodeDetails);

		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const map = await dataObject.getSharedObject<ISharedMap>("mapId");
		const sessionSpaceId = getIdCompressor(map).generateCompressedId();

		await container.attach(provider.driver.createCreateNewRequest("doc id"));
		const opSpaceId = getIdCompressor(map).normalizeToOpSpace(sessionSpaceId);
		assert.notEqual(opSpaceId, sessionSpaceId);
		await provider.ensureSynchronized();

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined);
		const loader2 = provider.makeTestLoader(containerConfigWithCompressor);
		const remoteContainer = await loader2.resolve({ url });

		const dataObject2 =
			await getContainerEntryPointBackCompat<ITestFluidObject>(remoteContainer);
		const map2 = await dataObject2.getSharedObject<ISharedMap>("mapId");
		const sessionSpaceId2 = getIdCompressor(map2).normalizeToSessionSpace(
			opSpaceId,
			getIdCompressor(map).localSessionId,
		);

		assert.equal(opSpaceId, sessionSpaceId2);
	});

	it("eagerly allocates final IDs after cluster is finalized", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		const localId1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(localId1, -1);
		const localId2 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(localId2, -2);

		sharedMapContainer1.set("key", "value");
		await provider.ensureSynchronized();

		const finalId3 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert(finalId3 > 0);

		sharedMapContainer1.set("key2", "value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId1);
		const opSpaceId2 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId2);
		const opSpaceId3 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(finalId3);

		assert(opSpaceId1 >= 0);
		assert(opSpaceId2 >= 0);
		assert(opSpaceId3 >= 0);
		assert.strictEqual(finalId3, opSpaceId3);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId1,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			localId1,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId2,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			localId2,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId3,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			finalId3,
		);
	});

	it("eagerly allocates IDs across DDSs using the same compressor", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedCellContainer1) !== undefined, "IdCompressor is undefined");

		const localId1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert.strictEqual(localId1, -1);
		const localId2 = getIdCompressor(sharedCellContainer1).generateCompressedId();
		assert.strictEqual(localId2, -2);

		sharedMapContainer1.set("key", "value");
		sharedCellContainer1.set("value");
		await provider.ensureSynchronized();

		const finalId3 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		assert(finalId3 > 0);
		const finalId4 = getIdCompressor(sharedCellContainer1).generateCompressedId();
		assert(finalId4 > 0);

		sharedMapContainer1.set("key2", "value2");
		sharedCellContainer1.set("value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId1);
		const opSpaceId2 = getIdCompressor(sharedCellContainer1).normalizeToOpSpace(localId2);
		const opSpaceId3 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(finalId3);
		const opSpaceId4 = getIdCompressor(sharedCellContainer1).normalizeToOpSpace(finalId4);

		assert(opSpaceId1 >= 0);
		assert(opSpaceId2 >= 0);
		assert.strictEqual(opSpaceId3, finalId3);
		assert.strictEqual(opSpaceId4, finalId4);

		assert.equal(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId1,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			localId1,
		);
		assert.equal(
			getIdCompressor(sharedCellContainer1).normalizeToSessionSpace(
				opSpaceId2,
				getIdCompressor(sharedCellContainer1).localSessionId,
			),
			localId2,
		);
		assert.equal(
			getIdCompressor(sharedMapContainer1).normalizeToSessionSpace(
				opSpaceId3,
				getIdCompressor(sharedMapContainer1).localSessionId,
			),
			finalId3,
		);
		assert.equal(
			getIdCompressor(sharedCellContainer1).normalizeToSessionSpace(
				opSpaceId4,
				getIdCompressor(sharedCellContainer1).localSessionId,
			),
			finalId4,
		);
	});

	it("produces Id spaces correctly", async () => {
		const maps = [sharedMapContainer1, sharedMapContainer2, sharedMapContainer3];
		const compressors = maps.map((map) => getIdCompressor(map));
		const idPairs: [SessionSpaceCompressedId, IIdCompressor][] = [];
		const gens = 1000;
		for (let i = 0; i < gens; i++) {
			const compressor = compressors[i % compressors.length];
			const id = compressor.generateCompressedId();
			idPairs.push([id, compressor]);
			if (i === gens / 2) {
				maps.forEach((map) => {
					map.set("key", "value");
				});
				await provider.ensureSynchronized();
			}
		}
		await assureAlignment(maps, idPairs);
	});

	async function assureAlignment(
		maps: ISharedMap[],
		idPairs: [SessionSpaceCompressedId, IIdCompressor][],
	) {
		maps.forEach((map) => {
			map.set("key", "value");
		});
		await provider.ensureSynchronized();
		const compressors = maps.map((map) => getIdCompressor(map));
		idPairs.forEach(([id, compressorOrigin]) => {
			const opSpaceId = compressorOrigin.normalizeToOpSpace(id);
			assert(opSpaceId >= 0);
			const sessionSpaceIdOrigin = compressorOrigin.normalizeToSessionSpace(
				opSpaceId,
				compressorOrigin.localSessionId,
			);
			const decompressedOrigin = compressorOrigin.decompress(id);
			compressors.forEach((compressor) => {
				const sessionSpaceId = compressor.normalizeToSessionSpace(
					opSpaceId,
					compressorOrigin.localSessionId,
				);
				assert(
					sessionSpaceId >= 0 ||
						(compressor === compressorOrigin && sessionSpaceId === sessionSpaceIdOrigin),
				);
				assert(compressor.normalizeToOpSpace(sessionSpaceId) === opSpaceId);
				const decompressed = compressor.decompress(sessionSpaceId);
				assert(decompressed === decompressedOrigin);
			});
		});
	}

	// IdCompressor is at container runtime level, which means that individual DDSs
	// in the same container should have the same underlying compressor state
	it("container with multiple DDSs has same compressor state", async () => {
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedCellContainer1) !== undefined, "IdCompressor is undefined");

		// 2 IDs in the map compressor, 1 in the cell compressor
		// should result in a local count of 3 IDs
		const sharedMapCompressedId = getIdCompressor(sharedMapContainer1).generateCompressedId();
		const sharedMapDecompressedId =
			getIdCompressor(sharedMapContainer1).decompress(sharedMapCompressedId);
		const sharedMapCompressedId2 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		const sharedMapDecompressedId2 =
			getIdCompressor(sharedMapContainer1).decompress(sharedMapCompressedId2);
		const sharedCellCompressedId =
			getIdCompressor(sharedCellContainer1).generateCompressedId();
		const sharedCellDecompressedId =
			getIdCompressor(sharedMapContainer1).decompress(sharedCellCompressedId);

		// Generate an op so the idCompressor state is actually synchronized
		// across clients
		sharedMapContainer1.set(sharedMapDecompressedId, "value");

		assert.strictEqual(
			(getIdCompressor(sharedMapContainer1) as any).localIdCount,
			(getIdCompressor(sharedCellContainer1) as any).localIdCount,
		);

		await provider.ensureSynchronized();

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).recompress(sharedMapDecompressedId),
			getIdCompressor(sharedCellContainer1).recompress(sharedMapDecompressedId),
		);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).recompress(sharedMapDecompressedId2),
			getIdCompressor(sharedCellContainer1).recompress(sharedMapDecompressedId2),
		);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).recompress(sharedCellDecompressedId),
			getIdCompressor(sharedCellContainer1).recompress(sharedCellDecompressedId),
		);

		assert.strictEqual(sharedMapContainer1.get(sharedMapDecompressedId), "value");
	});

	const sharedPoints = [0, 1, 2];
	const testConfigs = generatePairwiseOptions({
		preOfflineChanges: sharedPoints,
		postOfflineChanges: sharedPoints,
		allocateDuringResubmitStride: [1, 2, 3],
		delayBetweenOfflineChanges: [true, false],
	});

	for (const testConfig of testConfigs) {
		it(`Ids generated across batches are correctly resubmitted: ${JSON.stringify(
			testConfig,
		)}`, async () => {
			const idPairs: [SessionSpaceCompressedId, IIdCompressor][] = [];

			const simulateAllocation = (map: ISharedMap) => {
				const idCompressor = getIdCompressor(map);
				const id = idCompressor.generateCompressedId();
				idPairs.push([id, idCompressor]);
			};

			for (let i = 0; i < testConfig.preOfflineChanges; i++) {
				simulateAllocation(sharedMapContainer1);
				sharedMapContainer1.set("key", i); // Trigger Id submission
			}

			container1.disconnect();

			for (let i = 0; i < testConfig.postOfflineChanges; i++) {
				simulateAllocation(sharedMapContainer1);
				sharedMapContainer1.set("key", i); // Trigger Id submission

				if (testConfig.delayBetweenOfflineChanges) {
					await delay(100); // Trigger Id submission
				}
			}

			let invokedCount = 0;
			const superResubmit = (sharedMapContainer1 as any).reSubmitCore.bind(
				sharedMapContainer1,
			);
			(sharedMapContainer1 as any).reSubmitCore = (
				content: unknown,
				localOpMetadata: unknown,
			) => {
				invokedCount++;
				if (invokedCount % testConfig.allocateDuringResubmitStride === 0) {
					// Simulate a DDS that generates IDs as part of the resubmit path (e.g. SharedTree)
					// This will test that ID allocation ops are correctly sorted into a separate batch in the outbox
					simulateAllocation(sharedMapContainer1);
				}
				superResubmit(content, localOpMetadata);
			};

			// important allocation to test the ordering of generate, takeNext, generate, retakeOutstanding, takeNext.
			// correctness here relies on mutation in retaking if we want the last takeNext to return an empty range
			// which it must be if we want to avoid overlapping range bugs
			simulateAllocation(sharedMapContainer1);

			container1.connect();
			await waitForContainerConnection(container1);
			await assureAlignment([sharedMapContainer1, sharedMapContainer2], idPairs);
		});
	}

	it("Reentrant ops do not cause resubmission of ID allocation ops", async () => {
		const idPairs: [SessionSpaceCompressedId, IIdCompressor][] = [];

		const simulateAllocation = (map: ISharedMap) => {
			const idCompressor = getIdCompressor(map);
			const id = idCompressor.generateCompressedId();
			idPairs.push([id, idCompressor]);
		};

		container1.disconnect();

		sharedMapContainer2.set("key", "first");

		let invokedCount = 0;
		const superProcessCore = (sharedMapContainer1 as any).processCore.bind(
			sharedMapContainer1,
		);
		(sharedMapContainer1 as any).processCore = (
			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown,
		) => {
			if (invokedCount === 0) {
				// Force reentrancy during first op processing to cause batch manager rebase (which should skip rebasing allocation ops)
				simulateAllocation(sharedMapContainer1);
				sharedMapContainer1.set("key", "reentrant1");
				simulateAllocation(sharedMapContainer1);
				sharedMapContainer1.set("key", "reentrant2");
			}
			superProcessCore(message, local, localOpMetadata);
			invokedCount++;
		};

		container1.connect();
		await waitForContainerConnection(container1);
		await assureAlignment([sharedMapContainer1, sharedMapContainer2], idPairs);
	});

	// IdCompressor is at container runtime level, which means that individual DDSs
	// in the same container and different DataStores should have the same underlying compressor state
	it("DDSs in different DataStores have the same compressor state", async () => {
		const dataStore2 = await defaultFactory.createInstance(containerRuntime);
		mainDataStore.map.set("DataStore2", dataStore2.handle);

		await provider.ensureSynchronized();
		// 1 Id in the map compressor in the main DataStore, 1 in the cell compressor
		// in the same DataStore, 1 in the map of DataStore2 should result in 3 local
		// Ids in the same compressor
		const compressedIds: SessionSpaceCompressedId[] = [];
		compressedIds.push(getIdCompressor(sharedMapContainer1).generateCompressedId());
		compressedIds.push(getIdCompressor(sharedCellContainer1).generateCompressedId());
		compressedIds.push(getIdCompressor(dataStore2.map).generateCompressedId());

		const decompressedIds: StableId[] = [];
		compressedIds.forEach((id) => {
			const decompressedId = getIdCompressor(sharedMapContainer1).decompress(id);

			// All the compressors point to the same compressor and should all be able to
			// decompress the local Id to the same decompressed Id
			[getIdCompressor(sharedCellContainer1), getIdCompressor(dataStore2.map)].forEach(
				(compressor) => {
					assert.strictEqual(compressor.decompress(id), decompressedId);
				},
			);

			decompressedIds.push(decompressedId);
		});

		sharedMapContainer1.set("key", "value");

		await provider.ensureSynchronized();

		// Everything should be pointing to the same compressor. All
		// compressors should have allocated the same number of local Ids.
		assert.strictEqual(
			(getIdCompressor(sharedMapContainer1) as any).localIdCount,
			(getIdCompressor(sharedCellContainer1) as any).localIdCount,
		);

		assert.strictEqual(
			(getIdCompressor(sharedMapContainer1) as any).localIdCount,
			(getIdCompressor(dataStore2.map) as any).localIdCount,
		);

		decompressedIds.forEach((id, index) => {
			// All compressors should be able to recompress the decompressed Ids
			// back to the SessionSpace compressed Id: [-1, -2, -3]
			const compressedId = getIdCompressor(sharedMapContainer1).recompress(id);
			assert.strictEqual(compressedIds[index], compressedId);

			[getIdCompressor(sharedCellContainer1), getIdCompressor(dataStore2.map)].forEach(
				(compressor) => {
					assert.strictEqual(compressedId, compressor.recompress(id));
				},
			);
		});
	});
});

// No-compat: 2.0.0-internal.8.x and earlier versions of container-runtime don't finalize ids prior to attaching.
// Even older versions of the runtime also don't have an id compression feature enabled.
describeCompat(
	"IdCompressor in detached container",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		let request: IRequest;

		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
			request = provider.driver.createCreateNewRequest(provider.documentId);
		});

		it("Compressors sync after detached container attaches and sends an op", async () => {
			const testConfig: ITestContainerConfig = {
				fluidDataObjectType: DataObjectFactoryType.Test,
				registry: [["sharedCell", apis.dds.SharedCell.getFactory()]],
				runtimeOptions: {
					enableRuntimeIdCompressor: "on",
				},
			};
			const loader = provider.makeTestLoader(testConfig);
			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

			// Get the root dataStore from the detached container.
			const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
			const testChannel1 = await dataStore.getSharedObject<ISharedCell>("sharedCell");

			// Generate an Id before attaching the container
			(testChannel1 as any).runtime.idCompressor.generateCompressedId();
			// Attach the container. The generated Id won't be synced until another op
			// is sent after attaching becuase most DDSs don't send ops until they are attached.
			await container.attach(request);

			// Create another container to test sync
			const url: any = await container.getAbsoluteUrl("");
			const loader2 = provider.makeTestLoader(testConfig) as Loader;
			const container2 = await loader2.resolve({ url });
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const testChannel2 = await dataStore2.getSharedObject<ISharedCell>("sharedCell");
			// Generate an Id in the second attached container and send an op to send the Ids
			(testChannel2 as any).runtime.idCompressor.generateCompressedId();
			testChannel2.set("value");

			await provider.ensureSynchronized();

			// Send an op in the first container to get its Ids sent
			testChannel1.set("value2");

			await provider.ensureSynchronized();

			// Compressor from first container will get the first 512 Ids (0-511) as its id should be finalized
			// on attach
			assert.strictEqual((testChannel1 as any).runtime.idCompressor.normalizeToOpSpace(-1), 0);
			// Compressor from second container gets second cluster starting at 512 after sending an op
			assert.strictEqual(
				(testChannel2 as any).runtime.idCompressor.normalizeToOpSpace(-1),
				513,
			);
		});
	},
);

describeCompat("IdCompressor Summaries", "NoCompat", (getTestObjectProvider, compatAPIs) => {
	let provider: ITestObjectProvider;
	const {
		dds: { SharedDirectory },
	} = compatAPIs;
	const disableConfig: ITestContainerConfig = {
		runtimeOptions: { enableRuntimeIdCompressor: undefined },
	};
	const enabledConfig: ITestContainerConfig = {
		runtimeOptions: { enableRuntimeIdCompressor: "on" },
	};

	const createContainer = async (
		config: ITestContainerConfig = disableConfig,
	): Promise<IContainer> => provider.makeTestContainer(config);

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
	});

	it("Summary includes IdCompressor when enabled", async () => {
		const container = await createContainer(enabledConfig);
		const { summarizer } = await createSummarizer(provider, container, enabledConfig);
		const { summaryTree } = await summarizeNow(summarizer);

		assert(
			summaryTree.tree[".idCompressor"] !== undefined,
			"IdCompressor should be present in summary",
		);
	});

	it("Summary does not include IdCompressor when disabled", async () => {
		const container = await createContainer();
		const { summarizer } = await createSummarizer(provider, container, disableConfig);
		const { summaryTree } = await summarizeNow(summarizer);

		assert(
			summaryTree.tree[".idCompressor"] === undefined,
			"IdCompressor should not be present in summary when not enabled",
		);
	});

	function getCompressorSummaryStats(summaryTree: ISummaryTree): {
		sessionCount: number;
		clusterCount: number;
	} {
		const compressorSummary: SummaryObject | undefined = summaryTree.tree[".idCompressor"];
		assert(compressorSummary !== undefined, "IdCompressor should be present in summary");
		const base64Content = (compressorSummary as any).content as string;
		const floatView = new Float64Array(stringToBuffer(base64Content, "base64"));
		return {
			sessionCount: floatView[2],
			clusterCount: floatView[3],
		};
	}

	it("Shouldn't include unack'd local ids in summary", async () => {
		const container = await createContainer(enabledConfig);
		const defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		const idCompressor: IIdCompressor = (defaultDataStore._root as any).runtime.idCompressor;

		const { summarizer } = await createSummarizer(provider, container, enabledConfig);

		assert(idCompressor !== undefined, "IdCompressor should be present");
		idCompressor.generateCompressedId();

		await provider.ensureSynchronized();

		const { summaryTree } = await summarizeNow(summarizer);
		const summaryStats = getCompressorSummaryStats(summaryTree);
		assert(
			summaryStats.sessionCount === 0,
			"Shouldn't have any local sessions as all ids are unack'd",
		);
		assert(
			summaryStats.clusterCount === 0,
			"Shouldn't have any local clusters as all ids are unack'd",
		);
	});

	it("Includes ack'd ids in summary", async () => {
		const container = await createContainer(enabledConfig);
		const defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		const idCompressor: IIdCompressor = (defaultDataStore._root as any).runtime.idCompressor;

		const { summarizer } = await createSummarizer(provider, container, enabledConfig);

		assert(idCompressor !== undefined, "IdCompressor should be present");

		idCompressor.generateCompressedId();
		defaultDataStore._root.set("key", "value");

		await provider.ensureSynchronized();

		const { summaryTree } = await summarizeNow(summarizer);
		const summaryStats = getCompressorSummaryStats(summaryTree);
		assert.equal(
			summaryStats.sessionCount,
			1,
			"Should have a local session as all ids are ack'd",
		);
		assert.equal(
			summaryStats.clusterCount,
			1,
			"Should have a local cluster as all ids are ack'd",
		);
	});

	it("Newly connected container synchronizes from summary", async function () {
		// TODO: This test is consistently failing when ran against AFR. See ADO:7931
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
		const container = await createContainer(enabledConfig);
		const defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		const idCompressor: IIdCompressor = (defaultDataStore._root as any).runtime.idCompressor;

		const { summarizer: summarizer1 } = await createSummarizer(
			provider,
			container,
			enabledConfig,
		);

		assert(idCompressor !== undefined, "IdCompressor should be present");
		idCompressor.generateCompressedId();
		defaultDataStore._root.set("key", "value");
		await provider.ensureSynchronized();

		const { summaryTree } = await summarizeNow(summarizer1);
		const summaryStats = getCompressorSummaryStats(summaryTree);
		assert.equal(
			summaryStats.sessionCount,
			1,
			"Should have a local session as all ids are ack'd",
		);
		assert.equal(
			summaryStats.clusterCount,
			1,
			"Should have a local cluster as all ids are ack'd",
		);

		const container2 = await provider.loadTestContainer(enabledConfig);
		const container2DataStore = (await container2.getEntryPoint()) as ITestDataObject;
		const container2IdCompressor: IIdCompressor = (container2DataStore._root as any).runtime
			.idCompressor;
		assert(container2IdCompressor !== undefined, "Second IdCompressor should be present");
		assert(
			(container2IdCompressor as any).sessions.get(idCompressor.localSessionId) !== undefined,
			"Should have the other compressor's session from summary",
		);
	});

	/**
	 * Function that asserts that the value is not as expected. e have a bug in one of our customer's app where a short
	 * data store ID created is `[` but in a downloaded snapshot, it is converted to its ASCII equivalent `%5B` in
	 * certain conditions. So, when an op comes for this data store with id `[`, containers loaded with this snapshot
	 * cannot find the data store.
	 *
	 * While we figure out the fix, we are disabling the ability to create short IDs and this assert validates it.
	 */
	function assertInvert(value: boolean, message: string) {
		assert(!value, message);
	}

	async function TestCompactIds(enableRuntimeIdCompressor: IdCompressorMode) {
		const container = await createContainer({
			runtimeOptions: { enableRuntimeIdCompressor },
		});
		const defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		// This data store was created in detached container, so it has to be short!
		assertInvert(
			defaultDataStore._runtime.id.length <= 2,
			"short data store ID created in detached container",
		);

		const pkg = defaultDataStore._context.packagePath;

		// Ensure that we have a connection, and thus had a chance to delay-create ID compressor
		// This should only be required for "delayed" mode.
		if (enableRuntimeIdCompressor === "delayed") {
			defaultDataStore._root.set("foo", "bar");
			await provider.ensureSynchronized();
		}

		// Note: This theoretically could fail, as Id compressor is loaded async.
		// This could happen only in delayed mode test. If it happens, the only thing I can think of to fix it - spin here until it shows up.
		const idCompressor = (defaultDataStore._context.containerRuntime as any)
			._idCompressor as IIdCompressor;
		assert(idCompressor !== undefined, "we should have ID compressor by now");

		// This will do a lot of things!
		// 1) it will attempt to use ID Compressor to get short ID. This will force ID Compressor to do #3
		// 2) it will send op - providing opportunity for ID compressor to do #3
		// 3) ID compressor will send an op to reserve short IDs
		const ds = await defaultDataStore._context.containerRuntime.createDataStore(pkg);
		await ds.trySetAlias("anyName");

		// This should not be required (as alias assignment is essentially a barrier), but let's make sure we wait for all op acks,
		// and thus ID compressor to go around and reserve short IDs.
		await provider.ensureSynchronized();

		const entryPoint = (await ds.entryPoint.get()) as ITestDataObject;
		const id = entryPoint._context.id;
		// ID will be long in all cases, as that was the first attempt to use ID compressor, and thus it could only issue us UUIDs.
		assert(id.length > 8, "long ID");

		// Check directly that ID compressor is issuing short IDs!
		// If it does not, the rest of the tests would fail - this helps isolate where the bug is.
		const idTest = defaultDataStore._context.containerRuntime.generateDocumentUniqueId();
		assertInvert(typeof idTest === "number" && idTest >= 0, "short IDs should be issued");

		// create another datastore
		const ds2 = await defaultDataStore._context.containerRuntime.createDataStore(pkg);
		const entryPoint2 = (await ds2.entryPoint.get()) as ITestDataObject;

		// This data store was created in attached  container, and should have used ID compressor to assign ID!
		assertInvert(
			entryPoint2._runtime.id.length <= 2,
			"short data store ID created in attached container",
		);

		// Test assumption
		assert.equal(
			entryPoint2._runtime.attachState,
			AttachState.Detached,
			"data store is detached",
		);

		// Create some channel. Assume that data store has directory factory (ITestDataObject exposes _root that is directory,
		// so it has such entry). This could backfire if non-default type is used for directory - a test would need to be changed
		// if it changes in the future.
		const channel = entryPoint2._runtime.createChannel(
			undefined,
			SharedDirectory.getFactory().type,
		);
		assertInvert(channel.id.length <= 2, "DDS ID created in detached data store");

		// attached data store.
		await ds2.trySetAlias("foo");

		assert.equal(
			entryPoint2._runtime.attachState,
			AttachState.Attached,
			"data store is detached",
		);

		const channel2 = entryPoint2._runtime.createChannel(
			undefined,
			SharedDirectory.getFactory().type,
		);
		assertInvert(channel2.id.length <= 2, "DDS ID created in attached data store");
	}

	it("Container uses short DataStore & DDS IDs in delayed mode", async () => {
		await TestCompactIds("delayed");
	});

	it("Container uses short DataStore & DDS IDs in On mode", async () => {
		await TestCompactIds("on");
	});

	it("always uses short data store IDs in detached container", async () => {
		const loader = provider.makeTestLoader();
		const defaultCodeDetails: IFluidCodeDetails = {
			package: "defaultTestPackage",
			config: {},
		};
		const container = await loader.createDetachedContainer(defaultCodeDetails);
		const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
		assertInvert(
			defaultDataStore.context.id.length <= 2,
			"Default data store's ID should be short",
		);
		const dataStore1 =
			await defaultDataStore.context.containerRuntime.createDataStore(TestDataObjectType);
		const ds1 = (await dataStore1.entryPoint.get()) as ITestFluidObject;
		assertInvert(
			ds1.context.id.length <= 2,
			"Data store's ID in detached container should not be short",
		);
		const dds1 = SharedDirectory.create(ds1.runtime);
		assertInvert(dds1.id.length <= 2, "DDS's ID in detached container should not be short");

		await container.attach(provider.driver.createCreateNewRequest());

		const dataStore2 =
			await defaultDataStore.context.containerRuntime.createDataStore(TestDataObjectType);
		const ds2 = (await dataStore2.entryPoint.get()) as ITestFluidObject;
		assert(
			ds2.context.id.length > 8,
			"Data store's ID in attached container should not be short",
		);
		const dds2 = SharedDirectory.create(ds2.runtime);
		assert(dds2.id.length > 8, "DDS's ID in attached container should not be short");
	});
});

/**
 * These tests repro a bug where ODSP driver does not correctly decode encoded snapshot tree paths.
 * Data store / DDS created with special characters are encoded during summary upload but during
 * download, they are not correctly decoded in certain scenarios.
 */
describeCompat(
	"Short IDs in detached container",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const configProvider = createTestConfigProvider();
		const {
			dataRuntime: { TestFluidObjectFactory },
			containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
			dds: { SharedDirectory },
		} = apis;
		const defaultFactory = new TestFluidObjectFactory([]);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
		});

		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", async function () {
			provider = getTestObjectProvider();
			// The bug only happens with ODSP driver.
			if (provider.driver.type !== "odsp") {
				this.skip();
			}
			configProvider.set("Fluid.Runtime.UseShortIds", true);
		});

		/**
		 * The following functions validate the invert of the assert. We have a bug in one of our customer's app where a short
		 * data store ID created is `[` but in a downloaded snapshot, it is converted to its ASCII equivalent `%5B` in
		 * certain conditions. So, when an op comes for this data store with id `[`, containers loaded with this snapshot
		 * cannot find the data store.
		 *
		 * While we figure out the fix, we are disabling the ability to create short IDs and this assert validates it.
		 */
		function assertInvert(value: boolean, message: string) {
			assert(!value, message);
		}

		it("data store id with `[` not encoded / decoded correctly in snapshot`", async () => {
			const container = await provider.createDetachedContainer(runtimeFactory, {
				configProvider,
			});
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const containerRuntime = dataObject.context.containerRuntime;

			// The 13 datastore produces a shortId of "[" which is not decoded properly, so we need to make
			// 13 datastores to repro the bug.
			for (let i = 0; i < 13; i++) {
				const ds = await containerRuntime.createDataStore(defaultFactory.type);
				const dataObjectNew = (await ds.entryPoint.get()) as ITestFluidObject;
				dataObject.root.set(dataObjectNew.context.id, dataObjectNew.handle);
				if (i === 12) {
					assert.equal(dataObjectNew.context.id, "[", "The 13th data store id should be [");
				}
			}

			await provider.attachDetachedContainer(container);

			const dsWithBugHandle = dataObject.root.get<IFluidHandle<ITestFluidObject>>("[");
			assert(dsWithBugHandle !== undefined, "data store handle not found");
			const dsWithBug = await dsWithBugHandle.get();
			dsWithBug.root.set(`key13`, `value13`);

			// Reset documentServiceFactory so that a new one is created. Otherwise, the snapshot will be loaded
			// from cache for the new container which is the same one as uploaded by the first container.
			(provider as any)._documentServiceFactory = undefined;

			const container2 = await provider.loadContainer(runtimeFactory);

			await provider.ensureSynchronized();

			assert(!container2.closed, "container should not be closed");
		});

		it("DDS id containing `[` not encoded / decoded correctly in snapshot`", async () => {
			const loader = provider.makeTestLoader({ loaderProps: { configProvider } });
			const defaultCodeDetails: IFluidCodeDetails = {
				package: "defaultTestPackage",
				config: {},
			};
			const container1 = await loader.createDetachedContainer(defaultCodeDetails);
			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			const dds1 = SharedDirectory.create(dataStore1.runtime, "idWith[");
			dataStore1.root.set("dds1", dds1.handle);

			await provider.attachDetachedContainer(container1);

			// Reset documentServiceFactory so that a new one is created. Otherwise, the snapshot will be loaded
			// from cache for the new container which is the same one as uploaded by the first container.
			(provider as any)._documentServiceFactory = undefined;

			const container2 = await provider.loadTestContainer();
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const dds2Handle = dataStore2.root.get<IFluidHandle<ISharedDirectory>>("dds1");
			assert(dds2Handle !== undefined, "DDS handle not found");
			await assert.doesNotReject(async () => dds2Handle.get(), "Should be able to get DDS");
		});
	},
);
