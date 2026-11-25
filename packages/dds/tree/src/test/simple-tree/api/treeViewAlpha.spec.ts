/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type {
	ISharedObjectKind,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import {
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestFluidObjectInternal,
	TestObjectProvider,
} from "@fluidframework/test-utils/internal";
import {
	asBeta,
	createIdentifierIndex,
	createTreeIndex,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type ITreeAlpha,
	SchemaFactory,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	Tree,
	TreeViewAlpha,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "@fluidframework/tree/alpha";
import type { ITree as PreviousTree } from "@fluidframework/tree-previous";

// eslint-disable-next-line import-x/no-internal-modules -- Inspect the checkout to detect even edits with no net effect.
import { SchematizingSimpleTreeView } from "../../../shared-tree/schematizingTreeView.js";
import { toUpgradeSchema } from "../../../simple-tree/index.js";
import type { ISharedTree } from "../../../treeFactory.js";
import { DefaultTestSharedTreeKind, spyOnMethod, TestTreeProviderLite } from "../../utils.js";

const numberConfig = new TreeViewConfiguration({ schema: SchemaFactory.number });
const optionalConfig = new TreeViewConfiguration({
	schema: SchemaFactory.optional(SchemaFactory.number),
});
const unionConfig = new TreeViewConfiguration({
	schema: [SchemaFactory.number, SchemaFactory.string],
});

describe("treeViewAlpha", () => {
	describe("TreeViewAlpha.openExisting", () => {
		it("opens a matching document without submitting an edit", () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0];
			TreeViewAlpha.initializeNew(tree, numberConfig, 5).dispose();
			provider.synchronizeMessages();

			const result = TreeViewAlpha.openExisting(tree, numberConfig);
			assert(result.canView);
			assert.equal(result.view.root, 5);
			assert.equal(provider.peekNextMessage(), undefined);
			result.view.dispose();
		});

		it("returns an editable view after a required upgrade", () => {
			const tree = new TestTreeProviderLite().trees[0];
			TreeViewAlpha.initializeNew(tree, numberConfig, 5).dispose();

			const result = TreeViewAlpha.openExisting(tree, unionConfig);
			assert(result.canView);
			assert.equal(result.view.root, 5);
			result.view.root = "new type";
			assert.equal(result.view.root, "new type");
			result.view.dispose();
		});

		it("returns both diagnostic lists without retaining an incompatible view", () => {
			const tree = new TestTreeProviderLite().trees[0];
			TreeViewAlpha.initializeNew(tree, unionConfig, 5).dispose();

			const probe = asBeta(tree.viewWith(numberConfig));
			const { view, upgrade } = probe.compatibility;
			assert(!view.isCompatible && !upgrade.isCompatible);
			probe.dispose();
			const result = TreeViewAlpha.openExisting(tree, numberConfig);
			assert.deepEqual(result, {
				canView: false,
				incompatibilities: {
					view: view.incompatibilities,
					upgrade: upgrade.incompatibilities,
				},
			});
			tree.viewWith(unionConfig).dispose();
		});

		it("rejects an uninitialized required root without retaining a view", () => {
			const tree = new TestTreeProviderLite().trees[0];
			assert.throws(
				() => TreeViewAlpha.openExisting(tree, numberConfig),
				validateUsageError(/initializ/i),
			);
			TreeViewAlpha.initializeNew(tree, numberConfig, 5).dispose();
		});

		it("does not install a schema when loading an uninitialized optional root", () => {
			const tree = new TestTreeProviderLite().trees[0];
			assert.throws(
				() => TreeViewAlpha.openExisting(tree, optionalConfig),
				validateUsageError(/initializ/i),
			);
			TreeViewAlpha.initializeNew(tree, optionalConfig, undefined).dispose();
		});

		it("opens an initialized optional root with no content", () => {
			const tree = new TestTreeProviderLite().trees[0];
			TreeViewAlpha.initializeNew(tree, optionalConfig, undefined).dispose();
			const result = TreeViewAlpha.openExisting(tree, optionalConfig);
			assert(result.canView);
			assert.equal(result.view.root, undefined);
			result.view.dispose();
		});
	});

	describe("TreeViewAlpha.initializeNew", () => {
		const factory = new SchemaFactory("treeViewAlpha");
		class Note extends factory.object("Note", { title: factory.string }) {}
		const noteConfig = new TreeViewConfiguration({ schema: Note });

		it("returns the initialized view with a writable typed root", () => {
			const tree = new TestTreeProviderLite().trees[0];
			const view = TreeViewAlpha.initializeNew(tree, noteConfig, { title: "Draft" });
			assert(view.root instanceof Note);
			assert.equal(view.root.title, "Draft");
			view.root = { title: "Published" };
			assert.equal(view.root.title, "Published");
			view.dispose();
		});

		it("rejects invalid initial content with a usage error and permits retry", () => {
			const tree = new TestTreeProviderLite().trees[0];
			assert.throws(
				// @ts-expect-error -- A JavaScript caller can supply a number for the string title.
				() => TreeViewAlpha.initializeNew(tree, noteConfig, { title: 42 }),
				validateUsageError(/./),
			);
			const view = TreeViewAlpha.initializeNew(tree, noteConfig, { title: "Retry" });
			assert.equal(view.root.title, "Retry");
			view.dispose();
		});

		it("does not replace existing content when the schema matches", () => {
			const tree = new TestTreeProviderLite().trees[0];
			TreeViewAlpha.initializeNew(tree, numberConfig, 5).dispose();
			assert.throws(
				() => TreeViewAlpha.initializeNew(tree, numberConfig, 10),
				validateUsageError(/initializ/i),
			);
			assert.equal(tree.exportVerbose(), 5);
		});

		it("does not upgrade an initialized document to accept the requested schema", () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0];
			TreeViewAlpha.initializeNew(tree, numberConfig, 5).dispose();
			provider.synchronizeMessages();
			const before = tree.exportSimpleSchema();

			// A load could enable strings here. A mistaken creation request must not submit that edit.
			assert.throws(
				() => TreeViewAlpha.initializeNew(tree, unionConfig, "replacement"),
				validateUsageError(/initializ/i),
			);
			assert.equal(provider.peekNextMessage(), undefined);
			assert.deepEqual(tree.exportSimpleSchema(), before);
			assert.equal(tree.exportVerbose(), 5);
			tree.viewWith(numberConfig).dispose();
		});

		it("rejects an already-initialized document even when its schema is incompatible", () => {
			const tree = new TestTreeProviderLite().trees[0];
			TreeViewAlpha.initializeNew(tree, unionConfig, "existing").dispose();
			assert.throws(
				() => TreeViewAlpha.initializeNew(tree, numberConfig, 5),
				validateUsageError(/initializ/i),
			);
			const view = tree.viewWith(unionConfig);
			assert.equal(view.root, "existing");
			view.dispose();
		});
	});
});

