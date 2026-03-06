/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
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
} from "../../../simple-tree/index.js";
import { SharedTree } from "../../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";
import { getView } from "../../utils.js";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.array("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

const factory = SharedTree.getFactory();

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
			assert.throws(() => view.initialize({}), validateUsageError(/Field_NodeTypeNotAllowed/));
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
				validateUsageError(/Field_NodeTypeNotAllowed/),
			);
		});
	});

	it("custom identifier copied from tree", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const treeSrc = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const view = treeSrc.viewWith(config);
		view.initialize({});
		const idFromInitialize = Tree.shortId(view.root);
		assert(typeof idFromInitialize === "number");

		const treeDst = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

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
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

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
		assert.throws(() => view.root, /Document is out of schema./);
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

		it("can be applied to a view with a different session", () => {
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

			assert(change !== undefined);
			viewB.applyChange(change);
			assert.equal(viewB.root, 4);
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

		it("applying the same change twice is not idempotent", () => {
			const sf = new SchemaFactory("test");
			class List extends sf.array("List", sf.number) {}
			const config = new TreeViewConfiguration({ schema: List });
			const viewA = getView(config);
			viewA.initialize([1, 2, 3]);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			// Insert a node on viewB
			viewB.root.insertAtEnd(4);
			assert(change !== undefined);

			// Apply the same serialized change twice to viewA
			viewA.applyChange(change);
			viewA.applyChange(change);

			// Each application should produce a distinct effect - the node is inserted twice
			assert.deepEqual([...viewA.root], [1, 2, 3, 4, 4]);
		});

		it("non-transaction change can be applied inside a transaction", () => {
			const config = new TreeViewConfiguration({ schema: schema.number });
			const viewA = getView(config);
			viewA.initialize(3);
			const viewB = viewA.fork();

			let change: JsonCompatibleReadOnly | undefined;
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				change = metadata.getChange();
			});

			// Make a non-transaction change on viewB
			viewB.root = 4;
			assert(change !== undefined);

			// Apply that non-transaction change inside a transaction on viewA
			const capturedChange = change;
			viewA.runTransaction(() => {
				viewA.applyChange(capturedChange);
			});
			assert.equal(viewA.root, 4);
		});

		it("multiple non-transaction changes can be applied together in a transaction", () => {
			const sf = new SchemaFactory("test");
			class List extends sf.array("List", sf.number) {}
			const config = new TreeViewConfiguration({ schema: List });
			const viewA = getView(config);
			viewA.initialize([1, 2, 3]);
			const viewB = viewA.fork();

			const changes: JsonCompatibleReadOnly[] = [];
			viewB.events.on("changed", (metadata) => {
				assert(metadata.isLocal);
				changes.push(metadata.getChange());
			});

			// Make two separate non-transaction changes on viewB
			viewB.root.insertAtEnd(4);
			viewB.root.insertAtEnd(5);
			assert.equal(changes.length, 2);

			// Apply both non-transaction changes together inside a single transaction on viewA
			viewA.runTransaction(() => {
				viewA.applyChange(changes[0]);
				viewA.applyChange(changes[1]);
			});
			assert.deepEqual([...viewA.root], [1, 2, 3, 4, 5]);
		});

		it("applied change is rolled back when transaction is aborted", () => {
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

			const capturedChange = change;
			Tree.runTransaction(viewA, () => {
				viewA.applyChange(capturedChange);
				assert.equal(viewA.root, 4);
				return Tree.runTransaction.rollback;
			});
			// The serialized change should be rolled back along with the transaction
			assert.equal(viewA.root, 3);
		});

		it("can apply a change with an identifier field build to a view with a different id compressor", () => {
			const sf = new SchemaFactory("test");
			class HasId extends sf.object("HasId", { id: sf.identifier }) {}
			const config = new TreeViewConfiguration({
				schema: SchemaFactory.optional(HasId),
			});

			// Two independent views get different id compressors with different sessions
			const viewA = getView(config);
			viewA.initialize(undefined);
			const viewB = getView(config);
			viewB.initialize(undefined);

			let change: JsonCompatibleReadOnly | undefined;
			viewA.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					change = metadata.getChange();
				}
			});

			// Insert a node with a default identifier on viewA
			viewA.root = new HasId({ id: undefined });
			assert(change !== undefined);
			const identifierOnA = viewA.root.id;

			// Apply the serialized change to viewB (different compressor instance and session)
			viewB.applyChange(change);
			assert(viewB.root !== undefined);
			assert.equal(viewB.root.id, identifierOnA);
		});

		it("each application gets a unique revision", () => {
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

			// Track the changes applied to viewA
			const appliedChanges: JsonCompatibleReadOnly[] = [];
			viewA.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					appliedChanges.push(metadata.getChange());
				}
			});

			viewA.applyChange(change);
			viewA.applyChange(change);

			// Each application should produce a separate change event
			assert.equal(appliedChanges.length, 2);
		});
	});
});
