/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	type MigrationShim,
	MigrationShimFactory,
	type SharedTreeShim,
	SharedTreeShimFactory,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	type ContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IChannel } from "@fluidframework/datastore-definitions/internal";
import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import { type ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

function updateHandle(tree: LegacySharedTree, handle: IFluidHandle | undefined): void {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const change: Change = Change.setPayload(nodeId, { handle });
	tree.applyEdit(change);
}

function getHandle(tree: LegacySharedTree): IFluidHandle | undefined {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const legacyNode = tree.currentView.getViewNode(nodeId);
	return legacyNode.payload.handle as IFluidHandle | undefined;
}

const builder = new SchemaFactory("test");
// For now this is the schema of the view.root
class HandleType extends builder.object("handleObj", {
	handle: builder.optional(builder.handle),
}) {}

const treeConfig = new TreeViewConfiguration({ schema: HandleType });

describeCompat("Storing handles", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
		enableRuntimeIdCompressor: "on",
	};

	class ChildDataObject extends DataObject {
		public get _root() {
			return this.root;
		}
	}

	// A Test Data Object that exposes some basic functionality.
	class TestDataObject extends DataObject {
		private channel?: IChannel;

		public get _root() {
			return this.root;
		}

		public get containerRuntime(): ContainerRuntime {
			return this.context.containerRuntime as ContainerRuntime;
		}

		public async createBlob(content: string): Promise<IFluidHandle<ArrayBufferLike>> {
			const buffer = stringToBuffer(content, "utf8");
			return this.runtime.uploadBlob(buffer);
		}

		// The object starts with a LegacySharedTree
		public async initializingFirstTime(props?: unknown): Promise<void> {
			const legacyTree = this.runtime.createChannel(
				"tree",
				LegacySharedTree.getFactory().type,
			) as LegacySharedTree;

			const handleNode: BuildNode = {
				definition: legacyNodeId,
				traits: {
					handle: {
						definition: "handle",
						payload: 0,
					},
				},
			};
			legacyTree.applyEdit(
				Change.insertTree(
					handleNode,
					StablePlace.atStartOf({
						parent: legacyTree.currentView.root,
						label: legacyNodeId,
					}),
				),
			);

			this.root.set("tree", legacyTree.handle);
			this.channel = legacyTree;
		}

		// Makes it so we can get the tree stored as "tree"
		public async hasInitialized(): Promise<void> {
			// We are using runtime.getChannel here instead of fetching the handle
			// TODO: handle tests
			const tree = await this.runtime.getChannel("tree");
			this.channel = tree;
		}

		// Allows us to get the SharedObject with whatever type we want
		public getTree<T>(): T {
			assert(this.channel !== undefined, "Channel should be defined");
			return this.channel as T;
		}
	}

	// V1 of the registry -----------------------------------------
	// V1 of the code: Registry setup to create the old document
	const oldChannelFactory = LegacySharedTree.getFactory();
	const dataObjectFactory1 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[oldChannelFactory],
		{},
	);

	// The 1st runtime factory, V1 of the code
	const runtimeFactory1 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory1,
		registryEntries: [dataObjectFactory1.registryEntry],
		runtimeOptions,
	});

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const legacySharedTreeFactory = LegacySharedTree.getFactory();
	const newSharedTreeFactory = SharedTree.getFactory();

	const migrationShimFactory = new MigrationShimFactory(
		legacySharedTreeFactory,
		newSharedTreeFactory,
		(legacyTree, newTree) => {
			// Migration code that the customer writes
			// Revert local edits - otherwise we will be eventually inconsistent
			const edits = legacyTree.edits;
			const localEdits = [...edits.getLocalEdits()].reverse();
			for (const edit of localEdits) {
				legacyTree.revert(edit.id);
			}
			// migrate data
			const handle = getHandle(legacyTree);
			const view = newTree.viewWith(treeConfig);
			view.initialize({ handle });
			view.dispose();
		},
	);

	const sharedTreeShimFactory = new SharedTreeShimFactory(newSharedTreeFactory);

	const dataObjectFactory2 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[migrationShimFactory, sharedTreeShimFactory], // Use the migrationShimFactory instead of the LegacySharedTreeFactory
		{},
	);

	const childObjectFactory = new DataObjectFactory("ChildDataObject", ChildDataObject, [], {});

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory2,
		registryEntries: [dataObjectFactory2.registryEntry, childObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = (await container.getEntryPoint()) as TestDataObject;
		const legacyTree = testObj.getTree<LegacySharedTree>();
		updateHandle(legacyTree, undefined);
		// make sure changes are saved.
		await provider.ensureSynchronized();
		container.close();
	});

	it("MigrationShim can make stored handles live", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const legacyTree2 = shim2.currentTree as LegacySharedTree;

		const aObj2 = await childObjectFactory.createInstance(testObj2.containerRuntime);
		updateHandle(legacyTree2, aObj2.handle);
		await provider.ensureSynchronized();
		const handle1 = getHandle(legacyTree1);
		assert(handle1 !== undefined, "handle should be defined");
		const aObj1 = (await handle1.get()) as TestDataObject;
		aObj1._root.set("quantity", 123);
		await provider.ensureSynchronized();
		assert(aObj2._root.get("quantity") === 123, "expected aObj2 to be live and sync");

		const bObj1 = await childObjectFactory.createInstance(testObj1.containerRuntime);
		updateHandle(legacyTree1, bObj1.handle);
		await provider.ensureSynchronized();
		const handle2 = getHandle(legacyTree2);
		assert(handle2 !== undefined, "handle should be defined");
		const bObj2 = (await handle2.get()) as TestDataObject;
		bObj2._root.set("quantity", 456);
		await provider.ensureSynchronized();
		assert(bObj1._root.get("quantity") === 456, "expected bObj1 to be live and sync");

		const promise1 = new Promise<void>((resolve) => shim1.on("migrated", () => resolve()));
		shim1.submitMigrateOp();
		await provider.ensureSynchronized();
		await promise1;

		const newTree1 = shim1.currentTree as ITree;
		const newTree2 = shim2.currentTree as ITree;
		const view1 = newTree1.viewWith(treeConfig);
		const view2 = newTree2.viewWith(treeConfig);
		const node1 = view1.root;
		const node2 = view2.root;
		assert(node1.handle !== undefined, "expected to migrate handle");
		assert(node2.handle !== undefined, "expected to migrate handle");
		const cObj1 = (await node1.handle.get()) as ChildDataObject;
		const cObj2 = (await node2.handle.get()) as ChildDataObject;
		assert(cObj1._root.get("quantity") === 456, "expected cObj1 to be live and sync");
		assert(cObj2._root.get("quantity") === 456, "expected cObj2 to be live and sync");
	});

	it("SharedTreeShim can make handles live", async () => {
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();

		const promise1 = new Promise<void>((resolve) => shim1.on("migrated", () => resolve()));
		shim1.submitMigrateOp();
		await promise1;
		await provider.ensureSynchronized();

		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container1,
			dataObjectFactory2,
		);
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);

		const container2 = await provider.loadContainer(runtimeFactory2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<SharedTreeShim>();

		const newTree1 = shim1.currentTree as ITree;
		const newTree2 = shim2.currentTree;
		const view1 = newTree1.viewWith(treeConfig);
		const view2 = newTree2.viewWith(treeConfig);
		const node1 = view1.root;
		const node2 = view2.root;
		assert.equal(node1.handle, undefined, "expected no handle to be stored in node1");
		assert.equal(node2.handle, undefined, "expected no handle to be stored in node2");

		// Send a v2 op and check to see that they are processed.
		const bObj1 = await childObjectFactory.createInstance(testObj1.containerRuntime);
		node1.handle = bObj1.handle;
		await provider.ensureSynchronized();
		assert(node1.handle !== undefined, "expected a handle to be stored in node1");
		assert(node2.handle !== undefined, "expected a handle to be stored in node2");
		const bObj2Handle = node2.handle as IFluidHandle;
		const bObj2 = (await bObj2Handle.get()) as ChildDataObject;
		bObj1._root.set("quantity", 18);
		await provider.ensureSynchronized();
		assert(bObj2._root.get("quantity") === 18, "expected bObj2 to be live and sync");
		assert(bObj1._root.get("quantity") === 18, "expected bObj1 to be live and sync");
	});

	it("Blob handles", async () => {
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const legacyTree2 = shim2.currentTree as LegacySharedTree;

		const aHandle2 = await testObj2.createBlob("hello");
		updateHandle(legacyTree2, aHandle2);
		await provider.ensureSynchronized();
		const aHandle1 = getHandle(legacyTree1);
		assert(aHandle1 !== undefined, "handle should be defined");
		const aBuffer1 = (await aHandle1.get()) as ArrayBufferLike;
		const aBuffer2 = await aHandle2.get();
		const aContent1 = bufferToString(aBuffer1, "utf8");
		const aContent2 = bufferToString(aBuffer2, "utf8");
		assert(aContent1 === "hello", "expected aContent1 to be live and sync");
		assert(aContent2 === "hello", "expected aContent2 to be live and sync");

		const bHandle1 = await testObj1.createBlob("hello2");
		updateHandle(legacyTree1, bHandle1);
		await provider.ensureSynchronized();
		const bHandle2 = getHandle(legacyTree2);
		assert(bHandle2 !== undefined, "handle should be defined");
		const bBuffer1 = await bHandle1.get();
		const bBuffer2 = (await bHandle2.get()) as ArrayBufferLike;
		const bContent1 = bufferToString(bBuffer1, "utf8");
		const bContent2 = bufferToString(bBuffer2, "utf8");
		assert(bContent1 === "hello2", "expected bContent1 to be live and sync");
		assert(bContent2 === "hello2", "expected bContent2 to be live and sync");
	});
});
