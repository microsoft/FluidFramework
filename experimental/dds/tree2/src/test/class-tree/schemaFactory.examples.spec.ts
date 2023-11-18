/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../class-tree/schemaFactory";
import { ITree, TreeConfiguration, TreeView } from "../../class-tree";
import { Tree } from "../../simple-tree";

// Since this no longer follows the builder pattern its a SchemaFactory instead of a SchemaBuilder.
const schema = new SchemaFactory("com.example");

/**
 * An example schema based type.
 * This doc comment will be visible in intellisense when using referring to the schema (as a runtime value) or the instance type.
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

class NodeMap extends schema.map("Notes", Note) {}
class NodeList extends schema.list("Notes", Note) {}

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

const config = new TreeConfiguration(Canvas, () => new Canvas({ stuff: new NodeList([]) }));

function setup(tree: ITree): Note[] {
	const view: TreeView<Canvas> = tree.schematize(config);
	const stuff = view.root.stuff;
	if (stuff instanceof NodeMap) {
		return f(stuff);
	}
	// Numeric indexing is supported on lists (by the types anyway: implementing it at runtime is a TODO).
	const secondItem = stuff[2];
	// Methods on schema based types can be called as expected.
	secondItem.moveToFront();
	// Access to a schema based field. Intellisense for doc comment and navigate to source just work, as does refactor rename.
	// Thus functionality isn't new, but its nice.
	const s: string = secondItem.text;
	// Lists are iterable:
	const items: Note[] = [...stuff];
	return items;
}
