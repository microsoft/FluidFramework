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
import { getView } from "../utils.js";
import { MockNodeKeyManager } from "../../feature-libraries/index.js";

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

	// TODO: AB#8575 re-enable this test once leaf access on arrays does not allocate flex nodes
	it.skip("accessing leaf on array node does not allocate flex nodes", () => {
		class TreeWithLeaves extends schema.array("ArrayOfLeaves", schema.number) {}
		const config = new TreeViewConfiguration({ schema: TreeWithLeaves });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize([1]);
		const context = view.getView().context;
		// Note: access the array that contains leaves before trying to access just the leaf at one of its indices, to not
		// count any object allocations that result from accessing the root/array as part of the allocations from the leaf
		// access. Also, store it to avoid additional computation from any intermediat getters when accessing the leaf.
		const root = view.root;
		const countBefore = context.withAnchors.size;
		const _accessLeaf = root[0];
		const countAfter = context.withAnchors.size;

		// As of 2024-07-01 we still allocate flex fields when accessing leaves, so the after-count is expected to be one higher
		// than the before count.
		// TODO: if/when we stop allocating flex fields when accessing leaves, this test will fail and should be updated so
		// the two counts match, plus its title updated accordingly.
		assert.equal(countAfter, countBefore + 1);
	});
});
