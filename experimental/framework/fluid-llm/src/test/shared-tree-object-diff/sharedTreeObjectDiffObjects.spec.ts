import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeObjectDiff } from "../../shared-tree-object-diff/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");


describe("sharedTreeObjectDiff - Object - Change Diffs", () => {
	class TestObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
		attribute1: schemaFactory.boolean,
		requiredBoolean: schemaFactory.boolean,
		requiredString:  schemaFactory.string,
		requiredNumber:  schemaFactory.number,
	}) {}


	it("change required string primitive value", () => {
		const treeNode = new TestObjectTreeNode({
			attribute1: true,
			requiredBoolean: true,
			requiredString: "test",
			requiredNumber: 0
		});

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				attribute1: true,
				requiredBoolean: false,
				requiredString: "true",
				requiredNumber: 0
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredString"],
					oldValue: 'test',
					value: 'true',
				},
			]
		);
	});

	it("change required boolean primitive value", () => {
		const treeNode = new TestObjectTreeNode({
			attribute1: true,
			requiredBoolean: true,
			requiredString: "test",
			requiredNumber: 0
		});

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				attribute1: true,
				requiredBoolean: false,
				requiredString: "test",
				requiredNumber: 0
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredBoolean"],
					oldValue: true,
					value: false,
				},
			]
		);
	});

	it("change required number primitive value", () => {
		const treeNode = new TestObjectTreeNode({
			attribute1: true,
			requiredBoolean: true,
			requiredString: "test",
			requiredNumber: 0
		});

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				attribute1: true,
				requiredBoolean: true,
				requiredString: "test",
				requiredNumber: 1
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredNumber"],
					oldValue: 0,
					value: 1,
				},
			]
		);
	});

});

	// it("change required primitive value", () => {
	// 	class TestObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
	// 		attribute1: schemaFactory.boolean,
	// 		requiredBoolean: schemaFactory.boolean,
	// 		requiredString:  schemaFactory.string,
	// 		requiredNumber:  schemaFactory.number,
	// 	}) {}

	// 	const treeNode = new TestObjectTreeNode({
	// 		attribute1: true,
	// 		requiredBoolean: true,
	// 		requiredString: "test",
	// 		requiredNumber: 0
	// 	});


	// 	assert.deepStrictEqual(
	// 		sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
	// 			attribute1: true,
	// 			requiredBoolean: false,
	// 			requiredString: "test",
	// 			requiredNumber: 0
	// 		}),
	// 		[
	// 			{
	// 				type: "CHANGE",
	// 				path: ["requiredBoolean"],
	// 				oldValue: true,
	// 				value: false,
	// 			},
	// 		]
	// 	);

	// 	assert.deepStrictEqual(
	// 		sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
	// 			attribute1: true,
	// 			requiredBoolean: false,
	// 			requiredString: "true",
	// 			requiredNumber: 0
	// 		}),
	// 		[
	// 			{
	// 				type: "CHANGE",
	// 				path: ["requiredString"],
	// 				oldValue: 'test',
	// 				value: 'true',
	// 			},
	// 		]
	// 	);

	// 	assert.deepStrictEqual(
	// 		sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
	// 			attribute1: true,
	// 			requiredBoolean: true,
	// 			requiredString: "test",
	// 			requiredNumber: 1
	// 		}),
	// 		[
	// 			{
	// 				type: "CHANGE",
	// 				path: ["requiredNumber"],
	// 				oldValue: 0,
	// 				value: 1,
	// 			},
	// 		]
	// 	);
	// });