// An open must leave a viewable document untouched and make the root editable when an upgrade is required.
describe("view creation compatibility", () => {
	const factory = new SchemaFactoryAlpha("test");

	/** Note schema for testing initialization with valid and invalid titles. */
	class Note extends factory.object("Note", { title: factory.string }) {}
	/** Configuration for the `Note` schema used in tests. */
	const noteConfig = new TreeViewConfiguration({ schema: Note, enableSchemaValidation: true });

	/**
	 * Sets up an initialized document without relying on the operation under test.
	 *
	 * @param target - The uninitialized tree to populate.
	 * @param config - The view configuration used to create the stored schema.
	 * @param content - The content the test expects to find when it opens the tree.
	 */
	function seedTree<T extends ImplicitFieldSchema>(
		target: ITreeAlpha,
		config: TreeViewConfiguration<T>,
		content: InsertableTreeFieldFromImplicitField<T>,
	): void {
		const view = target.viewWith(config);
		view.initialize(content);
		view.dispose();
	}

	/**
	 * Gets the checkout shared by successive views of the test tree.
	 *
	 * @remarks
	 * The probe need not match the stored schema because it never reads the root.
	 * Dispose it before returning so it does not prevent the test from opening another view.
	 */
	function getCheckout(target: ITreeAlpha) {
		const probe = target.viewWith(numberConfig);
		assert(probe instanceof SchematizingSimpleTreeView);
		const { checkout } = probe;
		probe.dispose();
		return checkout;
	}

	function createTree(): ITreeAlpha {
		return new TestTreeProviderLite().trees[0];
	}

	let tree: ITreeAlpha;
	beforeEach(() => {
		tree = createTree();
	});

	/**
	 * Opens the tree and verifies that the call made no edit.
	 *
	 * @remarks
	 * Comparing the branch head detects a commit even if its effect is not visible in the exported schema or content.
	 *
	 * @returns The result so the test can check the outcome and dispose a returned view.
	 */
	function openWithoutWriting<T extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<T>,
	) {
		const checkout = getCheckout(tree);
		const head = checkout.getLocationHead();
		const schema = tree.exportSimpleSchema();
		const content = tree.exportVerbose();
		const result = TreeViewAlpha.openExisting(tree, config);
		assert.equal(checkout.getLocationHead(), head);
		assert.deepEqual(tree.exportSimpleSchema(), schema);
		assert.deepEqual(tree.exportVerbose(), content);
		return result;
	}

	describe("when the document is already viewable", () => {
		it("reopens an initialized optional root with no node definitions", () => {
			const empty = new TreeViewConfiguration({ schema: factory.optional([]) });
			seedTree(tree, empty, undefined);
			const result = openWithoutWriting(empty);
			assert(result.canView);
			assert.equal(result.view.root, undefined);
			result.view.dispose();
		});

		it("does not offer a second initialization for an empty set of allowed types", () => {
			const staged = factory.types([factory.staged(factory.number)]);
			const empty = new TreeViewConfigurationAlpha({ schema: factory.optional(staged) });
			seedTree(tree, empty, undefined);

			// A required number cannot read this empty root or replace its stored optional field.
			assert(!openWithoutWriting(numberConfig).canView);
		});

		it("replaces the root with insertable content and reads it as the configured node", () => {
			seedTree(tree, noteConfig, { title: "Draft" });
			const result = TreeViewAlpha.openExisting(tree, noteConfig);
			assert(result.canView);
			const { view } = result;
			assert.equal(view.schema, Note);

			// The setter accepts a plain object, but the getter must return a hydrated Note.
			view.root = { title: "Final" };
			assert(view.root instanceof Note);
			assert.equal(view.root.title, "Final");
			view.dispose();
		});

		// Both schemas describe the same node type. Hiding a field from the view must not erase it from storage.
		it("preserves an undeclared optional field and its value", () => {
			class Stored extends factory.object("Item", {
				extra: factory.optional(factory.number),
			}) {}
			class Viewed extends factory.object("Item", {}, { allowUnknownOptionalFields: true }) {}
			seedTree(tree, new TreeViewConfiguration({ schema: Stored }), { extra: 7 });
			const result = openWithoutWriting(new TreeViewConfiguration({ schema: Viewed }));
			assert(result.canView);
			result.view.dispose();
		});

		// An explicit upgrade on a second tree proves that skipping the upgrade is observable.
		it("does not enable a permitted but unnecessary staged change", () => {
			// Start with a number-only document and a policy that would allow adding strings.
			seedTree(tree, numberConfig, 5);
			const staged = factory.staged(factory.string);
			const token = staged.metadata.stagedSchemaUpgrade;
			assert(token !== undefined);
			const config = new TreeViewConfigurationAlpha({
				schema: factory.types([factory.number, staged]),
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(token),
			});

			// Apply the upgrade explicitly on a copy of the starting state.
			const control = createTree();
			seedTree(control, numberConfig, 5);
			const manual = control.viewWith(config);
			manual.upgradeSchema();
			assert.notDeepEqual(control.exportSimpleSchema(), tree.exportSimpleSchema());
			manual.dispose();

			// Open the original with the same policy and verify that it skips the upgrade.
			const result = openWithoutWriting(config);
			assert(result.canView);
			result.view.dispose();
		});

		// An unused node definition blocks an upgrade but does not prevent the view from reading the root.
		it("opens even when the stored schema cannot be upgraded", () => {
			seedTree(tree, numberConfig, 5);
			const checkout = getCheckout(tree);
			const stored = toUpgradeSchema(factory.number);

			// An unreachable definition may still describe detached content and cannot be dropped.
			checkout.updateSchema({
				...stored,
				nodeSchema: new Map([
					...stored.nodeSchema,
					...toUpgradeSchema(factory.string).nodeSchema,
				]),
			});

			// Establish that viewing is possible even though upgrading is not.
			const probe = tree.viewWith(numberConfig);
			assert(probe.compatibility.canView && !probe.compatibility.canUpgrade);
			probe.dispose();

			// Open with that same configuration without touching the stored definition.
			const result = openWithoutWriting(numberConfig);
			assert(result.canView);
			result.view.dispose();
		});
	});

	describe("when viewing requires an upgrade", () => {
		it("updates an uninhabitable node definition required by the new view", () => {
			// Neither version of Pending can occur while its only required type is disabled.
			const required = factory.required(factory.types([factory.staged(factory.string)]));
			class Before extends factory.objectAlpha("Pending", { required }) {}
			class After extends factory.objectAlpha("Pending", {
				required,
				added: factory.optional(factory.number),
			}) {}
			seedTree(tree, new TreeViewConfiguration({ schema: [factory.number, Before] }), 42);

			// The possible documents are unchanged, but viewing still requires the new field definition.
			const result = TreeViewAlpha.openExisting(
				tree,
				new TreeViewConfiguration({ schema: [factory.number, After] }),
			);
			assert(result.canView);
			const { view } = result;
			assert.equal(view.root, 42);
			view.dispose();
		});

		it("does not write on a second open", () => {
			// The first open upgrades the document; disposing it closes only the view.
			seedTree(tree, numberConfig, 5);
			const firstResult = TreeViewAlpha.openExisting(tree, unionConfig);
			assert(firstResult.canView);
			const first = firstResult.view;
			first.dispose();

			// The second open must reuse the upgraded schema without another edit.
			const nextResult = openWithoutWriting(unionConfig);
			assert(nextResult.canView);
			const next = nextResult.view;
			next.dispose();
		});

		// Compare each automatic upgrade with an explicit upgrade from the same stored schema and policy.
		for (const [policyCase, retained, enable] of [
			["enables a selected staged type", false, true],
			["leaves an unselected staged type disabled", false, false],
			["retains an already-enabled type with its policy off", true, false],
		] as const) {
			it(policyCase, () => {
				// Give both trees the same starting schema and, if already permitted, a string to retain.
				const control = createTree();
				for (const target of [control, tree]) {
					if (retained) {
						seedTree(target, unionConfig, "retained");
					} else {
						seedTree(target, numberConfig, 5);
					}
				}
				const staged = factory.staged(factory.string);
				const token = staged.metadata.stagedSchemaUpgrade;
				assert(token !== undefined);

				// The non-staged boolean forces an upgrade regardless of the string policy.
				const config = new TreeViewConfigurationAlpha({
					schema: factory.types([factory.number, factory.boolean, staged]),
					...(enable && {
						stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(token),
					}),
				});
				// Establish the expected stored schema and value with an explicit upgrade.
				const manual = control.viewWith(config);
				assert(!manual.compatibility.canView && manual.compatibility.canUpgrade);
				manual.upgradeSchema();

				// Let TreeViewAlpha.openExisting upgrade the other tree and compare the two results.
				const result = TreeViewAlpha.openExisting(tree, config);
				assert(result.canView);
				assert.deepEqual(tree.exportSimpleSchema(), control.exportSimpleSchema());
				assert.equal(result.view.root, manual.root);
				result.view.dispose();
				manual.dispose();
			});
		}
	});

	describe("ready view helpers", () => {
		it("runs a view transaction on an empty optional root", () => {
			seedTree(tree, optionalConfig, undefined);
			const result = TreeViewAlpha.openExisting(tree, optionalConfig);
			assert(result.canView);
			const { view } = result;
			Tree.runTransaction(view, (root) => {
				assert.equal(root, undefined);
				view.root = 42;
				return Tree.runTransaction.rollback;
			});
			assert.equal(view.root, undefined);
			view.dispose();
		});

		it("indexes a ready view by a selected field", () => {
			seedTree(tree, noteConfig, { title: "Draft" });
			const result = TreeViewAlpha.openExisting(tree, noteConfig);
			assert(result.canView);
			const { view } = result;
			const index = createTreeIndex(
				view,
				() => "title",
				(nodes) => nodes[0],
				(key): key is string => typeof key === "string",
				[Note],
			);
			assert.equal(index.get("Draft"), view.root);
			view.root.title = "Updated";
			assert.equal(index.get("Updated"), view.root);
			index.dispose();
			view.dispose();
		});

		it("indexes identifiers on the view returned by initialization", () => {
			class Identified extends factory.object("Identified", { id: factory.identifier }) {}
			const view = TreeViewAlpha.initializeNew(
				tree,
				new TreeViewConfiguration({ schema: Identified }),
				{},
			);
			const index = createIdentifierIndex(view);
			assert.equal(index.get(view.root.id), view.root);
			index.dispose();
			view.dispose();
		});
	});

	describe("when viewing is blocked", () => {
		beforeEach(() => seedTree(tree, unionConfig, 5));

		it("checks the stored schema, not just the current value", () => {
			assert(!openWithoutWriting(numberConfig).canView);
		});

		// Opening another view tests cleanup; reading the original diagnostics after an upgrade tests their lifetime.
		it("keeps a diagnostic snapshot without holding a view open", () => {
			// Capture the original assessment and attempt the incompatible open.
			const probe = asBeta(tree.viewWith(numberConfig));
			const { view, upgrade } = probe.compatibility;
			assert(!view.isCompatible && !upgrade.isCompatible);
			probe.dispose();
			const result = TreeViewAlpha.openExisting(tree, numberConfig);
			assert(!result.canView);

			// Open a different view immediately and change the stored schema.
			const other = tree.viewWith(
				new TreeViewConfiguration({
					schema: [factory.number, factory.string, factory.boolean],
				}),
			);
			other.upgradeSchema();
			other.dispose();

			// Only now read the diagnostics: they must still describe the original schema.
			assert.deepEqual(result.incompatibilities.view, view.incompatibilities);
			assert.deepEqual(result.incompatibilities.upgrade, upgrade.incompatibilities);
		});
	});

	// A failed upgrade must leave the original exception visible and the tree available to another view.
	it("propagates an unexpected upgrade exception and releases the view", () => {
		// Arrange for the required upgrade to throw a recognizable exception.
		seedTree(tree, numberConfig, 5);
		const sentinel = new Error("test upgrade failure");
		const restore = spyOnMethod(SchematizingSimpleTreeView, "upgradeSchema", () => {
			throw sentinel;
		});

		// Attempt the open and check that the exact exception reaches the caller.
		try {
			assert.throws(
				() => TreeViewAlpha.openExisting(tree, unionConfig),
				(error) => error === sentinel,
			);
		} finally {
			restore();
		}

		// Reopen with the original schema to verify that the failed open released its view.
		const original = tree.viewWith(numberConfig);
		assert.equal(original.root, 5);
		original.dispose();
	});

	it("preserves the original exception when an upgrade breaks the checkout", () => {
		seedTree(tree, numberConfig, 5);
		const { breaker } = getCheckout(tree);
		const failure = new Error("fatal upgrade failure");
		const restore = spyOnMethod(SchematizingSimpleTreeView, "upgradeSchema", () =>
			breaker.break(failure),
		);
		try {
			assert.throws(
				() => TreeViewAlpha.openExisting(tree, unionConfig),
				(error) => error === failure,
			);
			assert.throws(() => breaker.use());
		} finally {
			restore();
		}

		// The simulated upgrade failed before changing the tree, so it is safe for this test to clear the error.
		// Only one view can be open at a time: opening another confirms that the failed open disposed its view.
		breaker.clearError();
		tree.viewWith(numberConfig).dispose();
	});

	it("rejects initialization observed while reading the caller's initial content", () => {
		const provider = new TestTreeProviderLite(2);
		const [local, remote] = provider.trees;
		seedTree(remote, noteConfig, { title: "Remote" });

		// Deliver the pending edit from the getter, after the first freshness check but before the schema edit.
		const content = {
			get title(): string {
				provider.synchronizeMessages();
				return "Local";
			},
		};
		assert.throws(
			() => TreeViewAlpha.initializeNew(local, noteConfig, content),
			validateUsageError(/initialized more than once/),
		);

		// A recoverable rejection leaves both the checkout and the other client's note intact.
		const reopenedResult = TreeViewAlpha.openExisting(local, noteConfig);
		assert(reopenedResult.canView);
		const reopened = reopenedResult.view;
		assert.equal(reopened.root.title, "Remote");
		reopened.dispose();
	});
});

