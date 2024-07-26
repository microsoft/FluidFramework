/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";
import { getView, validateUsageError } from "../utils.js";
import { MockNodeKeyManager } from "../../feature-libraries/index.js";
import { Tree } from "../../shared-tree/index.js";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.array("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

const factory = new TreeFactory({});

describe("class-tree tree", () => {
	it("ListRoot", () => {
		const config = new TreeViewConfiguration({ schema: NodeList });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof NodeList> = tree.viewWith(config);
		view.initialize(new NodeList(["a", "b"]));
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("Implicit ListRoot", () => {
		const config = new TreeViewConfiguration({ schema: NodeList });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof NodeList> = tree.viewWith(config);
		view.initialize(["a", "b"]);
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("ObjectRoot - Data", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof Canvas> = tree.viewWith(config);
		view.initialize({ stuff: ["a", "b"] });
	});

	// TODO: AB#9126:
	// This attempts to test the two main cases for validation, initial trees and inserted content.
	// Due to multiple issues, neither actually run the validation.
	// TODO: come up with a way to ensure the validation actually gets run so this test would fail due to not validating things.
	it("default identifier with schema validation", () => {
		class HasId extends schema.object("hasID", { id: schema.identifier }) {}
		const config = new TreeViewConfiguration({ schema: HasId, enableSchemaValidation: true });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
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

	// TODO: AB#9127: fix unhydrated custom identifier Tree.shortId case which blocks this from running.
	it.skip("custom identifier copied from tree", () => {
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

	// TODO: AB#9128: this asserts instead of throwing a usage error.
	it.skip("viewWith twice errors", () => {
		class Empty extends schema.object("Empty", {}) {}
		const config = new TreeViewConfiguration({ schema: Empty });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const view = tree.viewWith(config);
		assert.throws(() => {
			const view2 = tree.viewWith(config);
		}, validateUsageError(/views/));
	});

	it("accessing view.root does not leak LazyEntities", () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
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
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
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
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof Canvas> = tree.viewWith(config);
		view.initialize(new Canvas({ stuff: ["a", "b"] }));
	});

	it("Union Root", () => {
		const config = new TreeViewConfiguration({ schema: [schema.string, schema.number] });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize("a");
		assert.equal(view.root, "a");
	});

	it("optional Root - initialized to undefined", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		// Note: the tree's schema hasn't been initialized at this point, so even though the view schema
		// allows an optional field, explicit initialization must occur.
		assert.throws(() => view.root, /Document is out of schema./);
		view.initialize(undefined);
		assert.equal(view.root, undefined);
	});

	it("optional Root - initializing only schema", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.upgradeSchema();
		assert.equal(view.root, undefined);
	});

	it("optional Root - full", () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize("x");
		assert.equal(view.root, "x");
	});

	it("Nested list", () => {
		const nestedList = schema.array(schema.array(schema.string));
		const config = new TreeViewConfiguration({ schema: nestedList });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize([["a"]]);
		assert.equal(view.root?.length, 1);
		const child = view.root[0];
		assert.equal(child.length, 1);
		const child2 = child[0];
		assert.equal(child2, "a");
	});

	describe("field defaults", () => {
		it("adds identifier to unpopulated identifier fields.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				identifier: schema.identifier,
			});
			const nodeKeyManager = new MockNodeKeyManager();
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config, nodeKeyManager);
			view.initialize({ identifier: undefined });
			assert.equal(view.root.identifier, "a110ca7e-add1-4000-8000-000000000000");
		});

		it("populates field when no field defaulter is provided.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				testOptionalField: schema.optional(schema.string),
			});
			const nodeKeyManager = new MockNodeKeyManager();
			const config = new TreeViewConfiguration({ schema: schemaWithIdentifier });
			const view = getView(config, nodeKeyManager);
			view.initialize({ testOptionalField: undefined });
			assert.equal(view.root.testOptionalField, undefined);
		});
	});
});

describe("object allocation tests", () => {
	it("accessing leaf on object node does not allocate flex nodes", () => {
		class TreeWithLeaves extends schema.object("TreeWithLeaves", { leaf: schema.number }) {}
		const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize({ leaf: 1 });
		const context = view.getView().context;
		// Note: access the root before trying to access just the leaf, to not count any object allocations that result from
		// accessing the root as part of the allocations from the leaf access. Also, store it to avoid additional computation
		// from any intermediate getters when accessing the leaf.
		const root = view.root;
		const countBefore = context.withAnchors.size;
		const _accessLeaf = root.leaf;
		const countAfter = context.withAnchors.size;

		// As of 2024-07-01 we still allocate flex fields when accessing leaves, so the after-count is expected to be one higher
		// than the before count.
		// TODO: if/when we stop allocating flex fields when accessing leaves, this test will fail and should be updated so
		// the two counts match, plus its title updated accordingly.
		assert.equal(countAfter, countBefore + 1);
	});

	it("accessing leaf on map node does not allocate flex nodes", () => {
		class TreeWithLeaves extends schema.map("MapOfLeaves", schema.number) {}
		const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize(new Map([["1", 1]]));
		const context = view.getView().context;
		// Note: access the map that contains leaves before trying to access just the leaf at one of the keys, to not
		// count any object allocations that result from accessing the root/map as part of the allocations from the leaf
		// access. Also, store it to avoid additional computation from any intermediate getters when accessing the leaf.
		const root = view.root;
		const countBefore = context.withAnchors.size;
		const _accessLeaf = root.get("1");
		const countAfter = context.withAnchors.size;

		// As of 2024-07-01 we still allocate flex fields when accessing leaves, so the after-count is expected to be one higher
		// than the before count.
		// TODO: if/when we stop allocating flex fields when accessing leaves, this test will fail and should be updated so
		// the two counts match, plus its title updated accordingly.
		assert.equal(countAfter, countBefore + 1);
	});

	it("accessing leaf on array node does not allocate flex nodes", () => {
		class TreeWithLeaves extends schema.array("ArrayOfLeaves", schema.number) {}
		const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize([1, 2]);
		const context = view.getView().context;
		// Note: prior to taking the "before count", access the array that contains leaves *and the first leaf in it*,
		// to ensure that the sequence field for the array is allocated and accounted for. We expect the sequence field
		// to be required anyway (vs the field for a leaf property on an object node, for example, where we might be able
		// to optimize away its allocation) so might as well count it up front. The subsequent access to the second leaf
		// should then not allocate anything new.
		// Also, store the array/root to avoid additional computation from any intermediate getters when accessing leaves.
		const root = view.root;
		const _accessLeaf0 = root[0];
		const countBefore = context.withAnchors.size;
		const _accessLeaf1 = root[1];
		const countAfter = context.withAnchors.size;

		// The array test is deliberately distinct from the object and map ones, see the comment above for the rationale.
		assert.equal(countAfter, countBefore);
	});
});
