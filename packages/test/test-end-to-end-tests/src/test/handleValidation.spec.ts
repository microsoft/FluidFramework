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
import { ISharedCell } from "@fluidframework/cell/internal";
import { IFluidHandle, type FluidObject } from "@fluidframework/core-interfaces";
import { isObject } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, type ISharedDirectory } from "@fluidframework/map/internal";
import { SharedMatrixFactory, type ISharedMatrix } from "@fluidframework/matrix/internal";
import {
	ConsensusRegisterCollectionFactory,
	type IConsensusRegisterCollection,
} from "@fluidframework/register-collection/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	createAndAttachContainer,
	ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import {
	SharedTree,
	SchemaFactory,
	TreeConfiguration,
	type TreeView,
	type ISharedTree,
} from "@fluidframework/tree/internal";

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

interface aDDSType {
	id: string;
	storeHandle(handle: IFluidHandle): Promise<void>;
	readHandle(): Promise<unknown>;
	handle: IFluidHandle;
}

interface aDDSFactory {
	id: string;
	type: string;
	createDDS(runtime: IFluidDataStoreRuntime, apis: CompatApis): aDDSType;
	downCast(channel: IChannel): aDDSType;
	getDDS(dataStore: ITestFluidObject): Promise<aDDSType>;
}

const ddsTypes: aDDSFactory[] = [
	{
		id: mapId,
		type: "https://graph.microsoft.com/types/map",
		createDDS(runtime, apis) {
			const { SharedMap } = apis.dds;
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
		createDDS(runtime, apis) {
			const { SharedCell } = apis.dds;
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
		createDDS(runtime, apis) {
			const { SharedDirectory } = apis.dds;
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
		createDDS(runtime, apis) {
			const { SharedString } = apis.dds;
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
		createDDS(runtime, apis) {
			const { SharedMatrix } = apis.dds;
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
		createDDS(runtime, apis) {
			const tree = runtime.createChannel(undefined, SharedTree.getFactory().type);
			return this.downCast(tree);
		},
		downCast(channel): aDDSType {
			const tree = channel as ISharedTree;
			const treeView = treeSetup(tree);

			return {
				id: tree.id,
				async storeHandle(handle: IFluidHandle) {
					treeView.root.h = handle;
				},
				async readHandle(): Promise<unknown> {
					return treeView.root.h;
				},
				handle: tree.handle,
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
		createDDS(runtime, apis) {
			const { ConsensusRegisterCollection } = apis.dds;
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
];

const ddsFactoriesByType = new Map<string, aDDSFactory>(
	ddsTypes.map((factory) => [factory.type, factory]),
);

async function getReferencedDDS(handle: IFluidHandle): Promise<aDDSType> {
	const channel = (await handle.get()) as IChannel;
	const factory = ddsFactoriesByType.get(channel.attributes.type);
	assert(factory !== undefined);
	return factory.downCast(channel);
}

describeCompat("handle validation", "NoCompat", (getTestObjectProvider, apis) => {
	for (const handle of ddsTypes) {
		it(`store handle in dds: ${handle.id}`, async () => {
			const { container1, provider, testContainerConfig } = await setup(
				getTestObjectProvider,
				apis,
			);

			const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
			const runtime = defaultDataStore.context.containerRuntime;
			const idA = defaultDataStore.context.id;

			const dataStoreB = await runtime.createDataStore(["default"]);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			const dds = handle.createDDS(defaultDataStore.runtime, apis);

			await dds.storeHandle(dataObjectB.handle);

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

			const actualVal = await dds.readHandle();
			assert(isFluidHandle(actualVal), `not a handle: ${actualVal}`);

			const actualObject = await actualVal.get();
			assert(isObject(actualObject), "not an object");

			const actualId: FluidObject<ITestFluidObject> = actualObject;
			assert(actualId.ITestFluidObject?.context.id, idA);
		});
	}

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
					await provider.ensureSynchronized();

					/**
					 * create the first detached dds
					 */
					const createdDds1 = detachedDds1Utils.createDDS(
						attachedDataStore.runtime,
						apis,
					);

					/**
					 * create the second detached dds and store a handle to the first dds in it
					 */
					const createdDds2 = detachedDds2Utils.createDDS(
						attachedDataStore.runtime,
						apis,
					);
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
					assert(
						isFluidHandle(handleFromAttached),
						`not a handle: ${handleFromAttached}`,
					);

					const refToDetached2 = await getReferencedDDS(handleFromAttached);
					assert(
						refToDetached2.id === createdDds2.id,
						`ids do not match: ${refToDetached2.id}, ${createdDds2.id}`,
					);
					const handleFromDetached2 = await refToDetached2.readHandle();
					assert(
						isFluidHandle(handleFromDetached2),
						`not a handle: ${handleFromDetached2}`,
					);

					const refToDetached1 = await getReferencedDDS(handleFromDetached2);
					assert(
						refToDetached1.id === createdDds1.id,
						`ids do not match: ${refToDetached1.id}, ${createdDds1.id}`,
					);
				});
			}
		}
	}

	for (const detachedDds1Utils of ddsTypes) {
		for (const detachedDds2Utils of ddsTypes) {
			for (const attachedDdsUtils of ddsTypes) {
				it(`stores ${detachedDds1Utils.id} handle in ${detachedDds2Utils.id} and attaches by storing in ${attachedDdsUtils.id} with new data store`, async () => {
					/**
					 * setup required for all portions of the test
					 */
					const { container1, provider, testContainerConfig } = await setup(
						getTestObjectProvider,
						apis,
					);

					const attachedDataStore =
						(await container1.getEntryPoint()) as ITestFluidObject;

					const dataStoreB =
						await attachedDataStore.context.containerRuntime.createDataStore([
							"default",
						]);
					const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
					await provider.ensureSynchronized();

					/**
					 * create the first detached dds
					 */
					const createdDds1 = detachedDds1Utils.createDDS(dataObjectB.runtime, apis);

					/**
					 * create the second detached dds and store a handle to the first dds in it
					 */
					const createdDds2 = detachedDds2Utils.createDDS(dataObjectB.runtime, apis);
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
					assert(
						isFluidHandle(handleFromAttached),
						`not a handle: ${handleFromAttached}`,
					);

					const refToDetached2 = await getReferencedDDS(handleFromAttached);
					assert(
						refToDetached2.id === createdDds2.id,
						`ids do not match: ${refToDetached2.id}, ${createdDds2.id}`,
					);
					const handleFromDetached2 = await refToDetached2.readHandle();
					assert(
						isFluidHandle(handleFromDetached2),
						`not a handle: ${handleFromDetached2}`,
					);

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
