/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Single-client contract tests for openView. Each case runs against both a SharedTree and an independent tree.
// The result kind is only part of the contract: opening a viewable document must leave its stored schema
// and content untouched, while a required upgrade must make the returned root editable.

import { strict as assert } from "node:assert";

import {
	asAlpha,
	asBeta,
	createIndependentTreeAlpha,
	createIdentifierIndex,
	createTreeIndex,
	Tree,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type ViewableTreeAlpha,
} from "@fluidframework/tree/alpha";

// eslint-disable-next-line import-x/no-internal-modules -- Inspect the checkout to detect even edits with no net effect.
import { SchematizingSimpleTreeView } from "../../shared-tree/schematizingTreeView.js";
import { toUpgradeSchema } from "../../simple-tree/index.js";
import { spyOnMethod, TestTreeProviderLite } from "../utils.js";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

const factory = new SchemaFactoryAlpha("test");

/** Configuration for a tree whose root is a required number. */
const numberConfig = new TreeViewConfiguration({ schema: factory.number });
/** Configuration for a tree whose root is an optional number. */
const optionalConfig = new TreeViewConfiguration({ schema: factory.optional(factory.number) });
/** Configuration for a tree whose root is a required union of number and string. */
const unionConfig = new TreeViewConfiguration({ schema: [factory.number, factory.string] });

/** Note schema for testing initialization with valid and invalid titles. */
class Note extends factory.object("Note", { title: factory.string }) {}
/** Configuration for the `Note` schema used in tests. */
const noteConfig = new TreeViewConfiguration({ schema: Note, enableSchemaValidation: true });

/**
 * Sets up an initialized document without relying on the operation under test.
 *
 * @param tree - The uninitialized tree to populate.
 * @param config - The view configuration used to create the stored schema.
 * @param content - The content the test expects to find when it opens the tree.
 */
