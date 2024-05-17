/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	describeCompat,
	type CompatApis,
	type ITestObjectProviderOptions,
} from "@fluid-private/test-version-utils";
import { IFluidHandle, type FluidObject } from "@fluidframework/core-interfaces";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	createAndAttachContainer,
	ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import { type ISharedMatrix } from "@fluidframework/matrix/internal";
import {
	ConsensusResult,
	type ConsensusCallback,
	type IConsensusOrderedCollection,
} from "@fluidframework/ordered-collection/internal";
import {
	SharedTree,
	SchemaFactory,
	TreeConfiguration,
	type TreeView,
	type ISharedTree,
	type ITree,
} from "@fluidframework/tree/internal";
import { isObject } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { IChannel, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedMap, type ISharedDirectory } from "@fluidframework/map/internal";
import { ISharedCell } from "@fluidframework/cell/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import type { IConsensusRegisterCollection } from "@fluidframework/register-collection/internal";

const mapId = "map";
const stringId = "sharedString";
const cellId = "cell";
const counterId = "counter";
const directoryId = "directory";
const treeId = "tree";
const matrixId = "matrix";
const legacyTreeId = "legacyTree";
const registerId = "registerCollection";
const queueId = "consensusQueue";
const migrationShimId = "migrationShim";

function treeSetup(dds) {
	const builder = new SchemaFactory("test");
	class Bar extends builder.object("bar", {
		h: builder.optional(builder.handle),
	}) {}

	const config = new TreeConfiguration(Bar, () => ({
		h: undefined,
	}));

	const treeView: TreeView<typeof Bar> = dds.schematize(config);
	return treeView;
}

async function setup(
	getTestObjectProvider: (options?: ITestObjectProviderOptions) => ITestObjectProvider,
	apis: CompatApis,
) {
	const {
		SharedMap,
		SharedDirectory,
		SharedCounter,
		SharedString,
		SharedCell,
		SharedMatrix,
		ConsensusRegisterCollection,
		ConsensusQueue,
	} = apis.dds;

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[stringId, SharedString.getFactory()],
		[cellId, SharedCell.getFactory()],
		[counterId, SharedCounter.getFactory()],
		[directoryId, SharedDirectory.getFactory()],
		[treeId, SharedTree.getFactory()],
		[matrixId, SharedMatrix.getFactory()],
		// [legacyTreeId, LegacySharedTree.getFactory()],
		[registerId, ConsensusRegisterCollection.getFactory()],
		[queueId, ConsensusQueue.getFactory()],
		// [
		// 	migrationShimId,
		// 	new MigrationShimFactory(
		// 		LegacySharedTree.getFactory(),
		// 		SharedTree.getFactory(),
		// 		(legacyTree, newTree) => {
		// 			throw new Error("unreachable");
		// 		},
		// 	),
		// ],
	];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		simple: true,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
		},
	};

	const provider: ITestObjectProvider = getTestObjectProvider();
	const loader = provider.makeTestLoader(testContainerConfig);
	const container1 = await createAndAttachContainer(
		provider.defaultCodeDetails,
		loader,
		provider.driver.createCreateNewRequest(provider.documentId),
	);
	provider.updateDocumentId(container1.resolvedUrl);

	return {
		loader,
		provider,
		container1,
		testContainerConfig,
	};
}

type allDDS =
	| ISharedMap
	| ISharedCell
	| ISharedDirectory
	| SharedString
	| ISharedMatrix
	| ITree
	| IConsensusRegisterCollection<FluidObject>
	| IConsensusOrderedCollection<FluidObject>;

interface aDDSType<T extends allDDS = allDDS> {
	storeHandle(handle: IFluidHandle): void;
	readHandle(): Promise<unknown>;
	handle: IFluidHandle;
}

interface aDDSFactory {
	id: string;
	createDDS(
		runtime: IFluidDataStoreRuntime,
		apis: CompatApis,
		dataStore: ITestFluidObject | undefined,
	): aDDSType;
}

const ddsTypes: aDDSFactory[] = [
	{
		id: mapId,
		async createDDS(runtime, apis, dataStore) {
			const { SharedMap } = apis.dds;
			const map =
				dataStore === undefined
					? SharedMap.getFactory().create(runtime, mapId)
					: await dataStore.getSharedObject<ISharedMap>(mapId);
			return {
				storeHandle(handle: IFluidHandle) {
					map.set("B", handle);
				},
				async readHandle(): Promise<unknown> {
					return map.get("B");
				},
				handle: map.handle,
			};
		},
	},
];

