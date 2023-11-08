/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createSummarizerFromFactory,
	summarizeNow,
	type ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-private/test-version-utils";
import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { type IChannel } from "@fluidframework/datastore-definitions";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	AllowedUpdateType,
	type ISharedTree,
	SchemaBuilder,
	SharedTreeFactory,
	disposeSymbol,
} from "@fluid-experimental/tree2";
// eslint-disable-next-line import/no-internal-modules
import { type EditLog } from "@fluid-experimental/tree/dist/EditLog.js";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { MigrationShimFactory } from "../migrationShimFactory.js";
import { type MigrationShim } from "../migrationShim.js";
import { SharedTreeShimFactory } from "../sharedTreeShimFactory.js";
import { type SharedTreeShim } from "../sharedTreeShim.js";

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
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return legacyNode.payload.quantity as number;
}

// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject {
	private channel?: IChannel;
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

const builder = new SchemaBuilder({ scope: "test" });
// For now this is the schema of the view.root
const quantityType = builder.object("quantityObj", {
	quantity: builder.number,
});
const schema = builder.intoSchema(quantityType);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getNewTreeView(tree: ISharedTree) {
	return tree.schematize({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
}

describeNoCompat("Stamped v2 ops", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

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
	});

	// V2 of the registry (the migration registry) -----------------------------------------
	// V2 of the code: Registry setup to migrate the document
	const legacySharedTreeFactory = LegacySharedTree.getFactory();
	const newSharedTreeFactory = new SharedTreeFactory();

	const migrationShimFactory = new MigrationShimFactory(
		legacySharedTreeFactory,
		newSharedTreeFactory,
		(legacyTree, newTree) => {
			// Migration code that the customer writes
			// Revert local edits - otherwise we will be eventually inconsistent
			const edits = legacyTree.edits as EditLog;
			const localEdits = [...edits.getLocalEdits()].reverse();
			for (const edit of localEdits) {
				legacyTree.revert(edit.id);
			}
			// migrate data
			const quantity = getQuantity(legacyTree);
			newTree
				.schematize({
					initialTree: {
						quantity,
					},
					allowedSchemaModifications: AllowedUpdateType.None,
					schema,
				})
				[disposeSymbol]();
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

	beforeEach(async () => {
		provider = getTestObjectProvider();
		// Creates the document as v1 of the code with a SharedCell
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = await requestFluidObject<TestDataObject>(container, "/");
		const legacyTree = testObj.getTree<LegacySharedTree>();

		updateQuantity(legacyTree, originalValue);
		// make sure changes are saved.
		await provider.ensureSynchronized();
		container.close();
	});

	it("Shims can reconnect", async () => {
		// Setup containers and get Migration Shims instead of LegacySharedTrees
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
		const shim1 = testObj1.getTree<MigrationShim>();
		const legacyTree1 = shim1.currentTree as LegacySharedTree;
		container1.disconnect();
		container1.connect();
		updateQuantity(legacyTree1, 123);
		shim1.submitMigrateOp();

		// Wait for "migrated" event on both shims.
		const promise1 = new Promise<void>((resolve) => shim1.on("migrated", () => resolve()));
		await provider.ensureSynchronized();
		await promise1;

		const newTree1 = shim1.currentTree as ISharedTree;
		const view1 = getNewTreeView(newTree1);
		const node1 = view1.root;

		container1.disconnect();
		container1.connect();

		// Send a v2 op and check to see that they are processed.
		node1.quantity = newValue;
		await provider.ensureSynchronized();
		assert.equal(node1.quantity, newValue, "expected quantity values to be updated");
		assert(!container1.closed, "Container1 should not be closed");

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
		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const shim2 = testObj2.getTree<SharedTreeShim>();
		const newTree2 = shim2.currentTree;
		const view2 = getNewTreeView(newTree2);
		const node2 = view2.root;
		node2.quantity = 431;
		await provider.ensureSynchronized();

		const disconnected = new Promise<void>((resolve) => container2.on("disconnected", resolve));
		container2.disconnect();
		await disconnected;
		container2.connect();

		node2.quantity = 432;
		await provider.ensureSynchronized();
		assert.equal(node2.quantity, 432, "expected quantity values to be updated");
	});
});