// Separate containers let these tests distinguish a remote schema upgrade from an unintended local write.
describe("view creation collaboration", () => {
	const treeId = "tree";

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
		const view = tree.viewWith(numberConfig);
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
		const initialized = TreeViewAlpha.initializeNew(creator, numberConfig, 5);
		initialized.dispose();

		// Attach the initialized document so a second client can load it by ID.
		await provider.attachDetachedContainer(detached);

		// Capture the reader's state before it opens the existing document.
		const reader = await getTree(await provider.loadTestContainer());
		const before = reader.contentSnapshot();
		const localEdits = countLocalEdits(reader);
		const loadedResult = TreeViewAlpha.openExisting(reader, numberConfig);
		assert(loadedResult.canView);
		const loaded = loadedResult.view;
		assert.equal(loaded.root, 5);

		// Allow any edit from the reader to be sequenced before checking that it made none.
		await provider.ensureSynchronized();
		assert.deepEqual(reader.contentSnapshot(), before);
		assert.equal(localEdits(), 0);
	});

	// A must not overwrite the value it has already received from B.
	it("rejects initialization after observing another client's initialization", async () => {
		// Start two clients on the same uninitialized tree.
		const a = await getTree(await provider.makeTestContainer());
		const b = await getTree(await provider.loadTestContainer());

		// B sets the initial value and A receives it before attempting its own write.
		b.viewWith(numberConfig).initialize(5);
		await provider.ensureSynchronized();

		// A attempts to initialize after the remote value is visible.
		const before = a.contentSnapshot();
		const localEdits = countLocalEdits(a);
		assert.throws(() => TreeViewAlpha.initializeNew(a, numberConfig, 42), UsageError);

		// Reopen on A and verify that B's value survived with no edit from A.
		const reopenedResult = TreeViewAlpha.openExisting(a, numberConfig);
		assert(reopenedResult.canView);
		const reopened = reopenedResult.view;
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
			view: TreeViewAlpha<typeof SchemaFactory.number>;
			events: string[];
			localEdits: () => number;
		}> {
			// A holds a number-only view of the document that B loads.
			const a = await createNumberTree();
			const b = await getTree(await provider.loadTestContainer());

			const result = TreeViewAlpha.openExisting(a, numberConfig);

			assert(result.canView);
			const { view } = result;
			assert.equal(view.root, 5);

			// Start observing A before B can change the schema.
			const events: string[] = [];
			view.events.on("schemaChanged", () => events.push("schemaChanged"));
			view.events.on("rootChanged", () => events.push("rootChanged"));

			const localEdits = countLocalEdits(a);

			// B opens with the wider schema, then its upgrade is delivered to A.
			const upgradedResult = TreeViewAlpha.openExisting(b, unionConfig);
			assert(upgradedResult.canView);
			const upgraded = upgradedResult.view;
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
			const reopened = TreeViewAlpha.openExisting(a, numberConfig);
			assert(!reopened.canView);

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
			const reopenedResult = TreeViewAlpha.openExisting(a, unionConfig);
			assert(reopenedResult.canView);
			const reopened = reopenedResult.view;
			assert.equal(reopened.root, 5);

			// Check that A used the shared upgrade instead of sending its own.
			await provider.ensureSynchronized();
			assert.equal(localEdits(), 0);
			assert.deepEqual(a.contentSnapshot(), before);
		});
	});

	// Unlike TreeViewAlpha.openExisting, opening through viewWith must not publish a schema change on the caller's behalf.
	it("viewWith waits for an explicit upgradeSchema call", async () => {
		// Load the number-only document and start tracking changes on the reader.
		const creator = await createNumberTree();
		const reader = await getTree(await provider.loadTestContainer());

		const before = reader.contentSnapshot();
		const localEdits = countLocalEdits(reader);

		// Request the wider view, then confirm that the request alone made no edit.
		const view = reader.viewWith(unionConfig);
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
		const observer = creator.viewWith(unionConfig);
		assert.equal(observer.compatibility.canView, true);
		assert.equal(observer.root, 5);
	});

	// A string written by the previous package and read by the current one exercises the newly permitted type across versions.
	it("the previous SharedTree reads the upgraded document and sends a compatible edit", async () => {
		// Publish the current client's schema upgrade before the previous client loads the document.
		const tree = await createNumberTree();
		const upgradedResult = TreeViewAlpha.openExisting(tree, unionConfig);
		assert(upgradedResult.canView);
		const upgraded = upgradedResult.view;
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
