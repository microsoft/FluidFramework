/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { describeCompat } from "@fluid-private/test-version-utils";
import { ISharedCell } from "@fluidframework/cell/internal";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	IFluidHandle,
	IFluidLoadable,
	type FluidObject,
} from "@fluidframework/core-interfaces";
import { isObject } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, type ISharedDirectory } from "@fluidframework/map/internal";
import { SharedMatrixFactory, type ISharedMatrix } from "@fluidframework/matrix/internal";
import type { ConsensusQueue } from "@fluidframework/ordered-collection/internal";
import {
	ConsensusRegisterCollectionFactory,
	type IConsensusRegisterCollection,
} from "@fluidframework/register-collection/internal";
import { IDataStore } from "@fluidframework/runtime-definitions/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import type {
	ISharedObjectKind,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	createAndAttachContainer,
	ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import {
	ITree,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree";
import { SharedTree, type ISharedTree } from "@fluidframework/tree/internal";

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

const builder = new SchemaFactory("test");
class Bar extends builder.object("bar", {
	h: builder.optional(builder.handle),
}) {}
function treeSetup(dds: ITree) {
	const config = new TreeViewConfiguration({ schema: Bar });

	const view = dds.viewWith(config);
	if (view.compatibility.canInitialize) {
		view.initialize({ h: undefined });
	}

	return view;
}

interface aDDSType {
	id: string;
	storeHandle(handle: IFluidHandle): Promise<void>;
	readHandle(): Promise<unknown>;
	handle: IFluidHandle;
}

interface aDDSFactory {
	id: string;
	type: string;
	createDDS(runtime: IFluidDataStoreRuntime): aDDSType;
	downCast(channel: IChannel): aDDSType;
	getDDS(dataStore: ITestFluidObject): Promise<aDDSType>;
}

/**
 * IFluidHandle.get() with additional runtime validation that it returns a TestFluidObject.
 */
async function dereferenceToTestFluidObject(handle: IFluidHandle): Promise<ITestFluidObject> {
	const handleGetResult = await handle.get();
	assert(isObject(handleGetResult), "not an object");

	const maybeDataObjectB: FluidObject<ITestFluidObject> = handleGetResult;
	assert(
		maybeDataObjectB.ITestFluidObject !== undefined,
		"Expected handle to round-trip to test fluid object",
	);
	return maybeDataObjectB.ITestFluidObject;
}

/**
 * IFluidHandle.get() with additional runtime validation that it returns SharedObject of the expected kind.
 */
async function dereferenceToSharedObject<TSharedObject>(
	handle: IFluidHandle,
	sharedObjectKind: ISharedObjectKind<TSharedObject> & SharedObjectKind<TSharedObject>,
): Promise<TSharedObject> {
	const handleGetResult = await handle.get();
	assert(isObject(handleGetResult), "Handle did not reference an object.");
	const maybeRootMap: FluidObject<IFluidLoadable> = handleGetResult;
	assert(
		maybeRootMap.IFluidLoadable !== undefined,
		"Handle did not reference an IFluidLoadable.",
	);
	const sharedObject = maybeRootMap.IFluidLoadable;
	assert(
		sharedObjectKind.is(sharedObject),
		`Handle did not reference a ${sharedObjectKind.getFactory().type}.`,
	);
	return sharedObject;
}

describeCompat("handle validation", "NoCompat", (getTestObjectProvider, apis) => {
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

	const { ConsensusResult } = apis.dataRuntime.packages.orderedCollection;

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

	const handleStorageFactories: aDDSFactory[] = [
		{
			id: mapId,
			type: "https://graph.microsoft.com/types/map",
			createDDS(runtime) {
				const map = runtime.createChannel(undefined, SharedMap.getFactory().type);
				return this.downCast(map);
			},
			downCast(channel): aDDSType {
				const map = channel as ISharedMap;
				return {
					id: map.id,
					async storeHandle(handle: IFluidHandle) {
						map.set("B", handle);
					},
					async readHandle(): Promise<unknown> {
						return map.get("B");
					},
					handle: map.handle,
				};
			},
			async getDDS(dataStore) {
				const map = await dataStore.getSharedObject<ISharedMap>(mapId);
				return this.downCast(map);
			},
		},
		{
			id: cellId,
			type: "https://graph.microsoft.com/types/cell",
			createDDS(runtime) {
				const cell = runtime.createChannel(undefined, SharedCell.getFactory().type);
				return this.downCast(cell);
			},
			downCast(channel): aDDSType {
				const cell = channel as ISharedCell;
				return {
					id: cell.id,
					async storeHandle(handle: IFluidHandle) {
						cell.set(handle);
					},
					async readHandle(): Promise<unknown> {
						return cell.get();
					},
					handle: cell.handle,
				};
			},
			async getDDS(dataStore) {
				const cell = await dataStore.getSharedObject<ISharedCell>(cellId);
				return this.downCast(cell);
			},
		},
		{
			id: directoryId,
			type: "https://graph.microsoft.com/types/directory",
			createDDS(runtime) {
				const directory = runtime.createChannel(undefined, SharedDirectory.getFactory().type);
				return this.downCast(directory);
			},
			downCast(channel): aDDSType {
				const directory = channel as ISharedDirectory;
				return {
					id: directory.id,
					async storeHandle(handle: IFluidHandle) {
						directory.set("B", handle);
					},
					async readHandle(): Promise<unknown> {
						return directory.get("B");
					},
					handle: directory.handle,
				};
			},
			async getDDS(dataStore) {
				const directory = await dataStore.getSharedObject<ISharedDirectory>(directoryId);
				return this.downCast(directory);
			},
		},
		{
			id: stringId,
			type: "https://graph.microsoft.com/types/mergeTree",
			createDDS(runtime) {
				const string = runtime.createChannel(undefined, SharedString.getFactory().type);
				return this.downCast(string);
			},
			downCast(channel): aDDSType {
				const string = channel as SharedString;
				return {
					id: string.id,
					async storeHandle(handle: IFluidHandle) {
						string.insertText(0, "hello");
						string.annotateRange(0, 1, { B: handle });
					},
					async readHandle(): Promise<unknown> {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return string.getPropertiesAtPosition(0)?.B;
					},
					handle: string.handle,
				};
			},
			async getDDS(dataStore) {
				const string = await dataStore.getSharedObject<SharedString>(stringId);
				return this.downCast(string);
			},
		},
		{
			id: matrixId,
			type: SharedMatrixFactory.Type,
			createDDS(runtime) {
				const matrix = runtime.createChannel(undefined, SharedMatrix.getFactory().type);
				return this.downCast(matrix);
			},
			downCast(channel): aDDSType {
				const matrix = channel as ISharedMatrix;
				return {
					id: matrix.id,
					async storeHandle(handle: IFluidHandle) {
						matrix.insertRows(0, 1);
						matrix.insertCols(0, 1);
						matrix.setCell(0, 0, handle);
					},
					async readHandle(): Promise<unknown> {
						return matrix.getCell(0, 0);
					},
					handle: matrix.handle,
				};
			},
			async getDDS(dataStore) {
				const matrix = await dataStore.getSharedObject<ISharedMatrix>(matrixId);
				return this.downCast(matrix);
			},
		},
		{
			id: treeId,
			type: SharedTree.getFactory().type,
			createDDS(runtime) {
				const tree = runtime.createChannel(undefined, SharedTree.getFactory().type);
				return this.downCast(tree);
			},
			downCast(channel): aDDSType {
				const view: TreeView<typeof Bar> = treeSetup(channel as ISharedTree);

				return {
					id: channel.id,
					async storeHandle(handle: IFluidHandle) {
						view.root.h = handle;
					},
					async readHandle(): Promise<unknown> {
						return view.root.h;
					},
					handle: channel.handle,
				};
			},
			async getDDS(dataStore) {
				const tree = await dataStore.getSharedObject<ISharedTree>(treeId);
				return this.downCast(tree);
			},
		},
		{
			id: registerId,
			type: ConsensusRegisterCollectionFactory.Type,
			createDDS(runtime) {
				const register = runtime.createChannel(
					undefined,
					ConsensusRegisterCollection.getFactory().type,
				);
				return this.downCast(register);
			},
			downCast(channel): aDDSType {
				const register = channel as IConsensusRegisterCollection<FluidObject>;
				return {
					id: register.id,
					async storeHandle(handle: IFluidHandle) {
						await register.write("B", handle);
					},
					async readHandle(): Promise<unknown> {
						return register.read("B");
					},
					handle: register.handle,
				};
			},
			async getDDS(dataStore) {
				const register =
					await dataStore.getSharedObject<IConsensusRegisterCollection<FluidObject>>(
						registerId,
					);
				return this.downCast(register);
			},
		},
		{
			id: queueId,
			type: ConsensusQueue.getFactory().type,
			createDDS(runtime) {
				const register = runtime.createChannel(undefined, ConsensusQueue.getFactory().type);
				return this.downCast(register);
			},
			downCast(channel): aDDSType {
				const queue = channel as ConsensusQueue<FluidObject>;
				return {
					id: queue.id,
					async storeHandle(handle: IFluidHandle) {
						await queue.add(handle);
					},
					async readHandle(): Promise<unknown> {
						const value = await new Promise((resolve, reject) => {
							queue
								.acquire(async (result: FluidObject) => {
									resolve(result);
									return ConsensusResult.Release;
								})
								.catch((error) => reject(error));
						});
						return value;
					},
					handle: queue.handle,
				};
			},
			async getDDS(dataStore) {
				const queue = await dataStore.getSharedObject<ConsensusQueue<FluidObject>>(queueId);
				return this.downCast(queue);
			},
		},
	];

	const ddsFactoriesByType = new Map<string, aDDSFactory>(
		handleStorageFactories.map((factory) => [factory.type, factory]),
	);

	async function getReferencedDDS(handle: IFluidHandle): Promise<aDDSType> {
		const channel = (await handle.get()) as IChannel;
		const factory = ddsFactoriesByType.get(channel.attributes.type);
		assert(factory !== undefined);
		return factory.downCast(channel);
	}

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
		},
	};

	async function setup() {
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
		};
	}

	/**
	 * Loads a container and waits for its sequence number to catch up to some existing container (at the time the function begins).
	 */
	async function loadAndCatchUpContainer(
		provider: ITestObjectProvider,
		existingContainer: IContainer,
	): Promise<IContainer> {
		const seq = existingContainer.deltaManager.lastSequenceNumber;
		const newContainer = await provider.loadTestContainer(testContainerConfig);
		if (newContainer.deltaManager.lastSequenceNumber < seq) {
			await new Promise<void>((resolve, reject) => {
				const func = () => {
					if (newContainer.deltaManager.lastSequenceNumber >= seq) {
						newContainer.deltaManager.off("op", func);
						newContainer.off("closed", reject);
						resolve();
					}
				};
				newContainer.deltaManager.on("op", func);
				newContainer.once("closed", reject);
			});
		}
		return newContainer;
	}

	for (const handleStorageFactory of handleStorageFactories) {
		describe(handleStorageFactory.id, () => {
			/**
			 * General setup:
			 *
			 * 1. Create a container with an initially attached default data store.
			 * 2. Create a detached data store (dataStoreB) and a DDS of the type being tested.
			 * 3. Reference the detached data store from the DDS with the DDS still detached
			 * 4. Attach the DDS by referencing it from the default data store. This should also attach the transitively referenced data store,
			 * as well as its `root` DDS. This is then validated from a second container.
			 */
			it(`can store a handle to detached dataObject while detached then attach`, async () => {
				const { container1, provider } = await setup();

				{
					const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
					const containerRuntime = defaultDataStore.context.containerRuntime;

					const dataStoreB = await containerRuntime.createDataStore(["default"]);
					const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;

					// Make some edits to dataObjectB's root directory for validation at the end of the test
					dataObjectB.root.set("foo", "bar");
					dataObjectB.root.set("dataStoreId", dataObjectB.context.id);

					const dds = handleStorageFactory.createDDS(defaultDataStore.runtime);
					await dds.storeHandle(dataObjectB.handle);

					// Attach `dds`, which should also cause `dataObjectB` to attach.
					defaultDataStore.root.set("handleToDDS", dds.handle);
				}

				await provider.ensureSynchronized();

				const container2 = await loadAndCatchUpContainer(provider, container1);
				container1.dispose();

				// Validate that the created objects were attached and have correct data in the new container.
				{
					const defaultDataStore = (await container2.getEntryPoint()) as ITestFluidObject;
					const ddsHandle = defaultDataStore.root.get("handleToDDS");
					assert(isFluidHandle(ddsHandle), `not a handle: ${ddsHandle}`);
					const dds = await getReferencedDDS(ddsHandle);

					const dataObjectHandle = await dds.readHandle();
					assert(isFluidHandle(dataObjectHandle), `not a handle: ${dataObjectHandle}`);

					const dataObjectB = await dereferenceToTestFluidObject(dataObjectHandle);

					assert.equal(dataObjectB.root.get("foo"), "bar");
					assert.equal(dataObjectB.root.get("dataStoreId"), dataObjectB.context.id);
				}
			});

			/**
			 * Like the above case, but rather than have the detached DDS reference a data object, it references the (detached) `root` DDS
			 * of that data object.
			 */
			it(`can store a handle to detached dataObject.root while detached then attach`, async () => {
				const { container1, provider } = await setup();

				{
					const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
					const containerRuntime = defaultDataStore.context.containerRuntime;

					const dataStoreB = await containerRuntime.createDataStore(["default"]);
					const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
					dataObjectB.root.set("foo", "bar");
					dataObjectB.root.set("dataStoreId", dataObjectB.context.id);

					const dds = handleStorageFactory.createDDS(defaultDataStore.runtime);
					await dds.storeHandle(dataObjectB.root.handle);

					// Attach `dds`, which should also cause `dataObjectB` and its `.root` DDS to attach.
					defaultDataStore.root.set("handleToDDS", dds.handle);
				}

				await provider.ensureSynchronized();

				const container2 = await loadAndCatchUpContainer(provider, container1);
				container1.dispose();

				// Validate that the created objects were attached and have correct data in the new container.
				{
					const defaultDataStore = (await container2.getEntryPoint()) as ITestFluidObject;
					const ddsHandle = defaultDataStore.root.get("handleToDDS");
					assert(isFluidHandle(ddsHandle), `not a handle: ${ddsHandle}`);
					const dds = await getReferencedDDS(ddsHandle);

					const dataObjectRootDirectoryHandle = await dds.readHandle();
					assert(
						isFluidHandle(dataObjectRootDirectoryHandle),
						`not a handle: ${dataObjectRootDirectoryHandle}`,
					);

					const root = await dereferenceToSharedObject(
						dataObjectRootDirectoryHandle,
						SharedMap,
					);

					// Application logic would typically have stored a direct handle to the dataObject they created somewhere,
					// which would normally be used rather than this access violation (reaching into the DDS to grab its runtime).
					// However, doing so in this test would change the handle graph, which affects the traversal that happens at attach time,
					// which could make this test redundant with the previous one.
					const maybeDataObjectB: FluidObject<ITestFluidObject> = await (
						root as unknown as { runtime: IDataStore }
					).runtime.entryPoint.get();
					assert(
						maybeDataObjectB.ITestFluidObject !== undefined,
						"Expected dataObjectB to round-trip",
					);
					const dataObjectB = maybeDataObjectB.ITestFluidObject;

					assert.equal(root.get("foo"), "bar");
					assert.equal(root.get("dataStoreId"), dataObjectB.context.id);
				}
			});
		});
	}

	for (const {
		detachedDds1Utils,
		attachedDdsUtils,
		detachedDds2Utils,
	} of generatePairwiseOptions({
		detachedDds1Utils: handleStorageFactories,
		detachedDds2Utils: handleStorageFactories,
		attachedDdsUtils: handleStorageFactories,
	})) {
		it(`stores ${detachedDds1Utils.id} handle in ${detachedDds2Utils.id} and attaches by storing in ${attachedDdsUtils.id}`, async () => {
			/**
			 * setup required for all portions of the test
			 */
			const { container1, provider } = await setup();

			const attachedDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
			await provider.ensureSynchronized();

			/**
			 * create the first detached dds
			 */
			const createdDds1 = detachedDds1Utils.createDDS(attachedDataStore.runtime);

			/**
			 * create the second detached dds and store a handle to the first dds in it
			 */
			const createdDds2 = detachedDds2Utils.createDDS(attachedDataStore.runtime);
			await createdDds2.storeHandle(createdDds1.handle);

			/**
			 * get the attached dds
			 */
			const attachedDds = await attachedDdsUtils.getDDS(attachedDataStore);

			/**
			 * store handle to dds2 in attached dds (which will attach ddss 1 and 2)
			 */
			await attachedDds.storeHandle(createdDds2.handle);

			/**
			 * close container, get sequence number and sync
			 */
			await provider.ensureSynchronized(container1);
			const seq = container1.deltaManager.lastSequenceNumber;
			container1.dispose();

			const container2 = await provider.loadTestContainer(testContainerConfig);
			if (container2.deltaManager.lastSequenceNumber < seq) {
				await new Promise<void>((resolve, reject) => {
					const func = (op) => {
						if (container2.deltaManager.lastSequenceNumber >= seq) {
							container2.deltaManager.off("op", func);
							container2.off("closed", reject);
							resolve();
						}
						console.log(op);
					};
					container2.deltaManager.on("op", func);
					container2.once("closed", reject);
				});
			}
			await provider.ensureSynchronized(container2);

			const default2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const attached2 = await attachedDdsUtils.getDDS(default2);
			/**
			 * validation
			 */
			const handleFromAttached = await attached2.readHandle();
			assert(isFluidHandle(handleFromAttached), `not a handle: ${handleFromAttached}`);

			const refToDetached2 = await getReferencedDDS(handleFromAttached);
			assert(
				refToDetached2.id === createdDds2.id,
				`ids do not match: ${refToDetached2.id}, ${createdDds2.id}`,
			);
			const handleFromDetached2 = await refToDetached2.readHandle();
			assert(isFluidHandle(handleFromDetached2), `not a handle: ${handleFromDetached2}`);

			const refToDetached1 = await getReferencedDDS(handleFromDetached2);
			assert(
				refToDetached1.id === createdDds1.id,
				`ids do not match: ${refToDetached1.id}, ${createdDds1.id}`,
			);
		});
	}

	for (const detachedDds1Utils of handleStorageFactories) {
		for (const detachedDds2Utils of handleStorageFactories) {
			for (const attachedDdsUtils of handleStorageFactories) {
				it(`stores ${detachedDds1Utils.id} handle in ${detachedDds2Utils.id} and attaches by storing in ${attachedDdsUtils.id} with new data store`, async () => {
					/**
					 * setup required for all portions of the test
					 */
					const { container1, provider } = await setup();

					const attachedDataStore = (await container1.getEntryPoint()) as ITestFluidObject;

					const dataStoreB = await attachedDataStore.context.containerRuntime.createDataStore([
						"default",
					]);
					const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
					await provider.ensureSynchronized();

					/**
					 * create the first detached dds
					 */
					const createdDds1 = detachedDds1Utils.createDDS(dataObjectB.runtime);

					/**
					 * create the second detached dds and store a handle to the first dds in it
					 */
					const createdDds2 = detachedDds2Utils.createDDS(dataObjectB.runtime);
					await createdDds2.storeHandle(createdDds1.handle);

					/**
					 * get the attached dds
					 */
					const attachedDds = await attachedDdsUtils.getDDS(attachedDataStore);

					/**
					 * store handle to dds2 in attached dds (which will attach ddss 1 and 2)
					 */
					await attachedDds.storeHandle(createdDds2.handle);

					/**
					 * close container, get sequence number and sync
					 */
					await provider.ensureSynchronized(container1);
					const seq = container1.deltaManager.lastSequenceNumber;
					container1.dispose();

					const container2 = await provider.loadTestContainer(testContainerConfig);
					if (container2.deltaManager.lastSequenceNumber < seq) {
						await new Promise<void>((resolve, reject) => {
							const func = (op) => {
								if (container2.deltaManager.lastSequenceNumber >= seq) {
									container2.deltaManager.off("op", func);
									container2.off("closed", reject);
									resolve();
								}
								console.log(op);
							};
							container2.deltaManager.on("op", func);
							container2.once("closed", reject);
						});
					}
					await provider.ensureSynchronized(container2);

					const default2 = (await container2.getEntryPoint()) as ITestFluidObject;
					const attached2 = await attachedDdsUtils.getDDS(default2);
					/**
					 * validation
					 */
					const handleFromAttached = await attached2.readHandle();
					assert(isFluidHandle(handleFromAttached), `not a handle: ${handleFromAttached}`);

					const refToDetached2 = await getReferencedDDS(handleFromAttached);
					assert(
						refToDetached2.id === createdDds2.id,
						`ids do not match: ${refToDetached2.id}, ${createdDds2.id}`,
					);
					const handleFromDetached2 = await refToDetached2.readHandle();
					assert(isFluidHandle(handleFromDetached2), `not a handle: ${handleFromDetached2}`);

					const refToDetached1 = await getReferencedDDS(handleFromDetached2);
					assert(
						refToDetached1.id === createdDds1.id,
						`ids do not match: ${refToDetached1.id}, ${createdDds1.id}`,
					);
				});
			}
		}
	}
});
