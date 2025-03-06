/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";
import {
	ITree,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree";
import {
	asTreeViewAlpha,
	SharedTree,
	type Revertible,
	type TreeViewAlpha,
} from "@fluidframework/tree/internal";

describeCompat("SharedTree", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

	// An extension of Aqueduct's DataObject that creates a SharedTree during initialization and exposes it.
	class DataObjectWithTree extends DataObject {
		private readonly treeKey = "tree";

		private _tree: ITree | undefined;
		public get tree(): ITree {
			assert(this._tree !== undefined, "Tree not initialized");
			return this._tree;
		}

		protected async initializingFirstTime() {
			const tree = SharedTree.create(this.runtime);
			this.root.set(this.treeKey, tree.handle);
		}

		protected async hasInitialized() {
			const treeHandle = this.root.get<IFluidHandle<ITree>>(this.treeKey);
			assert(treeHandle, "Tree handle not found");
			this._tree = await treeHandle.get();
		}
	}
	// A data object factory that creates DataObjectWithTree instances.
	const dataObjectFactoryWithTree = new DataObjectFactory(
		"DataObjectWithTree",
		DataObjectWithTree,
		[SharedTree.getFactory()],
		{},
	);

	// Runtime factory that can create containers with DataObjectWithTree instances via the above data object factory.
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactoryWithTree,
		registryEntries: [
			[dataObjectFactoryWithTree.type, Promise.resolve(dataObjectFactoryWithTree)],
		],
		runtimeOptions: { enableRuntimeIdCompressor: "on" }, // Needed to create a shared tree
	});

	let provider: ITestObjectProvider;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: DataObjectWithTree;
	let tree1: ITree;
	let tree2: ITree;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();

		// These tests are not service specific. They test internals of the SharedTree and different services
		// won't make a difference. So, only run them for local server to reduce the number of test combinations
		// it runs in.
		if (provider.driver.type !== "local") {
			return;
		}

		// Create a loader and a detached container.
		const loader1 = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		container1 = await loader1.createDetachedContainer(provider.defaultCodeDetails);
		// Get the create new request to attach the container with.
		const request = provider.driver.createCreateNewRequest(provider.documentId);
		dataObject1 = (await container1.getEntryPoint()) as DataObjectWithTree;
		tree1 = dataObject1.tree;
		await container1.attach(request);

		// Create a second loader and load a second container from the first container's URL.
		const loader2 = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		const loadUrl = await container1.getAbsoluteUrl("");
		assert(loadUrl !== undefined, "Container's absolute URL is undefined");
		container2 = await loader2.resolve({ url: loadUrl });
		const dataObject2 = (await container2.getEntryPoint()) as DataObjectWithTree;
		tree2 = dataObject2.tree;

		await provider.ensureSynchronized();
	});

	const sf = new SchemaFactory("sharedTreeE2ETests");
	// Simple schema for a point object with x and y coordinates.
	class Point extends sf.object("Point", {
		x: sf.number,
		y: sf.number,
	}) {}

	describe("Tree with a simple object", () => {
		const treeViewConfig = new TreeViewConfiguration({ schema: Point });
		const initialPoint = { x: 1, y: 2 };
		let treeViewClient1: TreeView<typeof Point>;
		let treeViewClient2: TreeView<typeof Point>;

		beforeEach(async () => {
			treeViewClient1 = tree1.viewWith(treeViewConfig);
			treeViewClient2 = tree2.viewWith(treeViewConfig);
			treeViewClient1.initialize(initialPoint);
			await provider.ensureSynchronized();
		});

		it("can sync initial tree data", async () => {
			// Validate that the second client received the initial tree data.
			assert.deepStrictEqual(
				treeViewClient2.root,
				new Point(initialPoint),
				"Initial tree data not synchronized",
			);
		});

		it("can sync updates to tree data", async () => {
			// Make changes to the x in first client and y in second client.
			treeViewClient1.root.x = 3;
			treeViewClient2.root.y = 4;
			await provider.ensureSynchronized();

			// Validate that the changes are synchronized.
			assert.strictEqual(
				treeViewClient2.root.x,
				3,
				"Changes via first client not synchronized",
			);
			assert.strictEqual(
				treeViewClient1.root.y,
				4,
				"Changes via second client not synchronized",
			);
		});
	});

	// A slightly complex schema for a shape object that contains an array of points.
	class Shape extends sf.object("Shape", {
		sides: sf.number,
		points: sf.array(Point),
	}) {}

	function addSide(treeView: TreeView<typeof Shape>, point: Point) {
		treeView.root.sides++;
		treeView.root.points.insertAtEnd(point);
	}

	function removeSide(treeView: TreeView<typeof Shape>) {
		// treeView.root.sides--;
		treeView.root.points.removeAt(treeView.root.sides - 1);
	}

	describe("Tree with an object and array", () => {
		const treeViewConfig = new TreeViewConfiguration({ schema: Shape });
		const initialPoint1 = { x: 1, y: 1 };
		const initialPoint2 = { x: 2, y: 2 };
		let treeViewClient1: TreeView<typeof Shape>;
		let treeViewClient2: TreeView<typeof Shape>;

		beforeEach(async () => {
			treeViewClient1 = tree1.viewWith(treeViewConfig);
			treeViewClient2 = tree2.viewWith(treeViewConfig);
			treeViewClient1.initialize({
				sides: 2,
				points: [initialPoint1, initialPoint2],
			});
			await provider.ensureSynchronized();
		});

		it("can sync initial tree data", async () => {
			// Validate that the second client received the initial tree data.
			assert.strictEqual(
				treeViewClient2.root.sides,
				2,
				"Initial shape sides not synchronized",
			);
			assert.deepStrictEqual(
				treeViewClient2.root.points.at(0),
				new Point(initialPoint1),
				"Initial point 1 not synchronized",
			);
			assert.deepStrictEqual(
				treeViewClient2.root.points.at(1),
				new Point(initialPoint2),
				"Initial point 2 not synchronized",
			);
		});

		it("can sync new entries in the array", async () => {
			// Add a new point in the first client.
			const newPointClient1 = new Point({ x: 3, y: 3 });
			addSide(treeViewClient1, newPointClient1);
			await provider.ensureSynchronized();

			// Validate that the second client received the new point.
			assert.strictEqual(
				treeViewClient2.root.points.length,
				treeViewClient2.root.sides,
				"Initial shape points not synchronized",
			);
			const newPointClient2 = treeViewClient2.root.points.at(treeViewClient2.root.sides - 1);
			assert.deepStrictEqual(
				newPointClient2,
				newPointClient1,
				"New point from first client not synchronized",
			);
		});
	});

	describe("Transactions", () => {
		const treeViewConfig = new TreeViewConfiguration({ schema: Shape });
		const initialPoint1 = { x: 1, y: 1 };
		const initialPoint2 = { x: 2, y: 2 };
		let treeViewClient1: TreeViewAlpha<typeof Shape>;
		let treeViewClient2: TreeViewAlpha<typeof Shape>;

		beforeEach(async () => {
			treeViewClient1 = asTreeViewAlpha(tree1.viewWith(treeViewConfig));
			treeViewClient2 = asTreeViewAlpha(tree2.viewWith(treeViewConfig));
			treeViewClient1.initialize({
				sides: 2,
				points: [initialPoint1, initialPoint2],
			});
			await provider.ensureSynchronized();
		});

		it("can run simple transaction", async () => {
			// Add a new point in the first client via transaction.
			const newPointClient1 = new Point({ x: 3, y: 3 });
			treeViewClient1.runTransaction(() => {
				addSide(treeViewClient1, newPointClient1);
			});
			await provider.ensureSynchronized();

			// Validate that the second client received the new point.
			const newPointClient2 = treeViewClient2.root.points.at(treeViewClient2.root.sides - 1);
			assert.deepStrictEqual(
				newPointClient2,
				newPointClient1,
				"Transaction from first client not synchronized",
			);
		});

		it("can run transaction with constraints", async () => {
			// Add a new point in the first client.
			const newPointClient1 = new Point({ x: 3, y: 3 });
			addSide(treeViewClient1, newPointClient1);
			// Update the new point via transaction in first client with a constraint that the point must exist.
			treeViewClient1.runTransaction(
				() => {
					newPointClient1.x = 4;
				},
				{
					preconditions: [{ type: "nodeInDocument", node: newPointClient1 }],
				},
			);
			assert.strictEqual(newPointClient1.x, 4, "Transaction changes not applied locally");
			await provider.ensureSynchronized();

			// Validate that the second client received updates to the new point.
			const newPointClient2 = treeViewClient2.root.points.at(treeViewClient2.root.sides - 1);
			assert.deepStrictEqual(
				newPointClient2,
				newPointClient1,
				"Transaction from first client not synchronized",
			);
		});

		/**
		 * Function that ensures that the given change is only processed by the second client. The first client
		 * will not see this change.
		 */
		async function syncChangeOnlyOnClient2(change: () => void) {
			// Pause processing on first client to prevent it from receiving changes.
			await provider.opProcessingController.pauseProcessing(container1);
			// Make the change and process it only on the second client.
			change();
			await provider.opProcessingController.processIncoming(container2);
			// Resume normal processing for the first client.
			provider.opProcessingController.resumeProcessing(container1);
		}

		it("fails transaction that doesn't satisfy constraints", async () => {
			// Add a new point in the first client.
			const newPointClient1 = new Point({ x: 3, y: 3 });
			addSide(treeViewClient1, newPointClient1);
			const pointsLength = treeViewClient1.root.points.length;
			await provider.ensureSynchronized();

			// Remove the new point in the second client and ensure that the changes are not synced to the first client.
			await syncChangeOnlyOnClient2(() => removeSide(treeViewClient2));

			assert(
				treeViewClient2.root.points.length === pointsLength - 1,
				"Point not removed in tree2",
			);

			const firstPointClient1 = treeViewClient1.root.points.at(0);
			assert(firstPointClient1 !== undefined, "First point not found");
			// Update the first point in the first client via transaction with a constraint that the new point must
			// exist. Note that the first client hasn't yet received the changes from the second client so this
			// transaction will successfully apply locally.
			treeViewClient1.runTransaction(
				() => {
					firstPointClient1.x = 4;
				},
				{
					preconditions: [{ type: "nodeInDocument", node: newPointClient1 }],
				},
			);
			// Validate that the all points still exist in the first client and the first point is updated.
			assert(
				treeViewClient1.root.points.length === pointsLength,
				"All points should still exist in first client",
			);
			assert.strictEqual(firstPointClient1.x, 4, "Transaction changes not applied locally");

			// Sync the changes between both the clients. The new point should now be removed from the first client.
			// And the changes to the first point should be reverted because the constraint is violated.
			await provider.ensureSynchronized();
			assert(
				treeViewClient1.root.points.length === pointsLength - 1,
				"Point not removed in tree1 after sync",
			);
			assert(
				treeViewClient2.root.points.length === pointsLength - 1,
				"Point not removed in tree2 after sync",
			);

			// Validate that the update to the first point was reverted in first client.
			assert.strictEqual(
				firstPointClient1.x,
				initialPoint1.x,
				"Transaction changes not reverted in first client",
			);

			// Validate that the second client received updates to the new point.
			const firstPointClient2 = treeViewClient2.root.points.at(0);
			assert.strictEqual(
				firstPointClient2?.x,
				initialPoint1.x,
				"Transaction changes not reverted in second client",
			);
		});

		it("runs transaction with undo constraints", async () => {
			// Revertible that only tracks the last change in the first client.
			let revertibleClient1: Revertible | undefined;
			treeViewClient1.events.on("changed", (_, getRevertible) => {
				if (getRevertible !== undefined) {
					revertibleClient1 = getRevertible();
				}
			});

			// Add a new point to the first client.
			const newPointClient1 = new Point({ x: 3, y: 3 });
			addSide(treeViewClient1, newPointClient1);
			const pointsLength = treeViewClient1.root.points.length;

			// Update the new point via transaction in the first client with a constraint that the point must exist
			// when the transaction is undone.
			treeViewClient1.runTransaction(() => {
				newPointClient1.x = 4;
				return { preconditionsOnRevert: [{ type: "nodeInDocument", node: newPointClient1 }] };
			});
			await provider.ensureSynchronized();

			// Validate that the second client received updates to the new point.
			const newPointTree2 = treeViewClient2.root.points.at(pointsLength - 1);
			assert(newPointTree2 !== undefined, "New point not synchronized");
			assert.strictEqual(newPointTree2.x, 4, "Transaction changes not synchronized");

			// Undo the transaction in the first client.
			revertibleClient1?.revert();
			await provider.ensureSynchronized();

			// Validate that the second client received the undo.
			assert.strictEqual(newPointTree2.x, 3, "Transaction changes not reverted");
		});

		it("fails undo transaction that doesn't satisfy constraints", async () => {
			// Revertible that only tracks the last change in the first client.
			let revertibleClient1: Revertible | undefined;
			treeViewClient1.events.on("changed", (_, getRevertible) => {
				if (getRevertible !== undefined) {
					revertibleClient1 = getRevertible();
				}
			});

			// Add a new point to the first client.
			const newPointClient1 = new Point({ x: 3, y: 3 });
			addSide(treeViewClient1, newPointClient1);
			const pointsLength = treeViewClient1.root.points.length;
			await provider.ensureSynchronized();

			// Remove the new point in the second client and ensure that the changes are not synced to the first client.
			await syncChangeOnlyOnClient2(() => removeSide(treeViewClient2));
			assert(
				treeViewClient2.root.points.length === pointsLength - 1,
				"Point not removed in tree2",
			);

			// Update the first point in the first client via transaction with an undo constraint that the new point
			// must exist when the change is undone.
			const firstPointClient1 = treeViewClient1.root.points.at(0);
			assert(firstPointClient1 !== undefined, "First point not found");
			treeViewClient1.runTransaction(() => {
				firstPointClient1.x = 4;
				return { preconditionsOnRevert: [{ type: "nodeInDocument", node: newPointClient1 }] };
			});

			// Validate that the all points still exist in the first client and the first point is updated.
			assert(
				treeViewClient1.root.points.length === pointsLength,
				"All points should still exist in first client",
			);
			assert.strictEqual(firstPointClient1.x, 4, "Transaction changes not applied locally");

			await provider.ensureSynchronized();

			// Try to undo the transaction in the first client. This should be rejected because the undo constraint is
			// violated - the new point is removed due to changes from second client.
			revertibleClient1?.revert();
			await provider.ensureSynchronized();

			// Validate that the update to the first point was not reverted in first client.
			assert.strictEqual(
				firstPointClient1.x,
				4,
				"Transaction changes should not be reverted in first client",
			);

			// Validate that the update to the first point was not reverted in second client.
			const firstPointClient2 = treeViewClient2.root.points.at(0);
			assert.strictEqual(
				firstPointClient2?.x,
				4,
				"Transaction changes not reverted in second client",
			);
		});
	});
});
