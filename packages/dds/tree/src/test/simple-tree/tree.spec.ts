/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	SchemaFactory,
	TreeConfiguration,
	TreeView,
	TreeViewConfiguration,
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
	it("ListRoot", async () => {
		const config = new TreeViewConfiguration({ schema: NodeList });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof NodeList> = await tree.viewWith(config);
		view.initialize(new NodeList(["a", "b"]));
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("Implicit ListRoot", async () => {
		const config = new TreeViewConfiguration({ schema: NodeList });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof NodeList> = await tree.viewWith(config);
		view.initialize(["a", "b"]);
		assert.deepEqual([...view.root], ["a", "b"]);
	});

	it("ObjectRoot - Data", async () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof Canvas> = await tree.viewWith(config);
		view.initialize({ stuff: ["a", "b"] });
	});

	it("ObjectRoot - unhydrated", async () => {
		const config = new TreeViewConfiguration({ schema: Canvas });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof Canvas> = await tree.viewWith(config);
		view.initialize(new Canvas({ stuff: ["a", "b"] }));
	});

	it("Union Root", async () => {
		const config = new TreeViewConfiguration({ schema: [schema.string, schema.number] });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = await tree.viewWith(config);
		view.initialize("a");
		assert.equal(view.root, "a");
	});

	it("optional Root - empty", async () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = await tree.viewWith(config);
		assert.equal(view.root, undefined);
		view.initialize(undefined);
		assert.equal(view.root, undefined);
	});

	it("optional Root - full", async () => {
		const config = new TreeViewConfiguration({ schema: schema.optional(schema.string) });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = await tree.viewWith(config);
		view.initialize("x");
		assert.equal(view.root, "x");
	});

	it("Nested list", async () => {
		const nestedList = schema.array(schema.array(schema.string));
		const config = new TreeViewConfiguration({ schema: nestedList });
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = await tree.viewWith(config);
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
			const config = new TreeConfiguration(schemaWithIdentifier, () => ({
				identifier: undefined,
			}));
			const root = getView(config, nodeKeyManager).root;
			assert.equal(root.identifier, "a110ca7e-add1-4000-8000-000000000000");
		});

		it("populates field when no field defaulter is provided.", () => {
			const schemaWithIdentifier = schema.object("parent", {
				testOptionalField: schema.optional(schema.string),
			});
			const nodeKeyManager = new MockNodeKeyManager();
			const config = new TreeConfiguration(schemaWithIdentifier, () => ({
				testOptionalField: undefined,
			}));
			const root = getView(config, nodeKeyManager).root;
			assert.equal(root.testOptionalField, undefined);
		});
	});
});
