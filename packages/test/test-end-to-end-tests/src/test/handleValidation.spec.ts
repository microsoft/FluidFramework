/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedMap, SharedDirectory } from "@fluidframework/map/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	createAndAttachContainer,
	ITestFluidObject,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import type { ISharedMatrix } from "@fluidframework/matrix/internal";
import type { IConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
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

	const treeView = dds.schematize(config);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

	const provider = getTestObjectProvider();
	const loader = provider.makeTestLoader(testContainerConfig);
	const container1 = await createAndAttachContainer(
		provider.defaultCodeDetails,
		loader,
		provider.driver.createCreateNewRequest(provider.documentId),
	);
	provider.updateDocumentId(container1.resolvedUrl);
	const url = await container1.getAbsoluteUrl("");
	const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
	const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
	const cell1 = await dataStore1.getSharedObject<ISharedCell>(cellId);
	const directory1 = await dataStore1.getSharedObject<SharedDirectory>(directoryId);
	const tree1 = await dataStore1.getSharedObject<ISharedTree>(treeId);
	const matrix1 = await dataStore1.getSharedObject<ISharedMatrix>(matrixId);
	// legacyTree1 = await dataStore1.getSharedObject<LegacySharedTree>(legacyTreeId);
	const register1 = await dataStore1.getSharedObject<IConsensusRegisterCollection>(registerId);
	const queue1 = await dataStore1.getSharedObject<IConsensusOrderedCollection>(queueId);
	// migrationShim1 = await dataStore1.getSharedObject<MigrationShim>(migrationShimId);
	const string1 = await dataStore1.getSharedObject<SharedString>(stringId);
	string1.insertText(0, "hello");

	const waitForSummary = async () => {
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
	return {
		loader,
		provider,
		container1,
		testContainerConfig,
		map1,
		cell1,
		directory1,
		matrix1,
		register1,
		queue1,
		string1,
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
			const mapRoot = await defaultDataStore.getSharedObject(mapId);
			mapRoot.set("B", handle);
		},
		readHandle: async (defaultDataStore) => {
			const mapRoot = await defaultDataStore.getSharedObject(mapId);
			return mapRoot.get("B") as IFluidHandle<ITestFluidObject>;
		},
	},
	{
		type: cellId,
		storeHandle: async (defaultDataStore, handle) => {
			const cellRoot = await defaultDataStore.getSharedObject(cellId);
			cellRoot.set(handle) as IFluidHandle<ITestFluidObject>;
		},
		readHandle: async (defaultDataStore) => {
			const cellRoot = await defaultDataStore.getSharedObject(cellId);
			return cellRoot.get() as IFluidHandle<ITestFluidObject>;
		},
	},
	{
		type: directoryId,
		storeHandle: async (defaultDataStore, handle) => {
			const dirRoot = await defaultDataStore.getSharedObject(directoryId);
			dirRoot.set("B", handle);
		},
		readHandle: async (defaultDataStore) => {
			const dirRoot = await defaultDataStore.getSharedObject(directoryId);
			return dirRoot.get("B") as IFluidHandle<ITestFluidObject>;
		},
	},
	{
		type: stringId,
		storeHandle: async (defaultDataStore, handle) => {
			const stringRoot = await defaultDataStore.getSharedObject(stringId);
			stringRoot.annotateRange(0, 1, { B: handle });
		},
		readHandle: async (defaultDataStore) => {
			const stringRoot = await defaultDataStore.getSharedObject(stringId);
			return stringRoot.getPropertiesAtPosition(0)?.B as IFluidHandle<ITestFluidObject>;
		},
	},
	{
		type: matrixId,
		storeHandle: async (defaultDataStore, handle) => {
			const matrixRoot = await defaultDataStore.getSharedObject(matrixId);
			matrixRoot.insertRows(0, 1);
			matrixRoot.insertCols(0, 1);
			matrixRoot.setCell(0, 0, handle);
		},
		readHandle: async (defaultDataStore) => {
			const matrixRoot = await defaultDataStore.getSharedObject(matrixId);
			return matrixRoot.getCell(0, 0) as IFluidHandle<ITestFluidObject>;
		},
	},
	{
		type: treeId,
		storeHandle: async (defaultDataStore, handle) => {
			const treeRoot = await defaultDataStore.getSharedObject(treeId);

			const treeView = treeSetup(treeRoot);
			treeView.root.h = handle;
		},
		readHandle: async (defaultDataStore) => {
			const treeRoot = await defaultDataStore.getSharedObject(treeId);
			const treeView = treeSetup(treeRoot);
			return treeView.root.h as IFluidHandle<ITestFluidObject>;
		},
	},
	// {
	// 	type: legacyTreeId,
	// 	storeHandle: async (defaultDataStore, handle) => {
	// 		const treeRoot = await defaultDataStore.getSharedObject(legacyTreeId);
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
			const registerRoot = await defaultDataStore.getSharedObject(registerId);
			registerRoot.write("B", handle);
		},
		readHandle: async (defaultDataStore) => {
			const registerRoot = await defaultDataStore.getSharedObject(registerId);
			return registerRoot.read("B") as IFluidHandle<ITestFluidObject>;
		},
	},
	{
		type: queueId,
		storeHandle: async (defaultDataStore, handle) => {
			const queueRoot = await defaultDataStore.getSharedObject(queueId);
			queueRoot.add(handle);
		},
		readHandle: async (defaultDataStore) => {
			let handle2: unknown;
			const queueRoot = await defaultDataStore.getSharedObject(queueId);
			const callback: ConsensusCallback<IFluidHandle> = async (value) => {
				handle2 = value;
				return ConsensusResult.Complete;
			};
			await queueRoot.acquire(callback);
			return handle2;
		},
	},
	// {
	// 	type: migrationShimId,
	// 	storeHandle: async (defaultDataStore, handle) => {
	// 		const migrationShimRoot = await defaultDataStore.getSharedObject(migrationShimId);
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
			const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
			const runtime = defaultDataStore.context.containerRuntime;

			const dataStoreB = await runtime.createDataStore(["default"]);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			const idB = dataObjectB.context.id;

			await handle.storeHandle(defaultDataStore, dataObjectB.handle);

			await provider.ensureSynchronized();
			const container2: IContainerExperimental =
				await provider.loadTestContainer(testContainerConfig);
			await waitForContainerConnection(container2);
			const default2 = (await container2.getEntryPoint()) as ITestFluidObject;

			const handleB = (await handle.readHandle(default2)) as IFluidHandle<ITestFluidObject>;
			const dataObjectB2 = await handleB.get();
			assert(dataObjectB2.context.id === idB);
		});
	}
});
