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
import { type EditLog } from "@fluid-experimental/tree/test/EditLog";
import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type IChannel } from "@fluidframework/datastore-definitions/internal";
import { type ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import { type ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

function updateQuantity(tree: LegacySharedTree, quantity: number): void {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const change: Change = Change.setPayload(nodeId, { quantity });
	tree.applyEdit(change);
}

function getQuantity(tree: LegacySharedTree): number {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nodeId = rootNode.traits.get(legacyNodeId)![0];
	const legacyNode = tree.currentView.getViewNode(nodeId);
	return legacyNode.payload.quantity as number;
}

const builder = new SchemaFactory("test");
// For now this is the schema of the view.root
class QuantityType extends builder.object("quantityObj", {
	quantity: builder.number,
}) {}
const treeConfig = new TreeViewConfiguration({ schema: QuantityType });

describeCompat("Stamped v2 ops", "NoCompat", (getTestObjectProvider, apis) => {
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

	// A Test Data Object that exposes some basic functionality.
	class TestDataObject extends DataObject {
		private channel?: IChannel;

		public get _root() {
			return this.root;
		}

		// The object starts with a LegacySharedTree
		public async initializingFirstTime(props?: unknown): Promise<void> {
			const legacyTree = this.runtime.createChannel(
				"tree",
				LegacySharedTree.getFactory().type,
			) as LegacySharedTree;

			const inventoryNode: BuildNode = {
				definition: legacyNodeId,
				traits: {
					quantity: {
						definition: "quantity",
						payload: 0,
					},
				},
			};
			legacyTree.applyEdit(
				Change.insertTree(
					inventoryNode,
					StablePlace.atStartOf({
						parent: legacyTree.currentView.root,
						label: "inventory" as TraitLabel,
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
			const quantity = getQuantity(legacyTree);
			const view = newTree.viewWith(treeConfig);
			view.initialize({ quantity });
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

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory2,
		registryEntries: [dataObjectFactory2.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	const originalValue = 3;
	const newValue = 4;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code with a SharedCell
		const container = await provider.createContainer(runtimeFactory1);
		await waitForContainerConnection(container);
		const testObj = (await container.getEntryPoint()) as TestDataObject;
		const legacyTree = testObj.getTree<LegacySharedTree>();

		updateQuantity(legacyTree, originalValue);
		// make sure changes are saved.
		await provider.ensureSynchronized();
		container.close();
	});

	it("MigrationShim can drop v1 ops and migrate ops", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		await waitForContainerConnection(container1);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;

		const container2 = await provider.loadContainer(runtimeFactory2);
		await waitForContainerConnection(container2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<MigrationShim>();
		const legacyTree2 = shim2.currentTree as LegacySharedTree;

		container1.disconnect();
		container2.disconnect();
		shim1.submitMigrateOp();

		// Modifies the legacyTree's quantity value
		updateQuantity(legacyTree1, 1);

		updateQuantity(legacyTree2, 2);
		updateQuantity(legacyTree2, 6);
		updateQuantity(legacyTree2, 2);
		updateQuantity(legacyTree2, 6);

		shim2.submitMigrateOp();

		// Wait for "migrated" event on both shims.
		const promise1 = new Promise<void>((resolve) => shim1.on("migrated", () => resolve()));
		const promise2 = new Promise<void>((resolve) => shim2.on("migrated", () => resolve()));
		container1.connect();
		await promise1;

		container2.connect();
		await promise2;
		await provider.ensureSynchronized();

		const newTree1 = shim1.currentTree as ITree;
		const newTree2 = shim2.currentTree as ITree;
		const view1 = newTree1.viewWith(treeConfig);
		await provider.ensureSynchronized();
		const view2 = newTree2.viewWith(treeConfig);
		const node1 = view1.root;
		const node2 = view2.root;
		assert.equal(node1.quantity, node2.quantity, "expected to migrate to the same value");
		assert.equal(node1.quantity, originalValue, "expected no values to be updated");

		// Send a v2 op and check to see that they are processed.
		node1.quantity = newValue;
		await provider.ensureSynchronized();
		assert.equal(node1.quantity, node2.quantity, "expected quantity values to sync");
		assert.equal(node1.quantity, newValue, "expected quantity values to be updated");

		// Super hacky way to check to see if the v1 ops were dropped. We enable submission even though its disabled
		(shim1 as any).preMigrationDeltaConnection.canSubmit = true;
		updateQuantity(legacyTree1, 123);
		await provider.ensureSynchronized();
		assert.equal(node1.quantity, newValue, "expected no values to be updated");
		assert.equal(getQuantity(legacyTree2), originalValue, "expected v1 ops to be dropped");
		assert(!container1.closed, "Container1 should not be closed");
		assert(!container2.closed, "Container2 should not be closed");
	});

	it("SharedTreeShim can drop v1 ops and migrate ops", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;

		await waitForContainerConnection(container1);

		await provider.opProcessingController.pauseProcessing();
		shim1.submitMigrateOp();

		// Modifies the legacyTree's quantity value
		updateQuantity(legacyTree1, 1);
		updateQuantity(legacyTree1, 2);
		updateQuantity(legacyTree1, 1);
		updateQuantity(legacyTree1, 2);
		updateQuantity(legacyTree1, 1);

		// Wait for "migrated" event on both shims.
		const promise1 = new Promise<void>((resolve) => shim1.on("migrated", () => resolve()));
		provider.opProcessingController.resumeProcessing();
		await promise1;
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
		await waitForContainerConnection(container2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<SharedTreeShim>();
		assert(
			(shim2 as unknown as MigrationShim).submitMigrateOp === undefined,
			"Should have loaded a SharedTreeShim",
		);

		const newTree1 = shim1.currentTree as ITree;
		const newTree2 = shim2.currentTree;
		const view1 = newTree1.viewWith(treeConfig);
		await provider.ensureSynchronized();
		const view2 = newTree2.viewWith(treeConfig);
		const node1 = view1.root;
		const node2 = view2.root;
		assert.equal(node1.quantity, originalValue, "Node1 should be the original value");
		assert.equal(node2.quantity, originalValue, "Node2 should have loaded the original value");

		// Send a v2 op and check to see that they are processed.
		node1.quantity = newValue;
		await provider.ensureSynchronized();
		assert.equal(node1.quantity, node2.quantity, "expected quantity values to sync");
		assert.equal(node1.quantity, newValue, "expected quantity values to be updated");

		// Super hacky way to check to see if the v1 ops were dropped. We enable submission even though its disabled
		(shim1 as any).preMigrationDeltaConnection.canSubmit = true;
		// Catch a remote shim2 op
		const opSent = new Promise<ISequencedDocumentMessage>((resolve) =>
			container2.on("op", (op) => resolve(op)),
		);

		// Send a legacy op
		updateQuantity(legacyTree1, 123);
		// shim2's SharedTree will throw if it receives a LegacySharedTree op
		await provider.ensureSynchronized();

		// Check if the shim2 received the op
		const op2 = await opSent;
		const env = JSON.parse(op2.contents as string);
		assert.equal(
			env.contents.address,
			testObj2.id,
			"Expected an op to be sent to the data object",
		);
		const address = env.contents.contents.content.address as string;
		assert.equal(address, shim2.id, "Expected an op to be sent to the shim2");

		assert.equal(node1.quantity, newValue, "expected node1 to still be newValue");
		assert.equal(node2.quantity, newValue, "expected node2 to still be newValue");

		assert(!container1.closed, "Container1 should not be closed");
		assert(!container2.closed, "Container2 should not be closed");
	});
});
