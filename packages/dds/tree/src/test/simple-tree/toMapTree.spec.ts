/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	MockHandle,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import { deepCopyMapTree, EmptyKey, type FieldKey, type MapTree } from "../../core/index.js";
import {
	booleanSchema,
	getTreeNodeForField,
	handleSchema,
	nullSchema,
	numberSchema,
	SchemaFactory,
	stringSchema,
	type TreeNodeSchema,
	type ValidateRecursiveSchema,
	getKernel,
} from "../../simple-tree/index.js";
import {
	createFieldSchema,
	FieldKind,
	getDefaultProvider,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";
import {
	getPossibleTypes,
	mapTreeFromNodeData,
	type InsertableContent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/toMapTree.js";
import { brand } from "../../util/index.js";
import {
	MockNodeIdentifierManager,
	type FlexTreeHydratedContextMinimal,
} from "../../feature-libraries/index.js";
import { validateUsageError } from "../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { UnhydratedFlexTreeNode } from "../../simple-tree/core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getUnhydratedContext } from "../../simple-tree/createContext.js";
// eslint-disable-next-line import/no-internal-modules
import { prepareContentForHydration } from "../../simple-tree/prepareForInsertion.js";
import { hydrate } from "./utils.js";

describe("toMapTree", () => {
	it("string", () => {
		const schemaFactory = new SchemaFactory("test");
		const tree = "Hello world";

		const actual = mapTreeFromNodeData(tree, [schemaFactory.string]);

		const expected: MapTree = {
			type: brand(stringSchema.identifier),
			value: "Hello world",
			fields: new Map(),
		};

		assert.deepEqual(deepCopyMapTree(actual), expected);
	});

	it("null", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.null;

		const actual = mapTreeFromNodeData(null, [schema]);

		const expected: MapTree = {
			type: brand(nullSchema.identifier),
			value: null,
			fields: new Map(),
		};

		assert.deepEqual(deepCopyMapTree(actual), expected);
	});

	it("handle", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.handle;

		const tree = new MockHandle<string>("mock-fluid-handle");

		const actual = mapTreeFromNodeData(tree, [schema]);

		const expected: MapTree = {
			type: brand(schemaFactory.handle.identifier),
			value: tree,
			fields: new Map(),
		};

		assert.deepEqual(deepCopyMapTree(actual), expected);
	});

	it("recursive", () => {
		const schemaFactory = new SchemaFactory("test");
		class Foo extends schemaFactory.objectRecursive("Foo", {
			x: schemaFactory.optionalRecursive([() => Bar]),
		}) {}
		type _checkFoo = ValidateRecursiveSchema<typeof Foo>;
		class Bar extends schemaFactory.objectRecursive("Bar", {
			y: schemaFactory.optionalRecursive(Foo),
		}) {}
		type _checkBar = ValidateRecursiveSchema<typeof Bar>;

		const actual = mapTreeFromNodeData(
			{
				x: {
					y: {
						x: undefined,
					},
				},
			},
			Foo,
		);

		const expected: MapTree = {
			type: brand(Foo.identifier),
			fields: new Map<FieldKey, MapTree[]>([
				[
					brand("x"),
					[
						{
							type: brand(Bar.identifier),
							fields: new Map<FieldKey, MapTree[]>([
								[
									brand("y"),
									[
										{
											type: brand(Foo.identifier),
											fields: new Map(),
										},
									],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(deepCopyMapTree(actual), expected);
	});

	it("Fails when referenced schema has not yet been instantiated", () => {
		const schemaFactory = new SchemaFactory("test");

		let Bar: TreeNodeSchema;
		class Foo extends schemaFactory.objectRecursive("Foo", {
			x: schemaFactory.optionalRecursive([() => Bar]),
		}) {}
		type _checkFoo = ValidateRecursiveSchema<typeof Foo>;

		const tree = {
			x: {
				y: "Hello world!",
			},
		};

		assert.throws(
			() => mapTreeFromNodeData(tree, Foo),
			(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
		);
	});

	it("Fails when data is incompatible with schema", () => {
		const schemaFactory = new SchemaFactory("test");

		assert.throws(
			() => mapTreeFromNodeData("Hello world", [schemaFactory.number]),
			(error: Error) =>
				validateAssertionError(
					error,
					/The provided data is incompatible with all of the types allowed by the schema/,
				),
		);
	});

	describe("array", () => {
		it("Empty", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array("array", schemaFactory.number);

			const tree: number[] = [];

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Simple array", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array("array", [
				schemaFactory.number,
				schemaFactory.handle,
			]);

			const handle = new MockHandle<boolean>(true);
			const tree = [42, handle, 37];

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						EmptyKey,
						[
							{
								type: brand(numberSchema.identifier),
								value: 42,
								fields: new Map(),
							},
							{
								type: brand(handleSchema.identifier),
								value: handle,
								fields: new Map(),
							},
							{
								type: brand(numberSchema.identifier),
								value: 37,
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Complex array", () => {
			const schemaFactory = new SchemaFactory("test");
			const childObjectSchema = schemaFactory.object("child-object", {
				name: schemaFactory.string,
				age: schemaFactory.number,
			});
			const schema = schemaFactory.array("array", [
				schemaFactory.number,
				schemaFactory.handle,
				childObjectSchema,
			]);

			const handle = new MockHandle<boolean>(true);
			const tree = [42, handle, { age: 37, name: "Jack" }];

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						EmptyKey,
						[
							{
								type: brand(numberSchema.identifier),
								value: 42,
								fields: new Map(),
							},
							{
								type: brand(handleSchema.identifier),
								value: handle,
								fields: new Map(),
							},
							{
								type: brand(childObjectSchema.identifier),
								fields: new Map<FieldKey, MapTree[]>([
									[
										brand("name"),
										[
											{
												type: brand(stringSchema.identifier),
												value: "Jack",
												fields: new Map(),
											},
										],
									],
									[
										brand("age"),
										[
											{
												type: brand(numberSchema.identifier),
												value: 37,
												fields: new Map(),
											},
										],
									],
								]),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Recursive array", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.arrayRecursive("array", [
				schemaFactory.number,
				() => schema,
			]);

			const tree = [42, [1, 2], 37];

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						EmptyKey,
						[
							{
								type: brand(numberSchema.identifier),
								value: 42,
								fields: new Map(),
							},
							{
								type: brand("test.array"),
								fields: new Map<FieldKey, MapTree[]>([
									[
										EmptyKey,
										[
											{
												type: brand(numberSchema.identifier),
												value: 1,
												fields: new Map(),
											},
											{
												type: brand(numberSchema.identifier),
												value: 2,
												fields: new Map(),
											},
										],
									],
								]),
							},
							{
								type: brand(numberSchema.identifier),
								value: 37,
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Throws on `undefined` entries when null is not allowed", () => {
			const schemaFactory = new SchemaFactory("test");
			assert.throws(
				() =>
					mapTreeFromNodeData(
						[42, undefined] as number[],
						schemaFactory.array(schemaFactory.number),
					),
				/Received unsupported array entry value: undefined/,
			);
		});

		it("Throws on schema-incompatible entries", () => {
			const schemaFactory = new SchemaFactory("test");

			assert.throws(
				() =>
					mapTreeFromNodeData(
						["Hello world", true],
						schemaFactory.array(schemaFactory.string),
					),
				/The provided data is incompatible with all of the types allowed by the schema/,
			);
		});
	});

	describe("map", () => {
		it("Empty map", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.map("map", [schemaFactory.number]);

			const tree = new Map<string, number>();

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Simple map", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.map("map", [schemaFactory.number, schemaFactory.string]);

			const entries: [string, InsertableContent][] = [
				["a", 42],
				["b", "Hello world"],
				["c", 37],
			];
			const tree = new Map<string, InsertableContent>(entries);

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
					],
					[
						brand("b"),
						[
							{
								type: brand(stringSchema.identifier),
								value: "Hello world",
								fields: new Map(),
							},
						],
					],
					[
						brand("c"),
						[{ type: brand(numberSchema.identifier), value: 37, fields: new Map() }],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Complex Map", () => {
			const schemaFactory = new SchemaFactory("test");
			const childObjectSchema = schemaFactory.object("child-object", {
				name: schemaFactory.string,
				age: schemaFactory.number,
			});
			const schema = schemaFactory.map("map", [
				childObjectSchema,
				schemaFactory.number,
				schemaFactory.string,
				schemaFactory.null,
			]);

			const entries: [string, InsertableContent][] = [
				["a", 42],
				["b", "Hello world"],
				["c", null],
				["d", { age: 37, name: "Jill" }],
			];
			const tree = new Map<string, InsertableContent>(entries);

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
					],
					[
						brand("b"),
						[
							{
								type: brand(stringSchema.identifier),
								value: "Hello world",
								fields: new Map(),
							},
						],
					],
					[
						brand("c"),
						[{ type: brand(nullSchema.identifier), value: null, fields: new Map() }],
					],
					[
						brand("d"),
						[
							{
								type: brand(childObjectSchema.identifier),
								fields: new Map([
									[
										brand("name"),
										[
											{
												type: brand(stringSchema.identifier),
												value: "Jill",
												fields: new Map(),
											},
										],
									],
									[
										brand("age"),
										[
											{
												type: brand(numberSchema.identifier),
												value: 37,
												fields: new Map(),
											},
										],
									],
								]),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Undefined map entries are omitted", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.map("map", [schemaFactory.number]);

			const entries: [string, InsertableContent][] = [
				["a", 42],
				["b", undefined as unknown as InsertableContent], // Should be skipped in output
				["c", 37],
			];
			const tree = new Map<string, InsertableContent>(entries);

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
					],
					[
						brand("c"),
						[{ type: brand(numberSchema.identifier), value: 37, fields: new Map() }],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Throws on schema-incompatible entries", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.map("map", schemaFactory.string);

			const entries: [string, InsertableContent][] = [
				["a", "Hello world"],
				["b", true], // Boolean input is not allowed by the schema
			];
			const tree = new Map<string, InsertableContent>(entries);

			assert.throws(
				() => mapTreeFromNodeData(tree, schema),
				/The provided data is incompatible with all of the types allowed by the schema/,
			);
		});

		it("Throws for structurally valid data, but created with a different schema.", () => {
			const schemaFactory = new SchemaFactory("test");
			class TestSchema extends schemaFactory.object("testObject", {
				field: schemaFactory.string,
			}) {}

			class TestSchema2 extends schemaFactory.object("testObject", {
				field: schemaFactory.string,
			}) {}

			const testData = new TestSchema2({ field: "test" });

			assert.throws(
				() => mapTreeFromNodeData(testData, TestSchema),
				validateUsageError("Invalid schema for this context."),
			);
		});
	});

	describe("object", () => {
		it("Empty object", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.optional(schemaFactory.number),
			});

			const tree = {};

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Simple object", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.string,
				b: schemaFactory.optional(schemaFactory.number),
				c: schemaFactory.boolean,
			});

			const tree = {
				a: "Hello world",
				b: 42,
				c: false,
			};

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[
							{
								type: brand(stringSchema.identifier),
								value: "Hello world",
								fields: new Map(),
							},
						],
					],
					[
						brand("b"),
						[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
					],
					[
						brand("c"),
						[{ type: brand(booleanSchema.identifier), value: false, fields: new Map() }],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Complex object", () => {
			const schemaFactory = new SchemaFactory("test");
			const childSchema = schemaFactory.object("child-object", {
				foo: schemaFactory.number,
			});
			const schema = schemaFactory.object("object", {
				a: schemaFactory.string,
				b: childSchema,
				c: schemaFactory.array(schemaFactory.boolean),
			});

			const tree = {
				a: "Hello world",
				b: {
					foo: 42,
				},
				c: [true, false],
			};

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[
							{
								type: brand(stringSchema.identifier),
								value: "Hello world",
								fields: new Map(),
							},
						],
					],
					[
						brand("b"),
						[
							{
								type: brand("test.child-object"),
								fields: new Map<FieldKey, MapTree[]>([
									[
										brand("foo"),
										[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
									],
								]),
							},
						],
					],
					[
						brand("c"),
						[
							{
								type: brand('test.Array<["com.fluidframework.leaf.boolean"]>'),
								fields: new Map<FieldKey, MapTree[]>([
									[
										EmptyKey,
										[
											{
												type: brand(booleanSchema.identifier),
												value: true,
												fields: new Map(),
											},
											{
												type: brand(booleanSchema.identifier),
												value: false,
												fields: new Map(),
											},
										],
									],
								]),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Undefined properties are omitted", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.optional(schemaFactory.number),
				b: schemaFactory.optional(schemaFactory.number),
				c: schemaFactory.optional(schemaFactory.number),
			});

			const tree = {
				a: 42,
				// b is implicitly omitted - should be skipped in output.
				c: undefined, // Explicitly set to undefined - Should be skipped in output
			};

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Object with stored field keys specified", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.required(schemaFactory.string, { key: "foo" }),
				b: schemaFactory.optional(schemaFactory.number, { key: "bar" }),
				c: schemaFactory.boolean,
				d: schemaFactory.optional(schemaFactory.number),
			});

			const tree = {
				a: "Hello world",
				b: 42,
				c: false,
				d: 37,
			};

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("foo"),
						[
							{
								type: brand(stringSchema.identifier),
								value: "Hello world",
								fields: new Map(),
							},
						],
					],
					[
						brand("bar"),
						[{ type: brand(numberSchema.identifier), value: 42, fields: new Map() }],
					],
					[
						brand("c"),
						[{ type: brand(booleanSchema.identifier), value: false, fields: new Map() }],
					],
					[
						brand("d"),
						[{ type: brand(numberSchema.identifier), value: 37, fields: new Map() }],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Populates identifier field with the default identifier provider", () => {
			const nodeKeyManager = new MockNodeIdentifierManager();
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.identifier,
			});

			const tree = {};

			const actual = mapTreeFromNodeData(tree, schema);
			const dummy = hydrate(schema, {});
			const dummyContext = getKernel(dummy).context.flexContext;
			assert(dummyContext.isHydrated());
			// Do the default allocation using this context
			const context: FlexTreeHydratedContextMinimal = {
				checkout: dummyContext.checkout,
				nodeKeyManager,
			};
			prepareContentForHydration([actual], context.checkout.forest, context);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[
							{
								type: brand(stringSchema.identifier),
								value: nodeKeyManager.getId(0),
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Populates optional field with the default optional provider.", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.optional(schemaFactory.string),
			});

			const tree = {};

			const actual = mapTreeFromNodeData(tree, schema);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});
	});

	it("complex", () => {
		const schemaFactory = new SchemaFactory("test");
		const childObjectSchema = schemaFactory.object("child-object", {
			name: schemaFactory.string,
			age: schemaFactory.number,
		});
		const schema = schemaFactory.object("complex-object", {
			a: schemaFactory.string,
			b: schemaFactory.array("array", [
				childObjectSchema,
				schemaFactory.handle,
				schemaFactory.null,
			]),
			c: schemaFactory.map("map", [
				childObjectSchema,
				schemaFactory.string,
				schemaFactory.number,
			]),
		});

		const handle = new MockHandle<boolean>(true);

		const a = "Hello world";
		const b = [{ name: "Jack", age: 37 }, null, { name: "Jill", age: 42 }, handle];
		const cEntries: [string, InsertableContent][] = [
			["foo", { name: "Foo", age: 2 }],
			["bar", "1"],
			["baz", 2],
		];
		const c = new Map<string, InsertableContent>(cEntries);

		const tree = {
			a,
			b,
			c,
		};

		const actual = mapTreeFromNodeData(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.complex-object"),
			fields: new Map<FieldKey, MapTree[]>([
				[
					brand("a"),
					[{ type: brand(stringSchema.identifier), value: "Hello world", fields: new Map() }],
				],
				[
					brand("b"),
					[
						{
							type: brand("test.array"),
							fields: new Map<FieldKey, MapTree[]>([
								[
									EmptyKey,
									[
										{
											type: brand(childObjectSchema.identifier),
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: brand(stringSchema.identifier),
															value: "Jack",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: brand(numberSchema.identifier),
															value: 37,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: brand(nullSchema.identifier),
											value: null,
											fields: new Map(),
										},
										{
											type: brand(childObjectSchema.identifier),
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: brand(stringSchema.identifier),
															value: "Jill",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: brand(numberSchema.identifier),
															value: 42,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: brand(handleSchema.identifier),
											value: handle,
											fields: new Map(),
										},
									],
								],
							]),
						},
					],
				],
				[
					brand("c"),
					[
						{
							type: brand("test.map"),
							fields: new Map<FieldKey, MapTree[]>([
								[
									brand("foo"),
									[
										{
											type: brand(childObjectSchema.identifier),
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: brand(stringSchema.identifier),
															value: "Foo",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: brand(numberSchema.identifier),
															value: 2,
															fields: new Map(),
														},
													],
												],
											]),
										},
									],
								],
								[
									brand("bar"),
									[
										{
											type: brand(stringSchema.identifier),
											value: "1",
											fields: new Map(),
										},
									],
								],
								[
									brand("baz"),
									[{ type: brand(numberSchema.identifier), value: 2, fields: new Map() }],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(deepCopyMapTree(actual), expected);
	});

	it("ambiguous unions", () => {
		const schemaFactory = new SchemaFactory("test");
		const a = schemaFactory.object("a", { x: schemaFactory.string });
		const b = schemaFactory.object("b", { x: schemaFactory.string });
		const allowedTypes = [a, b];

		assert.throws(() => mapTreeFromNodeData({}, allowedTypes), /\["test.a","test.b"]/);
		assert.throws(
			() => mapTreeFromNodeData({ x: "hello" }, allowedTypes),
			/\["test.a","test.b"]/,
		);
	});

	it("unambiguous unions", () => {
		const schemaFactory = new SchemaFactory("test");
		const a = schemaFactory.object("a", { a: schemaFactory.string, c: schemaFactory.string });
		const b = schemaFactory.object("b", { b: schemaFactory.string, c: schemaFactory.string });
		const allowedTypes = [a, b];

		assert.doesNotThrow(() => mapTreeFromNodeData({ a: "hello", c: "world" }, allowedTypes));
		assert.doesNotThrow(() => mapTreeFromNodeData({ b: "hello", c: "world" }, allowedTypes));
	});

	// Our data serialization format does not support certain numeric values.
	// These tests are intended to verify the mapping behaviors for those values.
	describe("Incompatible numeric value handling", () => {
		function assertFallback(value: number, expectedFallbackValue: unknown): void {
			const schemaFactory = new SchemaFactory("test");

			// The current fallbacks we generate are `number` and `null`.
			// This set will need to be expanded if that set changes and we wish to test the associated scenarios.
			const schema = [schemaFactory.number, schemaFactory.null];

			const result = mapTreeFromNodeData(value, schema);
			assert.equal(result.value, expectedFallbackValue);
		}

		function assertValueThrows(value: number): void {
			const schemaFactory = new SchemaFactory("test");

			// Schema doesn't support null, so numeric values that fall back to null should throw
			const schema = schemaFactory.number;
			assert.throws(() => mapTreeFromNodeData(value, [schema]));
		}

		it("NaN (falls back to null if allowed by the schema)", () => {
			assertFallback(Number.NaN, null);
		});

		it("NaN (throws if fallback type is not allowed by the schema)", () => {
			assertValueThrows(Number.NaN);
		});

		it("+∞ (throws if fallback type is not allowed by the schema)", () => {
			assertValueThrows(Number.POSITIVE_INFINITY);
		});

		it("+∞ (falls back to null if allowed by the schema)", () => {
			assertFallback(Number.POSITIVE_INFINITY, null);
		});

		it("-∞ (throws if fallback type is not allowed by the schema)", () => {
			assertValueThrows(Number.NEGATIVE_INFINITY);
		});

		it("-∞ (falls back to null if allowed by the schema)", () => {
			assertFallback(Number.NEGATIVE_INFINITY, null);
		});

		// Fallback for -0 is +0, so it is supported in all cases where a number is supported.
		it("-0", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.number;

			const result = mapTreeFromNodeData(-0, [schema]);
			assert.equal(result.value, +0);
		});

		it("Array containing `undefined` (maps values to null when allowed by the schema)", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array([schemaFactory.number, schemaFactory.null]);

			const input: (number | undefined)[] = [42, undefined, 37, undefined];

			const actual = mapTreeFromNodeData(input as InsertableContent, [schema]);

			const expected: MapTree = {
				type: brand(schema.identifier),
				fields: new Map([
					[
						EmptyKey,
						[
							{
								value: 42,
								type: brand(numberSchema.identifier),
								fields: new Map(),
							},
							{
								value: null,
								type: brand(nullSchema.identifier),
								fields: new Map(),
							},
							{
								value: 37,
								type: brand(numberSchema.identifier),
								fields: new Map(),
							},
							{
								value: null,
								type: brand(nullSchema.identifier),
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(deepCopyMapTree(actual), expected);
		});

		it("Array containing `undefined` (throws if fallback type when not allowed by the schema)", () => {
			const schemaFactory = new SchemaFactory("test");
			assert.throws(
				() =>
					mapTreeFromNodeData([42, undefined, 37, undefined] as InsertableContent, [
						schemaFactory.array(schemaFactory.number),
					]),
				/Received unsupported array entry value/,
			);
		});
	});

	describe("getPossibleTypes", () => {
		it("array vs map", () => {
			const f = new SchemaFactory("test");
			const arraySchema = f.array([f.null]);
			const mapSchema = f.map([f.null]);
			// Array makes array
			assert.deepEqual(getPossibleTypes(new Set([mapSchema, arraySchema]), []), [arraySchema]);
			// Map makes map
			assert.deepEqual(getPossibleTypes(new Set([mapSchema, arraySchema]), new Map()), [
				mapSchema,
			]);
			// Iterator can make map or array.
			assert.deepEqual(getPossibleTypes(new Set([mapSchema, arraySchema]), new Map().keys()), [
				mapSchema,
				arraySchema,
			]);
		});

		it("array vs map low priority matching", () => {
			const f = new SchemaFactory("test");
			const arraySchema = f.array([f.null]);
			const mapSchema = f.map([f.null]);
			// Array makes map
			assert.deepEqual(getPossibleTypes(new Set([mapSchema]), []), [mapSchema]);
			// Map makes array
			assert.deepEqual(getPossibleTypes(new Set([arraySchema]), new Map()), [arraySchema]);
		});

		it("inherited properties types", () => {
			const f = new SchemaFactory("test");
			class Optional extends f.object("x", {
				constructor: f.optional(f.number),
			}) {}
			class Required extends f.object("x", {
				constructor: f.number,
			}) {}
			class Other extends f.object("y", {
				other: f.number,
			}) {}
			// Ignore inherited constructor field
			assert.deepEqual(getPossibleTypes(new Set([Optional, Required, Other]), {}), [Optional]);
			// Allow overridden field
			assert.deepEqual(
				getPossibleTypes(new Set([Optional, Required, Other]), { constructor: 5 }),
				[Optional, Required],
			);
			// Allow overridden undefined
			assert.deepEqual(
				getPossibleTypes(new Set([Optional, Required, Other]), { constructor: undefined }),
				[Optional],
			);
			// Multiple Fields
			assert.deepEqual(
				getPossibleTypes(new Set([Optional, Required, Other]), {
					constructor: undefined,
					other: 6,
				}),
				[Optional, Other],
			);
			assert.deepEqual(
				getPossibleTypes(new Set([Optional, Required, Other]), {
					constructor: 5,
					other: 6,
				}),
				[Optional, Required, Other],
			);
			// No properties
			assert.deepEqual(
				getPossibleTypes(new Set([Optional, Required, Other]), Object.create(null)),
				[Optional],
			);
		});
	});

	describe("defaults", () => {
		const f = new SchemaFactory("test");

		it("ConstantFieldProvider", () => {
			class Test extends f.object("test", {
				api: createFieldSchema(FieldKind.Required, [f.string], {
					key: "stored",
					defaultProvider: getDefaultProvider(() => [
						new UnhydratedFlexTreeNode(
							{
								type: brand(stringSchema.identifier),
								value: "x",
							},
							new Map(),
							getUnhydratedContext(SchemaFactory.string),
						),
					]),
				}),
			}) {}

			const node = mapTreeFromNodeData({}, Test);
			const field = node.getBoxed("stored");
			assert(!field.pendingDefault);
			const read = getTreeNodeForField(field);
			assert.equal(read, "x");
		});

		describe("ContextualFieldProvider", () => {
			class Test extends f.object("test", {
				api: createFieldSchema(FieldKind.Required, [f.string], {
					key: "stored",
					defaultProvider: getDefaultProvider((context) => [
						new UnhydratedFlexTreeNode(
							{
								type: brand(stringSchema.identifier),
								value: context === "UseGlobalContext" ? "global" : "contextual",
							},
							new Map(),
							getUnhydratedContext(SchemaFactory.string),
						),
					]),
				}),
			}) {}

			it("Implicit read with global context", () => {
				const node = mapTreeFromNodeData({}, Test);
				const field = node.getBoxed("stored");
				assert(field.pendingDefault);
				const read = getTreeNodeForField(field);
				assert(!field.pendingDefault);
				assert.equal(read, "global");
			});

			it("Explicit populate with valid context", () => {
				const node = mapTreeFromNodeData({}, Test);
				const field = node.getBoxed("stored");
				assert(field.pendingDefault);
				const dummy = hydrate(Test, new Test({ api: "dummy" }));
				const context = getKernel(dummy).context.flexContext;
				assert(context.isHydrated());
				field.fillPendingDefaults(context);
				const read = getTreeNodeForField(field);
				assert(!field.pendingDefault);
				assert.equal(read, "contextual");
			});

			// Uses a context which does not know about the schema being used.
			// This helps ensure that creation of invalid defaults won't assert (a usage error would be fine).
			// This test does not run the schema validation, which happens after defaults are populated, so it simply must either usage error or complete.
			it("Explicit populate with invalid context", () => {
				const node = mapTreeFromNodeData({}, Test);
				const field = node.getBoxed("stored");
				assert(field.pendingDefault);
				class Test2 extends f.object("test2", {}) {}
				const dummy = hydrate(Test2, new Test2({}));
				const context = getKernel(dummy).context.flexContext;
				assert(context.isHydrated());
				field.fillPendingDefaults(context);
				const read = getTreeNodeForField(field);
				assert(!field.pendingDefault);
				assert.equal(read, "contextual");
			});
		});
	});
});
