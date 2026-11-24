/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Collaboration tests for openView. Separate containers act as clients of the same document.
// Synchronizing them lets the tests distinguish an upgrade sent by one client from an unintended
// write by the client that receives it, even when the root value stays the same.

import { strict as assert } from "node:assert";

import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type {
	ISharedObjectKind,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestFluidObjectInternal,
	TestObjectProvider,
} from "@fluidframework/test-utils/internal";
import type { ITree as PreviousTree } from "@fluidframework/tree-previous";

import { asAlpha } from "../../api.js";
import {
	type ReadyTreeView,
	SchemaFactory,
	TreeViewConfiguration,
} from "../../simple-tree/index.js";
import type { ISharedTree } from "../../treeFactory.js";
import { DefaultTestSharedTreeKind } from "../utils.js";

const treeId = "tree";

/** Configuration for a tree whose root is a required number. */
const numberOnly = new TreeViewConfiguration({ schema: SchemaFactory.number });
/** Configuration for a tree whose root is a required union of number and string. */
const numberOrString = new TreeViewConfiguration({
	schema: [SchemaFactory.number, SchemaFactory.string],
});

/**
 * Resolves the container entry point without assuming which version of SharedTree it contains.
 */
async function getDataObject(container: IContainer): Promise<TestFluidObjectInternal> {
	const object = await container.getEntryPoint();
	assert(object instanceof TestFluidObjectInternal);
	return object;
}

/**
 * Gets the shared tree from a container that uses the current package's factory.
 */
async function getTree(container: IContainer): Promise<ISharedTree> {
	const object = await getDataObject(container);
	return object.getInitialSharedObjectTyped(DefaultTestSharedTreeKind, treeId);
}

/**
 * Tracks edits that this client submits to the given tree.
 *
 * @returns A function that reads the number of local edits sequenced since tracking began.
 * Read it after synchronization so pending edits are included.
 */
function countLocalEdits(tree: ISharedTree): () => number {
	let count = 0;
	tree.on("op", (_op, local) => {
		if (local) {
			count++;
		}
	});
	return () => count;
}