interface handleType<T extends IChannel> {
	id: string;
	storeHandle: (dds: T, handle: IFluidHandle) => Promise<void>;
	readHandle: (dds: T) => Promise<unknown>;
	getTypedSharedObject: (dataStore: ITestFluidObject) => Promise<T>;
	createDDS: (runtime: IFluidDataStoreRuntime, apis: CompatApis) => T;
}

const handleFns = [
	{
		id: mapId,
		storeHandle: async (dds, handle) => {
			dds.set("B", handle);
		},
		readHandle: async (dds) => {
			return dds.get("B");
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<ISharedMap>(mapId);
		},
		createDDS: (runtime, apis) => {
			const { SharedMap } = apis.dds;
			return SharedMap.getFactory().create(runtime, mapId);
		},
	} satisfies handleType<ISharedMap>,
	{
		id: cellId,
		storeHandle: async (dds, handle) => {
			dds.set(handle);
		},
		readHandle: async (dds) => {
			return dds.get();
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<ISharedCell>(cellId);
		},
		createDDS: (runtime, apis) => {
			const { SharedCell } = apis.dds;
			return SharedCell.getFactory().create(runtime, cellId);
		},
	} satisfies handleType<ISharedCell>,
	{
		id: directoryId,
		storeHandle: async (dds, handle) => {
			dds.set("B", handle);
		},
		readHandle: async (dds) => {
			return dds.get("B");
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<ISharedDirectory>(directoryId);
		},
		createDDS: (runtime, apis) => {
			const { SharedDirectory } = apis.dds;
			return SharedDirectory.getFactory().create(runtime, directoryId);
		},
	} satisfies handleType<ISharedDirectory>,
	{
		id: stringId,
		storeHandle: async (dds, handle) => {
			dds.insertText(0, "hello");
			dds.annotateRange(0, 1, { B: handle });
		},
		readHandle: async (dds) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return dds.getPropertiesAtPosition(0)?.B;
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<SharedString>(stringId);
		},
		createDDS: (runtime, apis) => {
			const { SharedString } = apis.dds;
			return SharedString.getFactory().create(runtime, stringId);
		},
	} satisfies handleType<SharedString>,
	{
		id: matrixId,
		storeHandle: async (dds, handle) => {
			dds.insertRows(0, 1);
			dds.insertCols(0, 1);
			dds.setCell(0, 0, handle);
		},
		readHandle: async (dds) => {
			return dds.getCell(0, 0);
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<ISharedMatrix>(matrixId);
		},
		createDDS: (runtime, apis) => {
			const { SharedMatrix } = apis.dds;
			return SharedMatrix.getFactory().create(runtime, matrixId);
		},
		// deal with this
	} satisfies handleType<ISharedMatrix>,
	{
		id: treeId,
		storeHandle: async (dds, handle) => {
			const treeView = treeSetup(dds);
			treeView.root.h = handle;
		},
		readHandle: async (dds) => {
			const treeView = treeSetup(dds);
			return treeView.root.h;
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<ISharedTree>(treeId);
		},
		createDDS: (runtime, apis) => {
			return SharedTree.getFactory().create(runtime, treeId);
		},
		// itree as opposed to isharedtree???
	} satisfies handleType<ITree>,
	// {
	// 	type: legacyTreeId,
	// 	storeHandle: async (defaultDataStore, handle) => {
	// 		const treeRoot = await defaultDataStore.getSharedObject<LegacySharedTree>(legacyTreeId);
	// 		const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

	// 		const handleNode: BuildNode = {
	// 			definition: legacyNodeId,
	// 			traits: {
	// 				handle,
	// 			},
	// 		};
	// 		treeRoot.applyEdit(
	// 			Change.insertTree(
	// 				handleNode,
	// 				StablePlace.atStartOf({
	// 					parent: treeRoot.currentView.root,
	// 					label: legacyNodeId,
	// 				}),
	// 			),
	// 		);

	// 		const rootNode = treeRoot.currentView.getViewNode(treeRoot.currentView.root);
	// 		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// 		const nodeId = rootNode.traits.get(legacyNodeId)![0];
	// 		const change: Change = Change.setPayload(nodeId, handle);
	// 		treeRoot.applyEdit(change);
	// 	},
	// },
	{
		id: registerId,
		storeHandle: async (dds, handle) => {
			await dds.write("B", handle);
		},
		readHandle: async (dds) => {
			return dds.read("B");
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<IConsensusRegisterCollection<FluidObject>>(registerId);
		},
		createDDS: (runtime, apis) => {
			const { ConsensusRegisterCollection } = apis.dds;
			return ConsensusRegisterCollection.getFactory().create(runtime, registerId);
		},
	} satisfies handleType<IConsensusRegisterCollection<FluidObject>>,
	{
		id: queueId,
		storeHandle: async (dds, handle) => {
			await dds.add(handle);
		},
		readHandle: async (dds) => {
			let handle2: unknown;
			// dont know if this should be <IFluidHandle> or <FluidObject>
			const callback: ConsensusCallback<FluidObject> = async (value) => {
				handle2 = value;
				return ConsensusResult.Complete;
			};
			await dds.waitAndAcquire(callback);
			return handle2;
		},
		getTypedSharedObject: async (dataStore) => {
			return dataStore.getSharedObject<IConsensusOrderedCollection<FluidObject>>(queueId);
		},
		createDDS: (runtime, apis) => {
			const { ConsensusQueue } = apis.dds;
			return ConsensusQueue.getFactory().create(runtime, queueId);
		},
	} satisfies handleType<IConsensusOrderedCollection<FluidObject>>,
	// {
	// 	type: migrationShimId,
	// 	storeHandle: async (defaultDataStore, handle) => {
	// 		const migrationShimRoot = await defaultDataStore.getSharedObject<MigrationShim>(migrationShimId);
	// 		const tree = migrationShimRoot.currentTree as LegacySharedTree;
	// 		const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

	// 		const handleNode: BuildNode = {
	// 			definition: legacyNodeId,
	// 			traits: {
	// 				handle,
	// 			},
	// 		};
	// 		tree.applyEdit(
	// 			Change.insertTree(
	// 				handleNode,
	// 				StablePlace.atStartOf({
	// 					parent: tree.currentView.root,
	// 					label: legacyNodeId,
	// 				}),
	// 			),
	// 		);

	// 		const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// 		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	// 		const nodeId = rootNode.traits.get(legacyNodeId)![0];
	// 		const change = Change.setPayload(nodeId, handle);
	// 		tree.applyEdit(change);
	// 	},
	// },
];

