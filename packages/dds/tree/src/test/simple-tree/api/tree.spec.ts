/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { Revertible } from "../../../core/index.js";
import { Tree } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { UnhydratedFlexTreeNode } from "../../../simple-tree/core/index.js";
import {
	createFieldSchema,
	FieldKind,
	getDefaultProvider,
	type ConstantFieldProvider,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/fieldSchema.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	unhydratedFlexTreeFromInsertable,
	type ImplicitFieldSchema,
	type TreeView,
	type TreeViewAlpha,
	type TreeViewBeta,
} from "../../../simple-tree/index.js";
import { SharedTree } from "../../../treeFactory.js";
import type { JsonCompatibleReadOnly, requireAssignableTo } from "../../../util/index.js";
import { getView, StringArray, TestTreeProviderLite } from "../../utils.js";
import { getViewForForkedBranch } from "../utils.js";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.array("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

const factory = SharedTree.getFactory();

// Type tests
{
	// TreeViewBeta should be assignable to TreeView
	type _checkBetaAssignableToPublic = requireAssignableTo<
		TreeViewBeta<ImplicitFieldSchema>,
		TreeView<ImplicitFieldSchema>
	>;

	// TreeViewAlpha should be assignable to TreeViewBeta
	type _checkAlphaAssignableToBeta = requireAssignableTo<
		TreeViewAlpha<ImplicitFieldSchema>,
		TreeViewBeta<ImplicitFieldSchema>
	>;
}

describe("simple-tree tree", () => {
	it("ListRoot", () => {
		const config = new TreeViewConfiguration({ schema: SchemaFactory.required(NodeList) });
		const view = getView(config);
		view.initialize(new NodeList(["a", "b"]));
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("Implicit ListRoot", () => {
		const config = new TreeViewConfiguration({ schema: NodeList });
		const view = getView(config);
		view.initialize(["a", "b"]);
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("ObjectRoot - Data", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize({ stuff: ["a", "b"] });
	});

	// This tests the two main cases for schema validation, initial trees and inserted content.
	it("default identifier with schema validation", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const view = getView(config);
		// Initialize case
		view.initialize({});
		const idFromInitialize = Tree.shortId(view.root);
		assert(typeof idFromInitialize === "number");

		// unhydratedFlexTreeFromInsertable skips schema validation when creating the unhydrated node since it does not have a context to opt in.
		const newNode = new HasId({});
		// This should validate the inserted content (this test is attempting to check validation is done after defaults are provided).
		view.root = newNode;
		const idFromHydration = Tree.shortId(view.root);
		assert(typeof idFromHydration === "number");
		assert(idFromInitialize !== idFromHydration);
	});

	describe("invalid default", () => {
		// Field providers are assumed to validate their content:
		// These tests use internal APIs to construct an intentionally invalid one to slip out of schema data into the flex tree.
		const numberProvider: ConstantFieldProvider = (): UnhydratedFlexTreeNode[] => [
			// The schema listed here is intentionally incorrect,
			// it should be a string given how this field is used below.
			unhydratedFlexTreeFromInsertable(5, schema.number),
		];

		class InvalidDefault extends schema.object("hasID", {
			id: createFieldSchema(FieldKind.Identifier, schema.string, {
				defaultProvider: getDefaultProvider(numberProvider),
			}),
		}) {}

		const config = new TreeViewConfiguration({
			schema: InvalidDefault,
			enableSchemaValidation: true,
		});

		it("invalid default - initialize", () => {
			const view = getView(config);
			assert.throws(
				() => view.initialize({}),
				validateUsageError(/A node type is not allowed in its field/),
			);
		});

		it("invalid default - insert", () => {
			const view = getView(config);
			view.initialize({ id: "x" });

			const newNode = new InvalidDefault({});
			// This should validate the inserted content (this test is attempting to check validation is done after defaults are provided).
			assert.throws(
				() => {
					view.root = newNode;
				},
				validateUsageError(/A node type is not allowed in its field/),
			);
		});
	});

	it("custom identifier copied from tree", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const treeSrc = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const view = treeSrc.viewWith(config);
		view.initialize({});
		const idFromInitialize = Tree.shortId(view.root);
		assert(typeof idFromInitialize === "number");

		const treeDst = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const viewDst = treeDst.viewWith(config);
		viewDst.initialize({});
		const newNode = new HasId({ id: view.root.id });
		const idFromUnhydrated = Tree.shortId(newNode);
		viewDst.root = newNode;
		const idFromHydrated = Tree.shortId(newNode);
		assert.equal(idFromUnhydrated, idFromHydrated);
	});

	it("viewWith twice errors", () => {
		class Empty extends schema.object("Empty", {}) {}
		const config = new TreeViewConfiguration({ schema: Empty });
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const view = tree.viewWith(config);
		assert.throws(
			() => {
				const view2 = tree.viewWith(config);
			},
			validateUsageError(/second tree view/),
		);
	});

	it("accessing view.root does not leak LazyEntities", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize({ stuff: [] });
		const _unused = view.root;
		const context = view.getFlexTreeContext();
		const countBefore = context.withAnchors.size;
		for (let index = 0; index < 10; index++) {
			const _unused2 = view.root;
		}
		const countAfter = context.withAnchors.size;

		assert.equal(countBefore, countAfter);
	});

	it("accessing root via Tree.parent does not leak LazyEntities", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize({ stuff: [] });
		const child = view.root.stuff;
		Tree.parent(child);
		const context = view.getFlexTreeContext();
		const countBefore = context.withAnchors.size;
		for (let index = 0; index < 10; index++) {
			Tree.parent(child);
		}
		const countAfter = context.withAnchors.size;

		assert.equal(countBefore, countAfter);
	});

	it("ObjectRoot - unhydrated", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const view = getView(config);
		view.initialize(new Canvas({ stuff: ["a", "b"] }));
	});

	it("Union Root", () => {
		const config = new TreeViewConfiguration({ schema: [schema.string, schema.number] });
		const view = getView(config);
		view.initialize("a");
		assert.equal(view.root, "a");
	});

	it("optional Root - initialized to undefined", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const view = getView(config);
		// Note: the tree's schema hasn't been initialized at this point, so even though the view schema
		// allows an optional field, explicit initialization must occur.
		assert.throws(
			() => view.root,
			/TreeView\.root is unavailable because the view schema is incompatible with the stored schema\. The document is uninitialized; call TreeView\.initialize\(\)/,
		);
		view.initialize(undefined);
		assert.equal(view.root, undefined);
	});

	it("optional Root - initializing only schema", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const view = getView(config);
		view.upgradeSchema();
		assert.equal(view.root, undefined);
	});

	it("optional Root - full", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const view = getView(config);
		view.initialize("x");
		assert.equal(view.root, "x");
	});

	it("Nested list", () => {
		const nestedList = schema.array(schema.array(schema.string));
		const config = new TreeViewConfiguration({ schema: nestedList });
		const view = getView(config);
		view.initialize([["a"]]);
		assert.equal(view.root?.length, 1);
		const child = view.root[0];
		assert.equal(child.length, 1);
		const child2 = child[0];
		assert.equal(child2, "a");
	});

	describe("field defaults", () => {
		it("initialize with identifier to unpopulated identifier fields.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.identifier,
			});
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ identifier: undefined });
			assert.equal(view.root.identifier, "beefbeef-beef-4000-8000-000000000001");
		});

		it("adds identifier to unpopulated identifier fields.", () => {
			class SchemaWithIdentifier extends schema.object("parent", {
				identifier: schema.identifier,
			}) {}
			const config = new TreeViewConfiguration({
				schema: SchemaFactory.optional(SchemaWithIdentifier),
			});
			const view = getView(config);
			view.initialize(undefined);
			const toHydrate = new SchemaWithIdentifier({ identifier: undefined });

			view.root = toHydrate;
			assert.equal(toHydrate, view.root);
			assert.equal(toHydrate.identifier, "beefbeef-beef-4000-8000-000000000002");

			view.root = { identifier: undefined };
			assert.equal(view.root?.identifier, "beefbeef-beef-4000-8000-000000000004");
		});

		it("populates field when no field defaulter is provided.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				testOptionalField: schema.optional(schema.string),
			});
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config);
			view.initialize({ testOptionalField: undefined });
			assert.equal(view.root.testOptionalField, undefined);
		});

		// TODO: Identifier roots should be able to be defaulted, but currently throw a usage error.
		it.skip("adds identifier to unpopulated root", () => {
			const config = new TreeViewConfiguration({ schema: schema.identifier });
			const view = getView(config);
			view.initialize(undefined);
			assert.equal(view.root, "beefbeef-beef-4000-8000-000000000001");
		});
	});

	describe("Serialized changes", () => {
		it("can be applied to a different branch", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			assert(change !== undefined);
			viewA.applyChange(change);
			assert.equal(viewA.root, 4);
		});

		it("fail to apply to a branch in another session", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = getView(config);
			viewB.initialize(3);

			let change: JsonCompatibleReadOnly | undefined;
			viewA.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});
			viewA.root = 4;

			const c = change ?? assert.fail("change not captured");
			assert.throws(() => {
				viewB.applyChange(c);
			}, /cannot apply change.*same sharedtree/i);
		});

		it("error if malformed", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			assert.throws(() => {
				viewA.applyChange({ invalid: "bogus" });
			}, /cannot apply change.*invalid.*format/i);
		});

		it("can be undone", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let revertible: Revertible | undefined;
			viewA.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				revertible = metadata.getRevertible();
			});
			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			assert(change !== undefined);
			viewA.applyChange(change);
			assert(revertible !== undefined);
			revertible.revert();
			assert.equal(viewA.root, 3);
		});

		it("can apply alongside a transaction", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			viewA.runTransaction(() => {
				assert(change !== undefined);
				viewA.applyChange(change);
			});
			assert.equal(viewA.root, 4);
		});

		it("apply before transactions", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			viewB.root = 4;
			viewA.runTransaction(() => {
				viewA.root = 5;
				assert(change !== undefined);
				// Even though the serialized change (= 4) is applied _after_ the transaction change (= 5),
				// it is considered a change external to the transaction and so will be applied before the transaction changes,
				// as is the general policy for external changes applied during a transaction.
				viewA.applyChange(change);
			});
			assert.equal(viewA.root, 5);
		});
	});

	describe("computeNetChangeIfRebasedOnto", () => {
		const scenarios = [
			{ editSource: false, editTarget: false },
			{ editSource: true, editTarget: false },
			{ editSource: false, editTarget: true },
			{ editSource: true, editTarget: true },
		];
		for (const { editSource, editTarget } of scenarios) {
			it(`when source branch is ${editSource ? "edited" : "not edited"} and target branch is ${
				editTarget ? "edited" : "not edited"
			}`, () => {
				const config = new TreeViewConfiguration({ schema: StringArray });
				const targetView = getView(config);
				targetView.initialize([]);
				const sourceView = targetView.fork();

				if (editSource) {
					sourceView.root.insertAtEnd("source edit");
				}
				if (editTarget) {
					targetView.root.insertAtEnd("target edit");
				}
				const rebasedView = getViewForForkedBranch(sourceView).forkView;
				const appliedView = getViewForForkedBranch(sourceView).forkView;

				rebasedView.rebaseOnto(targetView);

				// Validating the output of `computeNetChangeIfRebasedOnto` directly would make the test brittle since the internals of the format are implementation details.
				// Instead, we apply the net change to the applied view and then compare the resulting state to the rebased view to ensure they are equivalent.
				const netChange = appliedView.computeNetChangeIfRebasedOnto(targetView);
				if (netChange !== undefined) {
					appliedView.applyChange(netChange);
				}

				assert.deepEqual([...appliedView.root], [...rebasedView.root]);
			});
		}
	});

	describe("isMissingEditsFrom", () => {
		it("returns false when the branches are equivalent", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			assert.equal(viewA.isMissingEditsFrom(viewB), false);
			assert.equal(viewB.isMissingEditsFrom(viewA), false);
		});

		it("returns false when only 'this' branch is ahead", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			viewB.root = 4;
			assert.equal(viewB.isMissingEditsFrom(viewA), false);
		});

		it("returns true when only the other branch is ahead", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			viewB.root = 4;
			assert.equal(viewA.isMissingEditsFrom(viewB), true);
		});

		it("returns true when both branches are diverged", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			viewA.root = 4;
			viewB.root = 4;
			assert.equal(viewA.isMissingEditsFrom(viewB), true);
			assert.equal(viewB.isMissingEditsFrom(viewA), true);
		});
	});

	describe("rewindTo", () => {
		it("is not allowed on a shared branch", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			const revision1 = view.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");

			assert.throws(
				() => view.rewindTo(revision1),
				/Cannot switch a view away from a shared branch/,
			);
		});

		it("rewinds the view", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			const revision1 = view.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			view.root = 2;

			// Fork to a branch that can be rewound
			const fork = getViewForForkedBranch(view).forkView;

			const revision2 = fork.branchHistory.getHead()?.revision;
			assert(revision2 !== undefined, "revision should be defined");
			fork.root = 3;
			fork.root = 4;

			// Consistency check
			assert.equal(fork.branchHistory.length, 4);

			// Act
			fork.rewindTo(revision2);

			// Verify
			assert.equal(fork.branchHistory.length, 2);
			assert.equal(fork.root, 2);

			// Act
			fork.rewindTo(revision1);

			// Verify
			assert.equal(fork.branchHistory.length, 1);
			assert.equal(fork.root, 1);
		});

		it("new edits can be made after rewinding", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			// Fork to a branch that can be rewound
			const fork = getViewForForkedBranch(view).forkView;

			const revision1 = fork.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			fork.root = 2;

			fork.rewindTo(revision1);
			assert.equal(fork.branchHistory.length, 1);

			// Act
			fork.root = 42;

			// Verify
			assert.equal(fork.branchHistory.length, 2);
			assert.equal(fork.root, 42);
		});

		it("new edits made after rewinding do not affect the original branch", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			// Fork to a branch that can be rewound
			const fork = getViewForForkedBranch(view).forkView;
			const revision1 = fork.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			fork.root = 2;

			const branchBeforeRewind = fork.checkout.mainBranch;

			fork.rewindTo(revision1);

			// Act
			fork.root = 42;
			fork.root = 43;
			fork.root = 44;

			// Verify
			fork.checkout.switchBranch(branchBeforeRewind);
			assert.equal(fork.branchHistory.length, 2);
			assert.equal(fork.root, 2);
		});
	});

	describe("revertTo", () => {
		it("restores the state of the given revision with a new commit", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);

			const revision1 = view.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			view.root = 2;
			const revision2 = view.branchHistory.getHead()?.revision;
			assert(revision2 !== undefined, "revision should be defined");
			view.root = 3;
			view.root = 4;

			// Consistency check
			assert.equal(view.branchHistory.length, 4);

			// Act
			view.revertTo(revision2);

			const revision5 = view.branchHistory.getHead()?.revision;
			assert(revision5 !== undefined, "revision should be defined");

			// Verify
			assert.equal(view.root, 2);
			assert.equal(view.branchHistory.length, 5);

			// Act
			view.revertTo(revision1);

			// Verify
			assert.equal(view.root, 1);
			assert.equal(view.branchHistory.length, 6);

			// Act
			view.revertTo(revision5);

			// Verify
			assert.equal(view.root, 2);
			assert.equal(view.branchHistory.length, 7);
		});

		it("is a no-op when given the revision of the head commit", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			view.root = 2;
			const revision = view.branchHistory.getHead()?.revision;
			assert(revision !== undefined, "revision should be defined");

			// Act
			view.revertTo(revision);

			// Verify
			assert.equal(view.root, 2);
			assert.equal(view.branchHistory.length, 2);
		});

		it("produces a commit which can be reverted", () => {
			// Setup
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const revision1 = view.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			view.root = 2;
			view.root = 3;

			const revertibles: Revertible[] = [];
			const unsubscribe = view.events.on("changed", (_, getRevertible) => {
				if (getRevertible !== undefined) {
					revertibles.push(getRevertible());
				}
			});

			view.revertTo(revision1);
			unsubscribe();

			assert.equal(view.root, 1);
			assert.equal(revertibles.length, 1);
			assert.equal(view.branchHistory.length, 4);

			// Act
			revertibles[0]?.revert();

			// Verify
			assert.equal(view.root, 3);
			assert.equal(view.branchHistory.length, 5);
		});

		it("throws when the revision is not on the branch", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const view = getView(config);
			view.initialize(1);
			const revision = view.branchHistory.getHead()?.revision;
			assert(revision !== undefined, "revision should be defined");
			const fork = view.fork();
			fork.root = 2;
			const forkRevision = fork.branchHistory.getHead()?.revision;
			assert(forkRevision !== undefined, "revision should be defined");

			assert.throws(
				() => view.revertTo(forkRevision),
				validateUsageError(/No commit found with revision/),
			);
		});

		it("overwrites concurrent changes that are sequenced before it when they affect the same part of the tree", () => {
			// Setup: two clients viewing the same tree.
			const config = new TreeViewConfiguration({ schema: schema.number });
			const provider = new TestTreeProviderLite(2);
			const [treeA, treeB] = provider.trees;
			const viewA = treeA.kernel.viewWith(config);
			const viewB = treeB.kernel.viewWith(config);
			viewA.initialize(1);
			provider.synchronizeMessages();

			const revision1 = viewA.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			viewA.root = 2;
			provider.synchronizeMessages();

			// Consistency check
			assert.equal(viewA.root, 2);
			assert.equal(viewB.root, 2);

			// Act:
			// Client B edits the root, and client A reverts back to revision1.
			// The provider sequences ops in the order of submission, so B's edit is sequenced before A's revert.
			viewB.root = 3;
			viewA.revertTo(revision1);

			// Both clients optimistically see their own change before sequencing.
			assert.equal(viewA.root, 1);
			assert.equal(viewB.root, 3);

			provider.synchronizeMessages();

			// Verify:
			// Because the revert affects the same part of the tree as the concurrent change,
			// and because it is sequenced after it, the revert overwrites the concurrent change.
			assert.equal(viewA.root, 1);
			assert.equal(viewB.root, 1);
		});

		it("does not overwrite concurrent changes that are sequenced before it when they affect a different part of the tree", () => {
			// Setup: two clients viewing the same tree.
			// Unlike the test above, this schema has two independent fields, which allows the
			// concurrent change to target a different part of the tree than the revert does.
			class Pair extends schema.object("Pair", {
				foo: schema.number,
				bar: schema.number,
			}) {}
			const config = new TreeViewConfiguration({ schema: Pair });
			const provider = new TestTreeProviderLite(2);
			const [treeA, treeB] = provider.trees;
			const viewA = treeA.kernel.viewWith(config);
			const viewB = treeB.kernel.viewWith(config);
			viewA.initialize({ foo: 1, bar: 1 });
			provider.synchronizeMessages();

			const revision1 = viewA.branchHistory.getHead()?.revision;
			assert(revision1 !== undefined, "revision should be defined");
			viewA.root.foo = 2;
			provider.synchronizeMessages();

			// Consistency check
			assert.deepEqual([viewA.root.foo, viewA.root.bar], [2, 1]);
			assert.deepEqual([viewB.root.foo, viewB.root.bar], [2, 1]);

			// Act:
			// Client B edits `bar`, and client A reverts back to revision1 (which only affects `foo`).
			// The provider sequences ops in the order of submission, so B's edit is sequenced before A's revert.
			viewB.root.bar = 3;
			viewA.revertTo(revision1);

			// Both clients optimistically see their own change before sequencing.
			assert.deepEqual([viewA.root.foo, viewA.root.bar], [1, 1]);
			assert.deepEqual([viewB.root.foo, viewB.root.bar], [2, 3]);

			provider.synchronizeMessages();

			// Verify:
			// The revert only affects `foo`, so the concurrent change to `bar` is preserved.
			assert.deepEqual([viewA.root.foo, viewA.root.bar], [1, 3]);
			assert.deepEqual([viewB.root.foo, viewB.root.bar], [1, 3]);
		});
	});
});
