/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { TreeConfiguration, TreeView } from "../../class-tree";
import {
	SchemaFactory,
	TreeFieldFromImplicitField,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../class-tree/schemaFactory";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../util";
import { TreeFactory } from "../../treeFactory";

{
	const schema = new SchemaFactory("Blah");

	class Note extends schema.object("Note", { text: schema.string }) {}

	class NodeMap extends schema.map("Notes", Note) {}
	class NodeList extends schema.list("Notes", Note) {}

	// eslint-disable-next-line no-inner-declarations
	function f(n: NodeMap): void {
		const item = n.get("x");
	}

	// Leaf stuff
	{
		const x = schema.string;
		type _check = requireAssignableTo<typeof schema.string, TreeNodeSchema>;
	}

	// TreeNodeFromImplicitAllowedTypes
	{
		type _check = requireAssignableTo<typeof Note, TreeNodeSchema>;
		type Test = TreeNodeFromImplicitAllowedTypes<typeof Note>;
		type Instance = InstanceType<typeof Note>;
		type _check2 = requireTrue<areSafelyAssignable<Test, Note>>;

		type _check3 = requireTrue<
			areSafelyAssignable<TreeNodeFromImplicitAllowedTypes<[typeof Note]>, Note>
		>;
		type _check4 = requireTrue<
			areSafelyAssignable<TreeNodeFromImplicitAllowedTypes<[() => typeof Note]>, Note>
		>;

		type FromArray = TreeNodeFromImplicitAllowedTypes<[typeof Note, typeof Note]>;
		type _check5 = requireTrue<areSafelyAssignable<FromArray, Note>>;
	}

	// TreeFieldFromImplicitField
	{
		type _check = requireAssignableTo<typeof Note, TreeNodeSchema>;
		type Test = TreeFieldFromImplicitField<typeof Note>;
		type Instance = InstanceType<typeof Note>;
		type _check2 = requireTrue<areSafelyAssignable<Test, Note>>;

		type _check3 = requireTrue<
			areSafelyAssignable<TreeFieldFromImplicitField<[typeof Note]>, Note>
		>;
		type _check4 = requireTrue<
			areSafelyAssignable<TreeFieldFromImplicitField<[() => typeof Note]>, Note>
		>;

		type FromArray = TreeFieldFromImplicitField<[typeof Note, typeof Note]>;
		type _check5 = requireTrue<areSafelyAssignable<FromArray, Note>>;
	}
}

describe("schemaFactory", () => {
	it("test", () => {
		const schema = new SchemaFactory("com.example");

		class Point extends schema.object("Point", {
			x: schema.number,
			y: schema.number,
		}) {}

		class Note extends schema.object("Note", {
			text: schema.string,
			location: schema.optional(Point),
		}) {}

		class NodeMap extends schema.map("NoteMap", Note) {}
		class NodeList extends schema.list("NoteList", Note) {}

		class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

		const config = new TreeConfiguration(
			Canvas,
			() =>
				new Canvas({
					stuff: new NodeList([new Note({ text: "hi", location: undefined })]),
				}),
		);

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<Canvas> = tree.schematize(config);
		const stuff = view.root.stuff;
		assert(stuff instanceof NodeList);
		const item = stuff[1];
		const s: string = item.text;
		assert.equal(s, "hi");
	});

	it("objects only", () => {
		const schema = new SchemaFactory("com.example");
		class Point extends schema.object("Point", {
			x: schema.number,
			y: schema.number,
		}) {}

		const config = new TreeConfiguration(Point, () => new Point({ x: 1, y: 2 }));

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view = tree.schematize(config);
		assert.equal(view.root.x, 1);
		assert.equal(view.root.y, 2);
	});
});