// eslint-disable-next-line @typescript-eslint/no-misused-promises
describeCompat("handle validation", "NoCompat", async (getTestObjectProvider, apis) => {
	for (const handle of ddsTypes) {
		it.only(`store handle in dds: ${handle.id}`, async () => {
			const { container1, provider, testContainerConfig } = await setup(
				getTestObjectProvider,
				apis,
			);
			// let idA: string;
			// let seq: number;
			// let dds;

			const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
			const runtime = defaultDataStore.context.containerRuntime;
			const idA = defaultDataStore.context.id;

			const dataStoreB = await runtime.createDataStore(["default"]);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			const dds = handle.createDDS(defaultDataStore.runtime, apis, dataObjectB);

			dds.storeHandle(dataObjectB.handle);

			await provider.ensureSynchronized();
			const seq = container1.deltaManager.lastSequenceNumber;
			container1.dispose();

			const container2 = await provider.loadTestContainer(testContainerConfig);
			if (container2.deltaManager.lastSequenceNumber < seq) {
				await new Promise<void>((resolve, reject) => {
					const func = () => {
						if (container2.deltaManager.lastSequenceNumber >= seq) {
							container2.deltaManager.off("op", func);
							container2.off("closed", reject);
							resolve();
						}
					};
					container2.deltaManager.on("op", func);
					container2.once("closed", reject);
				});
			}

			const default2 = (await container2.getEntryPoint()) as ITestFluidObject;

			const actualVal = await dds.readHandle();
			assert(isFluidHandle(actualVal), `not a handle: ${actualVal}`);

			const actualObject = await actualVal.get();
			assert(isObject(actualObject), "not an object");

			const actualId: FluidObject<ITestFluidObject> = actualObject;
			assert(actualId.ITestFluidObject?.context.id, idA);
		});
	}

	/**
	 * actual new tests: store handle to detached dds in an attached dds
	 *
	 * will need 3 nested loops:
	 * first loop: creates a detached dds
	 * second loop: creates a detached dds and stores handle from dds in first loop
	 * third loop: have attached dds, store handle to dds from second loop
	 *
	 * will also need to:
	 * add create in handlefns
	 * update store and read to take in the dds instead of the datastore to support using the detached ones
	 */
	for (const detachedDds1Utils of ddsTypes) {
		for (const detachedDds2Utils of ddsTypes) {
			for (const attachedDdsUtils of ddsTypes) {
				it(`stores ${detachedDds1Utils.id} handle in ${detachedDds2Utils.id} and attaches by storing in ${attachedDdsUtils.id}`, async () => {
					/**
					 * setup required for all portions of the test
					 */
					const { container1, provider, testContainerConfig } = await setup(
						getTestObjectProvider,
						apis,
					);

					const attachedDataStore =
						(await container1.getEntryPoint()) as ITestFluidObject;
					const fluidRuntime = attachedDataStore.runtime;
					const idA = attachedDataStore.context.id;

					/**
					 * create the first detached dds
					 */
					const createdDds1 = detachedDds1Utils.createDDS(fluidRuntime, apis, undefined);

					/**
					 * create the second detached dds and store a handle to the first dds in it
					 */
					const createdDds2 = detachedDds2Utils.createDDS(fluidRuntime, apis, undefined);
					createdDds2.storeHandle(createdDds1.handle);

					/**
					 * set up the attached data store, data object, and get the attached dds
					 */

					const containerRuntime = attachedDataStore.context.containerRuntime;
					const detachedDataStore1 = await containerRuntime.createDataStore(["default"]);
					const detachedDataObject1 =
						(await detachedDataStore1.entryPoint.get()) as ITestFluidObject;
					// typing is still off
					// const attachedDds = await attachedDataStore.getSharedObject<>(
					// 	attachedDdsUtils.id,
					// );
					// const attachedDds =
					// 	await attachedDdsUtils.getTypedSharedObject(attachedDataStore);
					const attachedDds = attachedDdsUtils.createDDS(
						fluidRuntime,
						apis,
						attachedDataStore,
					);
					/**
					 * store handle to dds2 in attached dds (which will attach ddss 1 and 2)
					 */
					attachedDds.storeHandle(createdDds2.handle);

					/**
					 * close container, get sequence number and sync
					 */
					await provider.ensureSynchronized();
					const seq = container1.deltaManager.lastSequenceNumber;
					container1.dispose();

					const container2 = await provider.loadTestContainer(testContainerConfig);
					if (container2.deltaManager.lastSequenceNumber < seq) {
						await new Promise<void>((resolve, reject) => {
							const func = () => {
								if (container2.deltaManager.lastSequenceNumber >= seq) {
									container2.deltaManager.off("op", func);
									container2.off("closed", reject);
									resolve();
								}
							};
							container2.deltaManager.on("op", func);
							container2.once("closed", reject);
						});
					}

					/**
					 * validate handle to detached 1 stored in detached 2
					 */
					const default2 = (await container2.getEntryPoint()) as ITestFluidObject;
					// not sure if this is the right way to get the dds after attaching everything
					const val1 = await createdDds2.readHandle();
					assert(isObject(val1), `not a handle: ${val1}`);
					const handle1: FluidObject<IFluidHandle> = val1;

					const obj1 = await handle1.IFluidHandle?.get();
					assert(isObject(obj1), "not an object");

					const id1: FluidObject<ITestFluidObject> = obj1;
					// this is not necessarily comparing to the right id
					assert(id1.ITestFluidObject?.context.id, idA);

					/**
					 * validate handle to detached 2 stored in attached
					 */
					// typing again
					const attachedVal = attachedDdsUtils.createDDS(fluidRuntime, apis, default2);
					const val2 = await attachedVal.readHandle();
					assert(isObject(val2), `not a handle: ${val2}`);
					const handle2: FluidObject<IFluidHandle> = val2;

					const obj2 = await handle2.IFluidHandle?.get();
					assert(isObject(obj2), "not an object");

					const id2: FluidObject<ITestFluidObject> = obj2;
					// this is not necessarily comparing to the right id
					assert(id2.ITestFluidObject?.context.id, idA);
				});
			}
		}
	}
});
