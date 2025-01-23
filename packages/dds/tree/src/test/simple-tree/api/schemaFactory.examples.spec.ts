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
	customizeSchemaTyping,
	type GetTypes,
	type Customizer,
} from "../../../simple-tree/index.js";
import { TreeFactory } from "../../../treeFactory.js";
import {
	brand,
	type areSafelyAssignable,
	type Brand,
	type requireTrue,
} from "../../../util/index.js";

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
	it("using a mix of insertible content and nodes", () => {
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

	it("customized narrowing", () => {
		class Specific extends schema.object("Specific", {
			s: customizeSchemaTyping(schema.string).simplified<"foo" | "bar">(),
		}) {}
		const parent = new Specific({ s: "bar" });
		// Reading field gives narrowed type
		const s: "foo" | "bar" = parent.s;

		// @ts-expect-error custom typing violation does not build, but runs without error
		const invalid = new Specific({ s: "x" });
	});

	it("customized narrowing - safer", () => {
		const specialString = customizeSchemaTyping(schema.string).custom<{
			input: "foo" | "bar";
			// Assignment can't be made be more restrictive than the read type, but we can choose to disable it.
			readWrite: never;
		}>();
		class Specific extends schema.object("Specific", {
			s: specialString,
		}) {}
		const parent = new Specific({ s: "bar" });
		// Reading gives string
		const s = parent.s;
		type _check = requireTrue<areSafelyAssignable<typeof s, string>>;

		// @ts-expect-error Assigning is disabled;
		parent.s = "x";

		// @ts-expect-error custom typing violation does not build, but runs without error
		const invalid = new Specific({ s: "x" });

		class Array extends schema.array("Specific", specialString) {}

		// Array constructor is also narrowed correctly.
		const a = new Array(["bar"]);
		// Array insertion is narrowed as well.
		a.insertAtEnd("bar");
		// and reading just gives string, since this example choose to do so since other clients could set unexpected strings as its not enforced by schema:
		const s2 = a[0];
		type _check2 = requireTrue<areSafelyAssignable<typeof s2, string>>;
	});

	it("customized branding", () => {
		type SpecialString = Brand<string, "tree.SpecialString">;

		class Specific extends schema.object("Specific", {
			s: customizeSchemaTyping(schema.string).simplified<SpecialString>(),
		}) {}
		const parent = new Specific({ s: brand("bar") });
		const s: SpecialString = parent.s;

		// @ts-expect-error custom typing violation does not build, but runs without error
		const invalid = new Specific({ s: "x" });
	});

	it("relaxed union", () => {
		const runtimeDeterminedSchema = schema.string as
			| typeof schema.string
			| typeof schema.number;
		class Strict extends schema.object("Strict", {
			s: runtimeDeterminedSchema,
		}) {}

		class Relaxed extends schema.object("Relaxed", {
			s: customizeSchemaTyping(runtimeDeterminedSchema).relaxed(),
		}) {}

		class RelaxedArray extends schema.object("Relaxed", {
			s: customizeSchemaTyping([runtimeDeterminedSchema]).relaxed(),
		}) {}

		const customizer = customizeSchemaTyping(runtimeDeterminedSchema);
		{
			const field = customizer.relaxed();
			type Field = typeof field;
			type X = GetTypes<Field>;
		}

		{
			const field = customizeSchemaTyping(runtimeDeterminedSchema).relaxed();
			type Field = typeof field;
			type X = GetTypes<Field>;
		}

		const customizerArray = customizeSchemaTyping([runtimeDeterminedSchema]);
		{
			const field = customizerArray.relaxed();
			type Field = typeof field;
			type X = GetTypes<Field>["input"];
		}

		type XXX = GetTypes<typeof Relaxed.info.s>;

		type F2 = GetTypes<ReturnType<(typeof customizer)["relaxed"]>>;
		type X2 = GetTypes<ReturnType<Customizer<typeof runtimeDeterminedSchema>["relaxed"]>>;

		// @ts-expect-error custom typing violation does not build, but runs without error
		const s = new Strict({ s: "x" });
		// @ts-expect-error custom typing violation does not build, but runs without error
		s.s = "Y";

		const r = new Relaxed({ s: "x" });
		r.s = "Y";
		const ra = new RelaxedArray({ s: "x" });
		ra.s = "Y";

		// @ts-expect-error custom typing violation does not build, but runs without error
		const invalid = new Strict({ s: "x" });
	});
});
