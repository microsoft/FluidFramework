/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { ITree, SchemaFactoryRecursive, TreeConfiguration, TreeView } from "../../class-tree";
import { TreeFactory } from "../../treeFactory";
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
		}

		// Raw data
		// {
		// 	const view: TreeView<ListRecursive> = tree.schematize(
		// 		new TreeConfiguration(ListRecursive,() => new ListRecursive({ x: [new ListRecursive({ x: [] })] }))),
		// 	);
		// 	const data = [...view.root];
		// 	assert.deepEqual(data, []);

		// 	type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof ListRecursive>;
		// 	// const _check: T = [];

		// 	// view.root[5][5][5][5].insertAtEnd([[], [[]]]);
		// }
	});

	// it("maps", () => {
	// 	const factory = new TreeFactory({});
	// 	const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

	// 	// Explicit constructor call
	// 	{
	// 		const x2: RecursiveMap2 = RecursiveMap2.create(new Map());
	// 		const x: RecursiveMap2 = new RecursiveMap2();
	// 		type X = NodeFromSchema<typeof RecursiveMap2>;
	// 		type _check1 = requireAssignableTo<typeof RecursiveMap2, TreeNodeSchema>;
	// 		type _check2 = requireAssignableTo<X, RecursiveMap2>;
	// 		const view: TreeView<RecursiveMap2> = tree.schematize(
	// 			new TreeConfiguration(RecursiveMap2, () => new RecursiveMap2(1 as any)),
	// 		);
	// 		const data = view.root;
	// 		assert.deepEqual(data, []);
	// 	}

	// 	// Explicit create call
	// 	// {
	// 	// 	const view: TreeView<RecursiveMap2> = tree.schematize(
	// 	// 		new TreeConfiguration(RecursiveMap2, () => RecursiveMap2.create(new Map())),
	// 	// 	);
	// 	// 	const data = [...view.root];
	// 	// 	assert.deepEqual(data, []);
	// 	// }

	// 	// Raw data
	// 	{
	// 		const view: TreeView<RecursiveMap2> = tree.schematize(
	// 			new TreeConfiguration(RecursiveMap2, () => new Map()),
	// 		);
	// 		const data = view.root;
	// 		assert.deepEqual(data, []);
	// 	}
	// });

	// it("maps", () => {
	// 	const factory = new TreeFactory({});
	// 	const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

	// 	// Explicit constructor call
	// 	{
	// 		const x2: MapRecursive = new MapRecursive();
	// 		// const x: RecursiveMap2 = new RecursiveMap2();
	// 		// type X = NodeFromSchema<typeof RecursiveMap2>;
	// 		// type _check1 = requireAssignableTo<typeof RecursiveMap2, TreeNodeSchema>;
	// 		// type _check2 = requireAssignableTo<X, RecursiveMap2>;
	// 		const view: TreeView<MapRecursive> = tree.schematize(
	// 			new TreeConfiguration(MapRecursive, () => new MapRecursive()),
	// 		);
	// 		const data = view.root;
	// 		assert.deepEqual(data, []);
	// 	}

	// 	// Explicit create call
	// 	// {
	// 	// 	const view: TreeView<RecursiveMap2> = tree.schematize(
	// 	// 		new TreeConfiguration(RecursiveMap2, () => RecursiveMap2.create(new Map())),
	// 	// 	);
	// 	// 	const data = [...view.root];
	// 	// 	assert.deepEqual(data, []);
	// 	// }

	// 	// Raw data
	// 	{
	// 		const view: TreeView<MapRecursive> = tree.schematize(
	// 			new TreeConfiguration(MapRecursive, () => new Map()),
	// 		);
	// 		const data = view.root;
	// 		assert.deepEqual(data, []);
	// 	}
	// });
});