describe("sharedTreeObjectDiff - Objects", () => {
	// class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
	// 	test: schemaFactory.boolean,
	// }) {}
	class SimpleMapTreeNode extends schemaFactory.map("SimpleMapTreeNode", [
		schemaFactory.boolean,
	]) {}



	it("new optional primitve value", () => {
		class TestObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
			attribute1: schemaFactory.boolean,
			optionalBoolean: schemaFactory.optional(schemaFactory.boolean),
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalNumber: schemaFactory.optional(schemaFactory.number),
		}) {}

		const treeNode = new TestObjectTreeNode({ attribute1: true });

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				test: true,
				optionalBoolean: true,
			}),
			[
				{
					type: "CREATE",
					path: ["optionalBoolean"],
					value: true,
				},
			]
		);

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				test: true,
				optionalString: true,
			}),
			[
				{
					type: "CREATE",
					path: ["optionalString"],
					value: true,
				},
			]
		);

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				test: true,
				optionalNumber: 0,
			}),
			[
				{
					type: "CREATE",
					path: ["optionalNumber"],
					value: 0,
				},
			]
		);
	});

	it("change required primitive value", () => {
		class TestObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
			attribute1: schemaFactory.boolean,
			requiredBoolean: schemaFactory.boolean,
			requiredString:  schemaFactory.string,
			requiredNumber:  schemaFactory.number,
		}) {}

		const treeNode = new TestObjectTreeNode({
			attribute1: true,
			requiredBoolean: true,
			requiredString: "test",
			requiredNumber: 0
		});


		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				attribute1: true,
				requiredBoolean: false,
				requiredString: "test",
				requiredNumber: 0
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredBoolean"],
					oldValue: true,
					value: false,
				},
			]
		);

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				attribute1: true,
				requiredBoolean: false,
				requiredString: "true",
				requiredNumber: 0
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredString"],
					oldValue: 'test',
					value: 'true',
				},
			]
		);

		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				attribute1: true,
				requiredBoolean: true,
				requiredString: "test",
				requiredNumber: 1
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredNumber"],
					oldValue: 0,
					value: 1,
				},
			]
		);
	});




	// it("change raw value", () => {
	// 	const treeNode = new SimpleObjectTreeNode({ test: true });
	// 	assert.deepStrictEqual(
	// 		sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, { test: false }),
	// 		[
	// 			{
	// 				type: "CHANGE",
	// 				path: ["test"],
	// 				value: false,
	// 				oldValue: true,
	// 			},
	// 		],
	// 	);
	// });

	// it("remove raw value", () => {
	// 	const treeMapNode = new SimpleMapTreeNode({ test: true, test2: true });
	// 	const diffs = sharedTreeObjectDiff(treeMapNode as unknown as Record<string, unknown>, {
	// 		test: true,
	// 	});
	// 	assert.deepStrictEqual(diffs, [
	// 		{
	// 			type: "REMOVE",
	// 			path: ["test2"],
	// 			oldValue: true,
	// 		},
	// 	]);
	// });

	// it("replace object with null", () => {
	// 	class SimpleObjectTreeNode2 extends schemaFactory.map("SimpleMapTreeNode2", [
	// 		SimpleObjectTreeNode,
	// 		schemaFactory.null,
	// 	]) {}
	// 	const innerTreeNode = new SimpleObjectTreeNode({ test: true });
	// 	const treeNode = new SimpleObjectTreeNode2({ object: innerTreeNode });
	// 	const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
	// 		object: null,
	// 	});
	// 	assert.deepStrictEqual(diffs, [
	// 		{
	// 			type: "CHANGE",
	// 			path: ["object"],
	// 			value: null,
	// 			oldValue: innerTreeNode,
	// 		},
	// 	]);
	// });

	// it("replace object with other value", () => {
	// 	class SimpleObjectTreeNode2 extends schemaFactory.map("SimpleMapTreeNode2", [
	// 		SimpleObjectTreeNode,
	// 		schemaFactory.string,
	// 	]) {}
	// 	const innerTreeNode = new SimpleObjectTreeNode({ test: true });
	// 	const treeNode = new SimpleObjectTreeNode2({ object: innerTreeNode });
	// 	const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
	// 		object: "string",
	// 	});
	// 	assert.deepStrictEqual(diffs, [
	// 		{
	// 			type: "CHANGE",
	// 			path: ["object"],
	// 			value: "string",
	// 			oldValue: innerTreeNode,
	// 		},
	// 	]);
	// });
});
