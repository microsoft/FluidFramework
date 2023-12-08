/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	ITree,
	InsertableTreeNodeFromImplicitAllowedTypes,
	SchemaFactoryRecursive,
	TreeConfiguration,
	TreeView,
} from "../../class-tree";
import { TreeFactory } from "../../treeFactory";
import { areSafelyAssignable, disposeSymbol, requireTrue } from "../../util";
import { ListRecursive, MapRecursive } from "./testRecursiveSchema";

describe("Recursive Class based end to end example", () => {
	it("test", () => {
		// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
		const schema = new SchemaFactoryRecursive("com.example");

		const BoxRef = () => Box;
		schema.fixRecursiveReference(BoxRef);

		class Box extends schema.object("Box", {
			/**
			 * Doc comment on a schema based field. Intellisense should work when referencing the field.
			 */
			text: schema.string,
			/**
			 * Example optional field.
			 * Works the same as before.
			 */
			child: schema.optional([BoxRef]),
		}) {}

		const config = new TreeConfiguration(Box, () => new Box({ text: "hi", child: undefined }));

		function setup(tree: ITree) {
			const view: TreeView<Box> = tree.schematize(config);
			const stuff = view.root.child;
		}

		const factory = new TreeFactory({});
		const theTree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		setup(theTree);
	});

	it("lists", () => {
		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		// Explicit constructor call
		{
			const view: TreeView<ListRecursive> = tree.schematize(
				new TreeConfiguration(ListRecursive, () => new ListRecursive({ x: [] })),
			);
			const data = [...view.root];
			assert.deepEqual(data, []);
			view[disposeSymbol]();
		}

		// Nested
		{
			const view: TreeView<ListRecursive> = tree.schematize(
				new TreeConfiguration(
					ListRecursive,
					() => new ListRecursive({ x: [new ListRecursive({ x: [] })] }),
				),
			);
			const data = [...view.root];
			assert.deepEqual(data, []);

			type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof ListRecursive>;
			// @ts-expect-error ListRecursive should not be implicitly constructable (for now).
			const _check: T = [];
			// Only explicitly constructed recursive lists are currently allowed:
			type _check = requireTrue<areSafelyAssignable<T, ListRecursive>>;

			view.root.insertAtEnd(new ListRecursive({ x: [] }));

			view.root[0].insertAtEnd(new ListRecursive({ x: [] }));
		}
	});

	it("maps", () => {
		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const view: TreeView<MapRecursive> = tree.schematize(
			new TreeConfiguration(MapRecursive, () => new MapRecursive(undefined)),
		);
		const data = [...view.root];
		assert.deepEqual(data, []);

		// Nested
		{
			type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof MapRecursive>;
			const _check: T = new MapRecursive(undefined);
			// Only explicitly constructed recursive maps are currently allowed:
			type _check = requireTrue<areSafelyAssignable<T, MapRecursive>>;
		}

		view.root.set("x", new MapRecursive(undefined));

		view.root.get("x")?.set("x", new MapRecursive(undefined));
	});
});
