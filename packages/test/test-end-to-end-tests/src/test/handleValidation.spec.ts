/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import { IFluidHandle, type FluidObject } from "@fluidframework/core-interfaces";
import { ISharedDirectory, type ISharedMap } from "@fluidframework/map/internal";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	createAndAttachContainer,
	ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import type { ISharedMatrix } from "@fluidframework/matrix/internal";
import { type IConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import {
	ConsensusResult,
	type ConsensusCallback,
	type IConsensusOrderedCollection,
} from "@fluidframework/ordered-collection/internal";
import {
	ISharedTree,
	SharedTree,
	SchemaFactory,
	TreeConfiguration,
	type TreeView,
} from "@fluidframework/tree/internal";
import { isObject } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { SharedString } from "@fluidframework/sequence/internal";

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

async function setup(getTestObjectProvider, apis) {
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

const handleFns: {
	type: string;
	storeHandle: (defaultDataStore: ITestFluidObject, handle: IFluidHandle) => Promise<void>;
	readHandle: (defaultDataStore: ITestFluidObject) => Promise<unknown>;
}[] = [
	{
		type: mapId,
		storeHandle: async (defaultDataStore, handle) => {
			const mapRoot = await defaultDataStore.getSharedObject<ISharedMap>(mapId);
			mapRoot.set("B", handle);
		},
		readHandle: async (defaultDataStore) => {
			const mapRoot = await defaultDataStore.getSharedObject<ISharedMap>(mapId);
			return mapRoot.get("B");
		},
	},
	{
		type: cellId,
		storeHandle: async (defaultDataStore, handle) => {
			const cellRoot = await defaultDataStore.getSharedObject<ISharedCell>(cellId);
			cellRoot.set(handle);
		},
		readHandle: async (defaultDataStore) => {
			const cellRoot = await defaultDataStore.getSharedObject<ISharedCell>(cellId);
			return cellRoot.get();
		},
	},
	{
		type: directoryId,
		storeHandle: async (defaultDataStore, handle) => {
			const dirRoot = await defaultDataStore.getSharedObject<ISharedDirectory>(directoryId);
			dirRoot.set("B", handle);
		},
		readHandle: async (defaultDataStore) => {
			const dirRoot = await defaultDataStore.getSharedObject<ISharedDirectory>(directoryId);
			return dirRoot.get("B");
		},
	},
	{
		type: stringId,
		storeHandle: async (defaultDataStore, handle) => {
			const stringRoot = await defaultDataStore.getSharedObject<SharedString>(stringId);
			stringRoot.insertText(0, "hello");
			stringRoot.annotateRange(0, 1, { B: handle });
		},
		readHandle: async (defaultDataStore) => {
			const stringRoot = await defaultDataStore.getSharedObject<SharedString>(stringId);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return stringRoot.getPropertiesAtPosition(0)?.B;
		},
	},
	{
		type: matrixId,
		storeHandle: async (defaultDataStore, handle) => {
			const matrixRoot = await defaultDataStore.getSharedObject<ISharedMatrix>(matrixId);
			matrixRoot.insertRows(0, 1);
			matrixRoot.insertCols(0, 1);
			matrixRoot.setCell(0, 0, handle);
		},
		readHandle: async (defaultDataStore) => {
			const matrixRoot = await defaultDataStore.getSharedObject<ISharedMatrix>(matrixId);
			return matrixRoot.getCell(0, 0);
		},
	},
	{
		type: treeId,
		storeHandle: async (defaultDataStore, handle) => {
			const treeRoot = await defaultDataStore.getSharedObject<ISharedTree>(treeId);
			const treeView = treeSetup(treeRoot);
			treeView.root.h = handle;
		},
		readHandle: async (defaultDataStore) => {
			const treeRoot = await defaultDataStore.getSharedObject<ISharedTree>(treeId);
			const treeView = treeSetup(treeRoot);
			return treeView.root.h;
		},
	},
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
		type: registerId,
		storeHandle: async (defaultDataStore, handle) => {
			const registerRoot =
				await defaultDataStore.getSharedObject<IConsensusRegisterCollection<FluidObject>>(
					registerId,
				);
			await registerRoot.write("B", handle);
		},
		readHandle: async (defaultDataStore) => {
			const registerRoot =
				await defaultDataStore.getSharedObject<IConsensusRegisterCollection<FluidObject>>(
					registerId,
				);
			return registerRoot.read("B");
		},
	},
	{
		type: queueId,
		storeHandle: async (defaultDataStore, handle) => {
			const queueRoot =
				await defaultDataStore.getSharedObject<IConsensusOrderedCollection>(queueId);
			await queueRoot.add(handle);
		},
		readHandle: async (defaultDataStore) => {
			let handle2: unknown;
			const queueRoot =
				await defaultDataStore.getSharedObject<IConsensusOrderedCollection>(queueId);
			const callback: ConsensusCallback<IFluidHandle> = async (value) => {
				handle2 = value;
				return ConsensusResult.Complete;
			};
			await queueRoot.waitAndAcquire(callback);
			return handle2;
		},
	},
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

describeCompat("handle validation", "NoCompat", (getTestObjectProvider, apis) => {
	for (const handle of handleFns) {
		it(`store handle in dds: ${handle.type}`, async () => {
			const { container1, provider, testContainerConfig } = await setup(
				getTestObjectProvider,
				apis,
			);
			let idA: string;
			let seq: number;
			{
				const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
				const runtime = defaultDataStore.context.containerRuntime;
				idA = defaultDataStore.context.id;

				const dataStoreB = await runtime.createDataStore(["default"]);
				const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;

				await handle.storeHandle(defaultDataStore, dataObjectB.handle);

				await provider.ensureSynchronized();
				seq = container1.deltaManager.lastSequenceNumber;
				container1.dispose();
			}

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

			const actualVal = await handle.readHandle(default2);
			assert(isFluidHandle(actualVal), `not a handle: ${actualVal}`);

			const actualObject = await actualVal.get();
			assert(isObject(actualObject), "not an object");

			const actualId: FluidObject<ITestFluidObject> = actualObject;
			assert(actualId.ITestFluidObject?.context.id, idA);
		});
	}
});
