/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { SchemaFactory, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { SharedTree } from "../../../treeFactory.js";
import { getView, validateUsageError } from "../../utils.js";
import { Tree } from "../../../shared-tree/index.js";

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

	// TODO: AB#9126:
	// This attempts to test the two main cases for validation, initial trees and inserted content.
	// Due to multiple issues, neither actually run the validation.
	// TODO: come up with a way to ensure the validation actually gets run so this test would fail due to not validating things.
	it("default identifier with schema validation", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const view = getView(config);
		// TODO: Issues prevent this test from detecting the bug this would otherwise detect.
		// This would error (due to schema validation being done before default is provided, see note on mapTreeFromNodeData),
		// but this issue is not detected since we fail to validate the initial tree due to issue noted in isNodeInSchema ( AB#8197 )
		// (validation is using incorrect schema, which is empty, which we special case to not validate to work around that breaking).
		view.initialize({});
		const idFromInitialize = Tree.shortId(view.root);
		assert(typeof idFromInitialize === "number");

		// toMapTree skips schema validation when creating the unhydrated node since it does not have a context to opt in.
		const newNode = new HasId({});
		// This should validate the inserted content (this test is attempting to check validation is done after defaults are provided).
		// TODO: `isNodeInSchema` is not actually called on this code-path, so no validation is done.
		view.root = newNode;
		const idFromHydration = Tree.shortId(view.root);
		assert(typeof idFromHydration === "number");
		assert(idFromInitialize !== idFromHydration);
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
		const context = view.getView().context;
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
		const context = view.getView().context;
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
			assert.equal(toHydrate.identifier, "beefbeef-beef-4000-8000-000000000004");

			view.root = { identifier: undefined };
			assert.equal(view.root?.identifier, "beefbeef-beef-4000-8000-000000000006");
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
});
