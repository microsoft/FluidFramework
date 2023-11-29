/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SchemaFactory, TreeConfiguration, TreeView } from "../../class-tree";
import { TreeFactory } from "../../treeFactory";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.list("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

const factory = new TreeFactory({});

describe("class-tree tree", () => {
	it.skip("ListRoot", () => {
		const config = new TreeConfiguration(NodeList, () => new NodeList(["a", "b"]));
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<NodeList> = tree.schematize(config);
	});

	it("ObjectRoot - Data", () => {
		const config = new TreeConfiguration(Canvas, () => ({ stuff: ["a", "b"] }));
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<Canvas> = tree.schematize(config);
	});

	it("ObjectRoot - unhydrated", () => {
		const config = new TreeConfiguration(Canvas, () => new Canvas({ stuff: ["a", "b"] }));
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<Canvas> = tree.schematize(config);
	});

	it("Union Root", () => {
		const config = new TreeConfiguration([schema.string, schema.number], () => "a");
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<number | string> = tree.schematize(config);
		assert.equal(view.root, "a");
	});

	it("optional Root - empty", () => {
		const config = new TreeConfiguration(schema.optional(schema.string), () => undefined);
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<undefined | string> = tree.schematize(config);
		assert.equal(view.root, undefined);
	});

	it("optional Root - full", () => {
		const config = new TreeConfiguration(schema.optional(schema.string), () => "x");
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<undefined | string> = tree.schematize(config);
		assert.equal(view.root, "x");
	});
});