function seedTree<T extends ImplicitFieldSchema>(
	tree: ViewableTreeAlpha,
	config: TreeViewConfiguration<T>,
	content: InsertableTreeFieldFromImplicitField<T>,
): void {
	const view = tree.viewWith(config);
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
function getCheckout(tree: ViewableTreeAlpha) {
	const probe = tree.viewWith(numberConfig);
	assert(probe instanceof SchematizingSimpleTreeView);
	const { checkout } = probe;
	probe.dispose();
	return checkout;
}

describe("openView", () => {
	for (const [name, createTree] of [
		["SharedTree", () => asAlpha(new TestTreeProviderLite().trees[0])],
		["independent tree", () => createIndependentTreeAlpha()],
	] as const) {
		describe(name, () => {
			let tree: ViewableTreeAlpha;
			beforeEach(() => {
				tree = createTree();
			});

			/**
			 * Opens the tree and verifies that the call made no edit.
			 *
			 * @remarks
			 * Comparing the branch head detects a commit even if its effect is not visible in the exported schema or content.
			 *
			 * @returns The result so the test can check its kind and dispose any live handle.
			 */
			function openWithoutWriting<T extends ImplicitFieldSchema>(
				config: TreeViewConfiguration<T>,
			) {
				const checkout = getCheckout(tree);
				const head = checkout.getLocationHead();
				const schema = tree.exportSimpleSchema();
				const content = tree.exportVerbose();
				const result = tree.openView(config);
				assert.equal(checkout.getLocationHead(), head);
				assert.deepEqual(tree.exportSimpleSchema(), schema);
				assert.deepEqual(tree.exportVerbose(), content);
				return result;
			}

			describe("when the document is uninitialized", () => {
				for (const [label, open] of [
					["required", () => openWithoutWriting(numberConfig)],
					["optional", () => openWithoutWriting(optionalConfig)],
				] as const) {
					it(`returns an initializer without writing for a ${label} root`, () => {
						const result = open();
						assert.equal(result.kind, "uninitialized");
						result.dispose();
					});
				}
			});

			describe("when the document is already viewable", () => {
				it("reopens an initialized optional root with no node definitions", () => {
					const empty = new TreeViewConfiguration({ schema: factory.optional([]) });
					seedTree(tree, empty, undefined);
					const result = openWithoutWriting(empty);
					assert.equal(result.kind, "ready");
					assert.equal(result.view.root, undefined);
					result.view.dispose();
				});

				it("does not offer a second initialization for an empty set of allowed types", () => {
					const staged = factory.types([factory.staged(factory.number)]);
					const empty = new TreeViewConfigurationAlpha({ schema: factory.optional(staged) });
					seedTree(tree, empty, undefined);

					// A required number cannot read this empty root or replace its stored optional field.
					assert.equal(openWithoutWriting(numberConfig).kind, "incompatible");
				});

				it("replaces the root with insertable content and reads it as the configured node", () => {
					seedTree(tree, noteConfig, { title: "Draft" });
					const result = tree.openView(noteConfig);
					assert.equal(result.kind, "ready");
					const { view } = result;
					assert.equal(view.schema, Note);

					// The setter accepts a plain object, but the getter must return a hydrated Note.
					view.root = { title: "Final" };
					assert(view.root instanceof Note);
					assert.equal(view.root.title, "Final");
					view.dispose();
				});

				it("opens an empty initialized optional root", () => {
					seedTree(tree, optionalConfig, undefined);
					const result = openWithoutWriting(optionalConfig);
					assert.equal(result.kind, "ready");
					assert.equal(result.view.root, undefined);
					result.view.dispose();
				});

				it("opens a matching schema", () => {
					seedTree(tree, numberConfig, 5);
					const result = openWithoutWriting(numberConfig);
					assert.equal(result.kind, "ready");
					assert.equal(result.view.root, 5);
					result.view.dispose();
				});

				// Both schemas describe the same node type. Hiding a field from the view must not erase it from storage.
				it("preserves an undeclared optional field and its value", () => {
					class Stored extends factory.object("Item", {
						extra: factory.optional(factory.number),
					}) {}
					class Viewed extends factory.object(
						"Item",
						{},
						{ allowUnknownOptionalFields: true },
					) {}
					seedTree(tree, new TreeViewConfiguration({ schema: Stored }), { extra: 7 });
					const result = openWithoutWriting(new TreeViewConfiguration({ schema: Viewed }));
					assert.equal(result.kind, "ready");
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
					assert.equal(result.kind, "ready");
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
					assert.equal(result.kind, "ready");
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
					const result = tree.openView(
						new TreeViewConfiguration({ schema: [factory.number, After] }),
					);
					assert.equal(result.kind, "ready");
					const { view } = result;
					assert.equal(view.root, 42);
					view.dispose();
				});

				it("preserves the number and permits writing a string through the returned view", () => {
					// Open the number-only document with a schema that also accepts strings.
					seedTree(tree, numberConfig, 5);
					const result = tree.openView(unionConfig);
					assert.equal(result.kind, "ready");
					assert.equal(result.view.root, 5);

					// Exercise the new permission through the same view, without reopening.
					result.view.root = "new";
					assert.equal(result.view.root, "new");
					result.view.dispose();
				});

				it("does not write on a second open", () => {
					// The first open upgrades the document; disposing it closes only the view.
					seedTree(tree, numberConfig, 5);
					const firstResult = tree.openView(unionConfig);
					assert.equal(firstResult.kind, "ready");
					const first = firstResult.view;
					first.dispose();

					// The second open must reuse the upgraded schema without another edit.
					const nextResult = openWithoutWriting(unionConfig);
					assert.equal(nextResult.kind, "ready");
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

						// Let openView upgrade the other tree and compare the two results.
						const result = tree.openView(config);
						assert.equal(result.kind, "ready");
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
					const result = tree.openView(optionalConfig);
					assert.equal(result.kind, "ready");
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
					const result = tree.openView(noteConfig);
					assert.equal(result.kind, "ready");
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
					const init = tree.openView(new TreeViewConfiguration({ schema: Identified }));
					assert.equal(init.kind, "uninitialized");
					const view = init.initialize({});
					const index = createIdentifierIndex(view);
					assert.equal(index.get(view.root.id), view.root);
					index.dispose();
					view.dispose();
				});
			});

			describe("when initialization is available", () => {
				/**
				 * Opens the note tree and narrows the result to the initializer owned by the test.
				 */
				function getInitializer() {
					const result = tree.openView(noteConfig);
					assert.equal(result.kind, "uninitialized");
					return result;
				}

				it("returns an immediately editable ready view", () => {
					const view = getInitializer().initialize({ title: "Draft" });
					assert.equal(view.root.title, "Draft");
					view.root.title = "Updated";
					assert.equal(view.root.title, "Updated");
					view.dispose();
				});

				it("rejects repeated initialization", () => {
					// The first call consumes the initializer and gives the caller a ready view.
					const initializer = getInitializer();
					const view = initializer.initialize({ title: "First" });
					assert(initializer.disposed);

					// Reusing the consumed handle must not overwrite the first title.
					assert.throws(() => initializer.initialize({ title: "Second" }));
					assert.equal(view.root.title, "First");
					view.dispose();
				});

				it("transfers ownership to the ready view", () => {
					// Keep both handles across initialization to distinguish their lifetimes.
					const initializer = getInitializer();
					const view = initializer.initialize({ title: "Mine" });

					// Disposing the old handle must leave the new owner able to read the note.
					initializer.dispose();
					assert.equal(view.root.title, "Mine");
					view.dispose();
				});

				it("can abandon an unused initializer", () => {
					// Abandon the first handle without supplying content.
					getInitializer().dispose();

					// A fresh open must still yield an initializer, not a ready view.
					getInitializer().dispose();
				});

				it("rejects initialization after disposal without writing", () => {
					// Record the starting revision and abandon the initializer.
					const checkout = getCheckout(tree);
					const head = checkout.getLocationHead();
					const initializer = getInitializer();
					initializer.dispose();

					// Verify that the late call fails without committing an edit.
					assert.throws(() => initializer.initialize({ title: "Late" }));
					assert.equal(checkout.getLocationHead(), head);
				});

				it("throws on invalid input", () => {
					const initializer = getInitializer();
					// @ts-expect-error -- Exercise the runtime's validation for JavaScript callers.
					assert.throws(() => initializer.initialize({ title: false }));
				});

				it("releases the initializer after validation fails", () => {
					const initializer = getInitializer();

					// @ts-expect-error -- Supply invalid content to exercise the cleanup path.
					assert.throws(() => initializer.initialize({ title: false }));
					assert(initializer.disposed);

					// Retry through a fresh handle without manually disposing the failed one.
					getInitializer().initialize({ title: "Retry" }).dispose();
				});

				it("releases the ready view without disposing its tree", () => {
					// Initialize the note, then close the view that owns it.
					getInitializer().initialize({ title: "Keep" }).dispose();

					// Reopen the same tree and read its persisted title.
					const nextResult = tree.openView(noteConfig);
					assert.equal(nextResult.kind, "ready");
					const next = nextResult.view;
					assert.equal(next.root.title, "Keep");
					next.dispose();
				});
			});

			describe("when viewing is blocked", () => {
				beforeEach(() => seedTree(tree, unionConfig, 5));

				it("checks the stored schema, not just the current value", () => {
					assert.equal(openWithoutWriting(numberConfig).kind, "incompatible");
				});

				it("returns both sets of structured incompatibilities", () => {
					// Capture the two expected reasons from the existing compatibility API.
					const probe = asBeta(tree.viewWith(numberConfig));
					const { view, upgrade } = probe.compatibility;
					assert(!view.isCompatible && !upgrade.isCompatible);
					probe.dispose();

					// Compare the failed open with that assessment of the same stored schema.
					const result = tree.openView(numberConfig);
					assert.equal(result.kind, "incompatible");
					assert(
						result.viewIncompatibilities.length > 0 &&
							result.upgradeIncompatibilities.length > 0,
					);
					assert.deepEqual(result.viewIncompatibilities, view.incompatibilities);
					assert.deepEqual(result.upgradeIncompatibilities, upgrade.incompatibilities);
				});

				// Opening another view tests cleanup; reading the original diagnostics after an upgrade tests their lifetime.
				it("keeps a diagnostic snapshot without holding a view open", () => {
					// Capture the original assessment and attempt the incompatible open.
					const probe = asBeta(tree.viewWith(numberConfig));
					const { view, upgrade } = probe.compatibility;
					assert(!view.isCompatible && !upgrade.isCompatible);
					probe.dispose();
					const result = tree.openView(numberConfig);
					assert.equal(result.kind, "incompatible");

					// Open a different view immediately and change the stored schema.
					const other = tree.viewWith(
						new TreeViewConfiguration({
							schema: [factory.number, factory.string, factory.boolean],
						}),
					);
					other.upgradeSchema();
					other.dispose();

					// Only now read the diagnostics: they must still describe the original schema.
					assert.deepEqual(result.viewIncompatibilities, view.incompatibilities);
					assert.deepEqual(result.upgradeIncompatibilities, upgrade.incompatibilities);
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
						() => tree.openView(unionConfig),
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
						() => tree.openView(unionConfig),
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
		});
	}

	it("rejects initialization observed while reading the caller's initial content", () => {
		const provider = new TestTreeProviderLite(2);
		const [local, remote] = provider.trees;
		const initializer = asAlpha(local).openView(noteConfig);
		assert.equal(initializer.kind, "uninitialized");
		seedTree(asAlpha(remote), noteConfig, { title: "Remote" });

		// Deliver the pending edit from the getter, after the first freshness check but before the schema edit.
		const content = {
			get title(): string {
				provider.synchronizeMessages();
				return "Local";
			},
		};
		assert.throws(
			() => initializer.initialize(content),
			validateUsageError(/initialized more than once/),
		);
		assert(initializer.disposed);

		// A recoverable rejection leaves both the checkout and the other client's note intact.
		const reopenedResult = asAlpha(local).openView(noteConfig);
		assert.equal(reopenedResult.kind, "ready");
		const reopened = reopenedResult.view;
		assert.equal(reopened.root.title, "Remote");
		reopened.dispose();
	});
});