describe("openView collaboration", () => {
	let provider: TestObjectProvider;
	let driver: LocalServerTestDriver;

	beforeEach(() => {
		driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(
			Loader,
			driver,
			(config) =>
				new TestContainerRuntimeFactory(
					"test-data-store",
					new TestFluidObjectFactory(
						config?.registry ?? [[treeId, DefaultTestSharedTreeKind.getFactory()]],
						"test-object",
						TestFluidObjectInternal,
					),
					{
						enableRuntimeIdCompressor: "on",
						summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
					},
				),
		);
	});

	afterEach(() => {
		try {
			provider.reset();
		} finally {
			driver.dispose();
		}
	});

	/**
	 * Creates an attached tree with a number-only root and synchronizes its initial content.
	 *
	 * @remarks
	 * Setup uses `viewWith` so an edit observed later can be attributed to the action under test rather than initialization.
	 */
	async function createNumberTree(): Promise<ISharedTree> {
		const tree = await getTree(await provider.makeTestContainer());
		const view = tree.viewWith(numberOnly);
		view.initialize(5);
		view.dispose();
		await provider.ensureSynchronized();
		return tree;
	}

	// Only the creator initializes the tree. A client loading it after attachment must not send a second edit.
	it("loads the detached creator's content by document ID without submitting an edit", async () => {
		// Initialize while the container is still private to the creator.
		const detached = await provider.createDetachedContainer(provider.createFluidEntryPoint());
		const creator = await getTree(detached);
		assert.equal(creator.isAttached(), false);
		const initializer = asAlpha(creator).openView(numberOnly);
		assert.equal(initializer.kind, "uninitialized");
		const initialized = initializer.initialize(5);
		assert.equal(initialized.kind, "ready");
		initialized.dispose();

		// Attach the initialized document so a second client can load it by ID.
		await provider.attachDetachedContainer(detached);

		// Capture the reader's state before it opens the existing document.
		const reader = await getTree(await provider.loadTestContainer());
		const before = reader.contentSnapshot();
		const localEdits = countLocalEdits(reader);
		const loaded = asAlpha(reader).openView(numberOnly);
		assert.equal(loaded.kind, "ready");
		assert.equal(loaded.root, 5);

		// Allow any edit from the reader to be sequenced before checking that it made none.
		await provider.ensureSynchronized();
		assert.deepEqual(reader.contentSnapshot(), before);
		assert.equal(localEdits(), 0);
	});

	// A obtains its initializer before B writes but uses it after delivery, so it must not overwrite B's value.
	it("rejects an initializer after observing another client's initialization", async () => {
		// A keeps its initializer while both clients see an uninitialized tree.
		const a = await getTree(await provider.makeTestContainer());
		const b = await getTree(await provider.loadTestContainer());
		const initializer = asAlpha(a).openView(numberOnly);
		assert.equal(initializer.kind, "uninitialized");

		// B sets the initial value and A receives it before attempting its own write.
		b.viewWith(numberOnly).initialize(5);
		await provider.ensureSynchronized();

		// A tries to use the stale initializer. The failed call must release it.
		const before = a.contentSnapshot();
		const localEdits = countLocalEdits(a);
		assert.throws(() => initializer.initialize(42), UsageError);
		assert.equal(initializer.disposed, true);

		// Reopen on A and verify that B's value survived with no edit from A.
		const reopened = asAlpha(a).openView(numberOnly);
		assert.equal(reopened.kind, "ready");
		assert.equal(reopened.root, 5);
		await provider.ensureSynchronized();
		assert.equal(localEdits(), 0);
		assert.deepEqual(a.contentSnapshot(), before);
	});

	describe("after a remote upgrade from number to number or string", () => {
		/**
		 * Delivers B's schema upgrade while A still holds its number-only view.
		 *
		 * @returns A's tree, its original view, the events observed on that view, and a counter for A's own edits.
		 * B leaves the number unchanged, so a loss of root access on A is due to the stored schema change.
		 */
		async function deliverUpgrade(): Promise<{
			a: ISharedTree;
			view: ReadyTreeView<typeof SchemaFactory.number>;
			events: string[];
			localEdits: () => number;
		}> {
			// A holds a number-only view of the document that B loads.
			const a = await createNumberTree();
			const b = await getTree(await provider.loadTestContainer());

			const view = asAlpha(a).openView(numberOnly);

			assert.equal(view.kind, "ready");
			assert.equal(view.root, 5);

			// Start observing A before B can change the schema.
			const events: string[] = [];
			view.events.on("schemaChanged", () => events.push("schemaChanged"));
			view.events.on("rootChanged", () => events.push("rootChanged"));

			const localEdits = countLocalEdits(a);

			// B opens with the wider schema, then its upgrade is delivered to A.
			const upgraded = asAlpha(b).openView(numberOrString);
			assert.equal(upgraded.kind, "ready");
			assert.equal(upgraded.root, 5);

			await provider.ensureSynchronized();

			return { a, view, events, localEdits };
		}

		// B changes what the root permits, not its value. That schema change alone must invalidate A's view.
		it("notifies schemaChanged before rootChanged and denies old root access without writing", async () => {
			// Deliver B's upgrade while A is listening on its original view.
			const { events, view, localEdits } = await deliverUpgrade();

			// Check A's notification order and loss of access without reopening the tree.
			assert.deepEqual(events, ["schemaChanged", "rootChanged"]);
			assert.throws(() => view.root);
			assert.equal(localEdits(), 0);
		});

		it("reopens as incompatible with the old configuration", async () => {
			// Release A's invalidated view after the remote upgrade arrives.
			const { a, view, localEdits } = await deliverUpgrade();
			view.dispose();

			// Retry with the old schema, which no longer covers all permitted root values.
			const before = a.contentSnapshot();
			const reopened = asAlpha(a).openView(numberOnly);
			assert.equal(reopened.kind, "incompatible");

			// Confirm that rejecting the old schema did not undo B's change.
			await provider.ensureSynchronized();
			assert.equal(localEdits(), 0);
			assert.deepEqual(a.contentSnapshot(), before);
		});

		it("reopens as ready with the new configuration without another write", async () => {
			// Release A's invalidated view after the remote upgrade arrives.
			const { a, view, localEdits } = await deliverUpgrade();
			view.dispose();

			// Reopen using B's schema and read the value B preserved.
			const before = a.contentSnapshot();
			const reopened = asAlpha(a).openView(numberOrString);
			assert.equal(reopened.kind, "ready");
			assert.equal(reopened.root, 5);

			// Check that A used the shared upgrade instead of sending its own.
			await provider.ensureSynchronized();
			assert.equal(localEdits(), 0);
			assert.deepEqual(a.contentSnapshot(), before);
		});
	});

	// Unlike openView, opening through viewWith must not publish a schema change on the caller's behalf.
	it("viewWith waits for an explicit upgradeSchema call", async () => {
		// Load the number-only document and start tracking changes on the reader.
		const creator = await createNumberTree();
		const reader = await getTree(await provider.loadTestContainer());

		const before = reader.contentSnapshot();
		const localEdits = countLocalEdits(reader);

		// Request the wider view, then confirm that the request alone made no edit.
		const view = reader.viewWith(numberOrString);
		assert.equal(view.compatibility.canView, false);
		assert.equal(view.compatibility.canUpgrade, true);

		await provider.ensureSynchronized();
		assert.equal(localEdits(), 0);
		assert.deepEqual(reader.contentSnapshot(), before);

		// Apply the upgrade explicitly and wait for the creator to receive it.
		view.upgradeSchema();
		await provider.ensureSynchronized();
		assert(localEdits() > 0);
		assert.notDeepEqual(reader.contentSnapshot().schema, before.schema);

		// The creator can now use the wider schema without changing the original number.
		const observer = creator.viewWith(numberOrString);
		assert.equal(observer.compatibility.canView, true);
		assert.equal(observer.root, 5);
	});

	// A string written by the previous package and read by the current one exercises the newly permitted type across versions.
	it("the previous SharedTree reads the upgraded document and sends a compatible edit", async () => {
		// Publish the current client's schema upgrade before the previous client loads the document.
		const tree = await createNumberTree();
		const upgraded = asAlpha(tree).openView(numberOrString);
		assert.equal(upgraded.kind, "ready");
		assert.equal(upgraded.root, 5);
		await provider.ensureSynchronized();

		const previous = await import("@fluidframework/tree-previous/legacy");

		// Use the same storage format as the creator so this test isolates the effect of the schema upgrade.
		// The cast lets the current test harness register the previous package's factory;
		// the previous package still loads the tree, interprets the schema, and sends the edit.
		const oldKind = previous.configuredSharedTreeBetaLegacy({
			minVersionForCollab: "2.80.0",
		}) as unknown as ISharedObjectKind<PreviousTree> & SharedObjectKind<PreviousTree>;

		// Load through the previous factory and read the original number through its view.
		const container = await provider.loadTestContainer({
			registry: [[treeId, oldKind.getFactory()]],
		});
		const dataObject = await getDataObject(container);
		const oldTree = await dataObject.getInitialSharedObjectTyped(oldKind, treeId);
		const oldView = oldTree.viewWith(
			new previous.TreeViewConfiguration({
				schema: [previous.SchemaFactory.number, previous.SchemaFactory.string],
			}),
		);
		assert.equal(oldView.compatibility.canView, true);
		assert.equal(oldView.root, 5);

		// Send a string in the opposite direction and check the current client's live view.
		oldView.root = "written by the previous client";
		await provider.ensureSynchronized();
		assert.equal(upgraded.root, "written by the previous client");
	});
});
