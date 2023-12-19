/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import type { SharedMap } from "@fluidframework/map";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createSummarizer,
	createContainerRuntimeFactoryWithDefaultDataStore,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import type { SharedCell } from "@fluidframework/cell";
import {
	IIdCompressor,
	SessionSpaceCompressedId,
	StableId,
} from "@fluidframework/runtime-definitions";
import type { SharedObjectCore } from "@fluidframework/shared-object-base";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { stringToBuffer } from "@fluid-internal/client-utils";

function getIdCompressor(dds: SharedObjectCore): IIdCompressor {
	return (dds as any).runtime.idCompressor as IIdCompressor;
}

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
		public map!: SharedMap;

		private readonly sharedCellKey = "sharedCell";
		public sharedCell!: SharedCell;

		protected async initializingFirstTime() {
			const sharedMap = SharedMap.create(this.runtime);
			this.root.set(this.sharedMapKey, sharedMap.handle);

			const sharedCell = SharedCell.create(this.runtime);
			this.root.set(this.sharedCellKey, sharedCell.handle);
		}

		protected async hasInitialized() {
			const mapHandle = this.root.get<IFluidHandle<SharedMap>>(this.sharedMapKey);
			assert(mapHandle !== undefined, "SharedMap not found");
			this.map = await mapHandle.get();

			const sharedCellHandle = this.root.get<IFluidHandle<SharedCell>>(this.sharedCellKey);
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
		enableRuntimeIdCompressor: true,
	};

	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		ContainerRuntimeFactoryWithDefaultDataStore,
		{
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			runtimeOptions,
		},
	);

	let containerRuntime: ContainerRuntime;
	let container1: IContainer;
	let container2: IContainer;
	let mainDataStore: TestDataObject;

	let sharedMapContainer1: SharedMap;
	let sharedMapContainer2: SharedMap;
	let sharedMapContainer3: SharedMap;

	let sharedCellContainer1: SharedCell;

	const createContainer = async (): Promise<IContainer> =>
		provider.createContainer(runtimeFactory);

	beforeEach(async () => {
		provider = getTestObjectProvider();
		container1 = await createContainer();
		mainDataStore = (await container1.getEntryPoint()) as TestDataObject;
		containerRuntime = mainDataStore._context.containerRuntime as ContainerRuntime;
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

	it("has no compressor if not enabled", async () => {
		provider.reset();
		const config: ITestContainerConfig = {
			registry: [
				["mapId", SharedMap.getFactory()],
				["cellId", SharedCell.getFactory()],
			],
			fluidDataObjectType: DataObjectFactoryType.Test,
		};
		const container = await provider.makeTestContainer(config);
		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataObject.getSharedObject<SharedMap>("mapId");

		assert(getIdCompressor(map) === undefined);
	});

	it("can't enable compressor on an existing container", async () => {
		provider.reset();
		const config: ITestContainerConfig = {
			registry: [
				["mapId", SharedMap.getFactory()],
				["cellId", SharedCell.getFactory()],
			],
			fluidDataObjectType: DataObjectFactoryType.Test,
		};
		const container = await provider.makeTestContainer(config);
		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataObject.getSharedObject<SharedMap>("mapId");
		assert(getIdCompressor(map) === undefined);

		const enabledConfig: ITestContainerConfig = {
			registry: [
				["mapId", SharedMap.getFactory()],
				["cellId", SharedCell.getFactory()],
			],
			fluidDataObjectType: DataObjectFactoryType.Test,
			runtimeOptions: {
				enableRuntimeIdCompressor: true,
			},
		};

		const enabledContainer = await provider.loadTestContainer(enabledConfig);
		const enabledDataObject = (await enabledContainer.getEntryPoint()) as ITestFluidObject;
		const enabledMap = await enabledDataObject.getSharedObject<SharedMap>("mapId");
		assert(getIdCompressor(enabledMap) === undefined);
	});

	it("can't disable compressor if previously enabled on existing container", async () => {
		// Create a container without the runtime option to enable the compressor.
		// The first container should set a metadata property that automatically should
		// enable it for any other container runtimes that are created.
		const runtimeFactoryWithoutCompressorEnabled =
			createContainerRuntimeFactoryWithDefaultDataStore(
				ContainerRuntimeFactoryWithDefaultDataStore,
				{
					defaultFactory,
					registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
				},
			);

		const container4 = await provider.loadContainer(runtimeFactoryWithoutCompressorEnabled);
		const container4MainDataStore = (await container4.getEntryPoint()) as TestDataObject;
		const sharedMapContainer4 = container4MainDataStore.map;

		assert(
			getIdCompressor(sharedMapContainer4) !== undefined,
			"Compressor should exist if it has ever been enabled",
		);
	});

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
			assert.strictEqual(
				getIdCompressor(sharedMapContainer1).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				-(i + 1),
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer2).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				-(i + 1),
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer3).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				-(i + 1),
			);
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
		for (let i = 0; i < 512; i++) {
			assert.strictEqual(
				getIdCompressor(sharedMapContainer1).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				i,
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer2).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				i + 1024,
			);

			assert.strictEqual(
				getIdCompressor(sharedMapContainer3).normalizeToOpSpace(
					-(i + 1) as SessionSpaceCompressedId,
				),
				i + 2048,
			);
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

		assert.strictEqual(opSpaceId, 0);
		assert.strictEqual(normalizedSessionSpaceId, -1);
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
		assert.strictEqual(finalId3, 2);

		sharedMapContainer1.set("key2", "value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId1);
		const opSpaceId2 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId2);
		const opSpaceId3 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(finalId3);

		assert.strictEqual(opSpaceId1, 0);
		assert.strictEqual(opSpaceId2, 1);
		assert.strictEqual(opSpaceId3, 2);
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
		assert.strictEqual(finalId3, 2);
		const finalId4 = getIdCompressor(sharedCellContainer1).generateCompressedId();
		assert.strictEqual(finalId4, 3);

		sharedMapContainer1.set("key2", "value2");
		sharedCellContainer1.set("value2");
		await provider.ensureSynchronized();

		const opSpaceId1 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(localId1);
		const opSpaceId2 = getIdCompressor(sharedCellContainer1).normalizeToOpSpace(localId2);
		const opSpaceId3 = getIdCompressor(sharedMapContainer1).normalizeToOpSpace(finalId3);
		const opSpaceId4 = getIdCompressor(sharedCellContainer1).normalizeToOpSpace(finalId4);

		assert.strictEqual(opSpaceId1, 0);
		assert.strictEqual(opSpaceId2, 1);
		assert.strictEqual(opSpaceId3, 2);
		assert.strictEqual(opSpaceId3, finalId3);
		assert.strictEqual(opSpaceId4, 3);
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
		assert(getIdCompressor(sharedMapContainer1) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedMapContainer2) !== undefined, "IdCompressor is undefined");
		assert(getIdCompressor(sharedMapContainer3) !== undefined, "IdCompressor is undefined");

		const firstIdContainer1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		const secondIdContainer2 = getIdCompressor(sharedMapContainer2).generateCompressedId();
		const thirdIdContainer2 = getIdCompressor(sharedMapContainer2).generateCompressedId();
		const decompressedIds: string[] = [];

		const firstDecompressedIdContainer1 =
			getIdCompressor(sharedMapContainer1).decompress(firstIdContainer1);
		decompressedIds.push(firstDecompressedIdContainer1);

		[secondIdContainer2, thirdIdContainer2].forEach((id) => {
			assert(getIdCompressor(sharedMapContainer2) !== undefined, "IdCompressor is undefined");
			const decompressedId = getIdCompressor(sharedMapContainer2).decompress(id);
			decompressedIds.push(decompressedId);
		});

		// should be negative
		assert(
			getIdCompressor(sharedMapContainer1).normalizeToOpSpace(firstIdContainer1) < 0,
			"Expected op space id to be < 0",
		);
		assert(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(secondIdContainer2) < 0,
			"Expected op space id to be < 0",
		);
		assert(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(thirdIdContainer2) < 0,
			"Expected op space id to be < 0",
		);

		sharedMapContainer1.set(firstDecompressedIdContainer1, "value1");
		await provider.ensureSynchronized();
		[secondIdContainer2, thirdIdContainer2].forEach((id, index) => {
			assert(getIdCompressor(sharedMapContainer2) !== undefined, "IdCompressor is undefined");
			const decompressedId = getIdCompressor(sharedMapContainer2).decompress(id);
			sharedMapContainer2.set(decompressedId, `value${index + 2}`);
		});
		await provider.ensureSynchronized();

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToOpSpace(firstIdContainer1),
			0,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(secondIdContainer2),
			513,
		);
		assert.strictEqual(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(thirdIdContainer2),
			514,
		);

		decompressedIds.forEach((id, index) => {
			assert.equal(sharedMapContainer1.get(id), `value${index + 1}`);
			assert.equal(sharedMapContainer2.get(id), `value${index + 1}`);
		});
	});

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
		const sharedCellCompressedId = getIdCompressor(sharedCellContainer1).generateCompressedId();
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

	it("Ids generated when disconnected are correctly resubmitted", async () => {
		// Disconnect the first container
		container1.disconnect();

		// Generate a new Id in the disconnected container
		const id1 = getIdCompressor(sharedMapContainer1).generateCompressedId();
		// Trigger Id submission
		sharedMapContainer1.set("key", "value");

		// Generate ids in a connected container but don't send them yet
		const id2 = getIdCompressor(sharedMapContainer2).generateCompressedId();
		const id3 = getIdCompressor(sharedMapContainer2).generateCompressedId();

		// Reconnect the first container
		// IdRange should be resubmitted and reflected in all compressors
		container1.connect();
		await waitForContainerConnection(container1);
		await provider.ensureSynchronized();

		assert.strictEqual(
			getIdCompressor(sharedMapContainer1).normalizeToOpSpace(id1),
			0,
			"First container should get first cluster and allocate Id 0",
		);

		// Send the id generated in the second, connected container
		sharedMapContainer2.set("key2", "value2");
		await provider.ensureSynchronized();

		assert.strictEqual(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(id2),
			513,
			"Second container should get second cluster and allocate Id 512",
		);

		assert.strictEqual(
			getIdCompressor(sharedMapContainer2).normalizeToOpSpace(id3),
			514,
			"Second Id from second container should get second cluster and allocate Id 513",
		);
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

describeCompat("IdCompressor in detached container", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	let request: IRequest;

	beforeEach(() => {
		provider = getTestObjectProvider();
		request = provider.driver.createCreateNewRequest(provider.documentId);
	});

	it("Compressors sync after detached container attaches and sends an op", async () => {
		const testConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry: [["sharedCell", apis.dds.SharedCell.getFactory()]],
			runtimeOptions: {
				enableRuntimeIdCompressor: true,
			},
		};
		const loader = provider.makeTestLoader(testConfig);
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const testChannel1 = await dataStore.getSharedObject<SharedCell>("sharedCell");

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
		const testChannel2 = await dataStore2.getSharedObject<SharedCell>("sharedCell");
		// Generate an Id in the second attached container and send an op to send the Ids
		(testChannel2 as any).runtime.idCompressor.generateCompressedId();
		testChannel2.set("value");

		await provider.ensureSynchronized();

		// Send an op in the first container to get its Ids sent
		testChannel1.set("value2");

		await provider.ensureSynchronized();

		// Compressor from second container will get the first 512 Ids (0-511)
		assert.strictEqual((testChannel2 as any).runtime.idCompressor.normalizeToOpSpace(-1), 0);
		// Compressor from first container gets second cluster starting at 512 after sending an op
		assert.strictEqual((testChannel1 as any).runtime.idCompressor.normalizeToOpSpace(-1), 513);
	});
});

describeCompat("IdCompressor Summaries", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const enabledConfig: ITestContainerConfig = {
		runtimeOptions: { enableRuntimeIdCompressor: true },
	};

	const createContainer = async (config?: ITestContainerConfig): Promise<IContainer> =>
		provider.makeTestContainer(config);

	beforeEach(async () => {
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
		const { summarizer } = await createSummarizer(provider, container);
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
		const compressorSummary = summaryTree.tree[".idCompressor"];
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
		assert(summaryStats.sessionCount === 1, "Should have a local session as all ids are ack'd");
		assert(summaryStats.clusterCount === 1, "Should have a local cluster as all ids are ack'd");
	});

	it("Newly connected container synchronizes from summary", async () => {
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
		assert(summaryStats.sessionCount === 1, "Should have a local session as all ids are ack'd");
		assert(summaryStats.clusterCount === 1, "Should have a local cluster as all ids are ack'd");

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
});
