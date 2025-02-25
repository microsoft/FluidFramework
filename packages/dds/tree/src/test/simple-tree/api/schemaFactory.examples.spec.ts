/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	type ITree,
	SchemaFactory,
	treeNodeApi as Tree,
	TreeViewConfiguration,
	type TreeView,
} from "../../../simple-tree/index.js";
import { TreeFactory } from "../../../treeFactory.js";

// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
const schema = new SchemaFactory("com.example");

/**
 * An example schema based type.
 * This doc comment will be visible in intellisense when referring to the schema (as a runtime value) or the instance type.
 */
class Point extends schema.object("Point", {
	x: schema.number,
	y: schema.number,
}) {}

class Note extends schema.object("Note", {
	/**
	 * Doc comment on a schema based field. Intellisense should work when referencing the field.
	 */
	text: schema.string,
	/**
	 * Example optional field.
	 * Works the same as before.
	 */
	location: schema.optional(Point),
}) {
	// Schema based classes can have methods and extra session local properties.
	// We don't have to recommend this as a design pattern, but it does just work.
	public isSelected: boolean = false;

	// Methods also work, and can access the tree APIs as normal:
	public moveToFront(): void {
		const parent = Tree.parent(this);
		// instanceof just works: nothing special to learn for either JS or TS narrowing of unions.
		if (parent instanceof NodeList) {
			const key = Tree.key(this);
			assert(typeof key === "number");
			parent.moveToEnd(key);
		}
	}
}

class NodeMap extends schema.map("NoteMap", Note) {}
class NodeList extends schema.array("NoteList", Note) {}

// Example function working on some schema based types.
// Note that there is no need to use Typed<typeof NodeMap> anymore (either inline or as a separate type declaration).
function f(n: NodeMap): Note[] {
	// These schema based types can have methods provided based on their node kind. In this case maps have `get`.
	// The type returned from `get` is `Note | undefined`, and shows that way in the intellisense:
	// It does not show some complex type expression equivalent to that which is a big improvement over the previous setup.
	const item: Note | undefined = n.get("x");
	return item === undefined ? [] : [item];
}

class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

const config = new TreeViewConfiguration({ schema: Canvas });

function setup(tree: ITree): Note[] {
	const view: TreeView<typeof Canvas> = tree.viewWith(config);
	view.initialize(
		new Canvas({
			stuff: new NodeList([
				{ text: "a", location: undefined },
				new Note({ text: "b", location: undefined }),
			]),
		}),
	);
	const stuff = view.root.stuff;
	if (stuff instanceof NodeMap) {
		return f(stuff);
	}
	// Numeric indexing is supported on lists:
	const secondItem = stuff[1];
	// Methods on schema based types can be called as expected.
	secondItem.moveToFront();
	// Access to a schema based field. Intellisense for doc comment and navigate to source just work, as does refactor rename.
	// Thus functionality isn't new, but its nice.
	const s: string = secondItem.text;
	// Lists are iterable:
	const items: Note[] = [...stuff];
	return items;
}

describe("Class based end to end example", () => {
	it("run example", () => {
		const factory = new TreeFactory({});
		const theTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		setup(theTree);
	});

	// Confirm that the alternative syntax for initialTree from the example above actually works.
	it("using a mix of insertable content and nodes", () => {
		const factory = new TreeFactory({});
		const theTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view: TreeView<typeof Canvas> = theTree.viewWith(config);
		view.initialize(
			new Canvas({
				stuff: [
					// Trees of insertable data can mix inline insertable content and unhydrated nodes:
					{ text: "a", location: undefined },
					new Note({ text: "b", location: undefined }),
				],
			}),
		);
	});
});
