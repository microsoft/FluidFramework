/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockHandle, validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	ValueSchema,
	type FieldKey,
	type FieldKindData,
	type FieldKindIdentifier,
	type MapTree,
	type SchemaAndPolicy,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { InsertableContent } from "../../simple-tree/proxies.js";
import {
	FieldKind,
	createFieldSchema,
	type ImplicitAllowedTypes,
	normalizeAllowedTypes,
	type TreeNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";
import {
	cursorFromFieldData,
	cursorFromNodeData,
	nodeDataToMapTree as nodeDataToMapTreeBase,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/toMapTree.js";
import { brand } from "../../util/index.js";
import { createNodeKeyManager, MockNodeKeyManager } from "../../feature-libraries/index.js";

describe("toMapTree", () => {
	let nodeKeyManager: MockNodeKeyManager;
	beforeEach(() => {
		nodeKeyManager = new MockNodeKeyManager();
	});

	/**
	 * Wrapper around {@link nodeDataToMapTreeBase} which handles the normalization of {@link ImplicitAllowedTypes} as a
	 * convenience.
	 */
	function nodeDataToMapTree(
		tree: InsertableContent,
		allowedTypes: ImplicitAllowedTypes,
		schemaValidationPolicy?: SchemaAndPolicy,
	): MapTree {
		return nodeDataToMapTreeBase(
			tree,
			normalizeAllowedTypes(allowedTypes),
			nodeKeyManager,
			schemaValidationPolicy,
		);
	}

	it("string", () => {
		const schemaFactory = new SchemaFactory("test");
		const tree = "Hello world";

		const actual = nodeDataToMapTree(tree, [schemaFactory.string]);

		const expected: MapTree = {
			type: leaf.string.name,
			value: "Hello world",
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("null", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.null;

		const actual = nodeDataToMapTree(null, [schema]);

		const expected: MapTree = {
			type: leaf.null.name,
			value: null,
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("handle", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.handle;

		const tree = new MockHandle<string>("mock-fluid-handle");

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand(schemaFactory.handle.identifier),
			value: tree,
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("recursive", () => {
		const schemaFactory = new SchemaFactory("test");
		class Foo extends schemaFactory.objectRecursive("Foo", {
			x: schemaFactory.optionalRecursive(() => Bar),
		}) {}
		class Bar extends schemaFactory.objectRecursive("Bar", {
			y: schemaFactory.optionalRecursive(() => Foo),
		}) {}

		const actual = nodeDataToMapTree(
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

		assert.deepEqual(actual, expected);
	});

	it("Fails when referenced schema has not yet been instantiated", () => {
		const schemaFactory = new SchemaFactory("test");

		let Bar: TreeNodeSchema;
		class Foo extends schemaFactory.objectRecursive("Foo", {
			x: schemaFactory.optionalRecursive(() => Bar),
		}) {}

		const tree = {
			x: {
				y: "Hello world!",
			},
		};

		assert.throws(
			() => nodeDataToMapTree(tree, Foo),
			(error: Error) => validateAssertionError(error, /Encountered an undefined schema/),
		);
	});

	it("Fails when data is incompatible with schema", () => {
		const schemaFactory = new SchemaFactory("test");

		assert.throws(
			() => nodeDataToMapTree("Hello world", [schemaFactory.number]),
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(actual, expected);
		});

		it("Simple array", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array("array", [
				schemaFactory.number,
				schemaFactory.handle,
			]);

			const handle = new MockHandle<boolean>(true);
			const tree = [42, handle, 37];

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						EmptyKey,
						[
							{
								type: leaf.number.name,
								value: 42,
								fields: new Map(),
							},
							{
								type: leaf.handle.name,
								value: handle,
								fields: new Map(),
							},
							{
								type: leaf.number.name,
								value: 37,
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						EmptyKey,
						[
							{
								type: leaf.number.name,
								value: 42,
								fields: new Map(),
							},
							{
								type: leaf.handle.name,
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
												type: leaf.string.name,
												value: "Jack",
												fields: new Map(),
											},
										],
									],
									[
										brand("age"),
										[
											{
												type: leaf.number.name,
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

			assert.deepEqual(actual, expected);
		});

		it("Recursive array", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.arrayRecursive("array", [
				schemaFactory.number,
				() => schema,
			]);

			const tree = [42, [1, 2], 37];

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.array"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						EmptyKey,
						[
							{
								type: leaf.number.name,
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
												type: leaf.number.name,
												value: 1,
												fields: new Map(),
											},
											{
												type: leaf.number.name,
												value: 2,
												fields: new Map(),
											},
										],
									],
								]),
							},
							{
								type: leaf.number.name,
								value: 37,
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(actual, expected);
		});

		it("Throws on `undefined` entries when null is not allowed", () => {
			const schemaFactory = new SchemaFactory("test");
			assert.throws(
				() =>
					nodeDataToMapTree(
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
					nodeDataToMapTree(
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[
						brand("b"),
						[{ type: leaf.string.name, value: "Hello world", fields: new Map() }],
					],
					[brand("c"), [{ type: leaf.number.name, value: 37, fields: new Map() }]],
				]),
			};

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[
						brand("b"),
						[{ type: leaf.string.name, value: "Hello world", fields: new Map() }],
					],
					[brand("c"), [{ type: brand(leaf.null.name), value: null, fields: new Map() }]],
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
												type: leaf.string.name,
												value: "Jill",
												fields: new Map(),
											},
										],
									],
									[
										brand("age"),
										[
											{
												type: leaf.number.name,
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

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[brand("c"), [{ type: leaf.number.name, value: 37, fields: new Map() }]],
				]),
			};

			assert.deepEqual(actual, expected);
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
				() => nodeDataToMapTree(tree, schema),
				/The provided data is incompatible with all of the types allowed by the schema/,
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[{ type: leaf.string.name, value: "Hello world", fields: new Map() }],
					],
					[brand("b"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[brand("c"), [{ type: leaf.boolean.name, value: false, fields: new Map() }]],
				]),
			};

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[{ type: leaf.string.name, value: "Hello world", fields: new Map() }],
					],
					[
						brand("b"),
						[
							{
								type: brand("test.child-object"),
								fields: new Map<FieldKey, MapTree[]>([
									[
										brand("foo"),
										[{ type: leaf.number.name, value: 42, fields: new Map() }],
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
												type: leaf.boolean.name,
												value: true,
												fields: new Map(),
											},
											{
												type: leaf.boolean.name,
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

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
				]),
			};

			assert.deepEqual(actual, expected);
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

			const actual = nodeDataToMapTree(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("foo"),
						[{ type: leaf.string.name, value: "Hello world", fields: new Map() }],
					],
					[brand("bar"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[brand("c"), [{ type: leaf.boolean.name, value: false, fields: new Map() }]],
					[brand("d"), [{ type: leaf.number.name, value: 37, fields: new Map() }]],
				]),
			};

			assert.deepEqual(actual, expected);
		});

		it("Populates identifier field with the default identifier provider", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.identifier,
			});

			const tree = {};

			const actual = nodeDataToMapTree(tree, schema);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[
						brand("a"),
						[
							{
								type: leaf.string.name,
								value: nodeKeyManager.getId(0),
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(actual, expected);
		});

		it("Populates optional field with the default optional provider.", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.object("object", {
				a: schemaFactory.optional(schemaFactory.string),
			});

			const tree = {};

			const actual = nodeDataToMapTree(tree, schema);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(actual, expected);
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

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.complex-object"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
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
															type: leaf.string.name,
															value: "Jack",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: leaf.number.name,
															value: 37,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: leaf.null.name,
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
															type: leaf.string.name,
															value: "Jill",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: leaf.number.name,
															value: 42,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: leaf.handle.name,
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
															type: leaf.string.name,
															value: "Foo",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: leaf.number.name,
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
											type: leaf.string.name,
											value: "1",
											fields: new Map(),
										},
									],
								],
								[
									brand("baz"),
									[{ type: leaf.number.name, value: 2, fields: new Map() }],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("ambiguous unions", () => {
		const schemaFactory = new SchemaFactory("test");
		const a = schemaFactory.object("a", { x: schemaFactory.string });
		const b = schemaFactory.object("b", { x: schemaFactory.string });
		const allowedTypes = [a, b];

		assert.throws(() => nodeDataToMapTree({}, allowedTypes), /\["test.a","test.b"]/);
		assert.throws(
			() => nodeDataToMapTree({ x: "hello" }, allowedTypes),
			/\["test.a","test.b"]/,
		);
	});

	it("unambiguous unions", () => {
		const schemaFactory = new SchemaFactory("test");
		const a = schemaFactory.object("a", { a: schemaFactory.string, c: schemaFactory.string });
		const b = schemaFactory.object("b", { b: schemaFactory.string, c: schemaFactory.string });
		const allowedTypes = [a, b];

		assert.doesNotThrow(() => nodeDataToMapTree({ a: "hello", c: "world" }, allowedTypes));
		assert.doesNotThrow(() => nodeDataToMapTree({ b: "hello", c: "world" }, allowedTypes));
	});

	// Our data serialization format does not support certain numeric values.
	// These tests are intended to verify the mapping behaviors for those values.
	describe("Incompatible numeric value handling", () => {
		function assertFallback(value: number, expectedFallbackValue: unknown): void {
			const schemaFactory = new SchemaFactory("test");

			// The current fallbacks we generate are `number` and `null`.
			// This set will need to be expanded if that set changes and we wish to test the associated scenarios.
			const schema = [schemaFactory.number, schemaFactory.null];

			const result = nodeDataToMapTree(value, schema);
			assert.equal(result.value, expectedFallbackValue);
		}

		function assertValueThrows(value: number): void {
			const schemaFactory = new SchemaFactory("test");

			// Schema doesn't support null, so numeric values that fall back to null should throw
			const schema = schemaFactory.number;
			assert.throws(() => nodeDataToMapTree(value, [schema]));
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

			const result = nodeDataToMapTree(-0, [schema]);
			assert.equal(result.value, +0);
		});

		it("Array containing `undefined` (maps values to null when allowed by the schema)", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array([schemaFactory.number, schemaFactory.null]);

			const input: (number | undefined)[] = [42, undefined, 37, undefined];

			const actual = nodeDataToMapTree(input as InsertableContent, [schema]);

			const expected: MapTree = {
				type: brand(schema.identifier),
				fields: new Map([
					[
						EmptyKey,
						[
							{
								value: 42,
								type: leaf.number.name,
								fields: new Map(),
							},
							{
								value: null,
								type: leaf.null.name,
								fields: new Map(),
							},
							{
								value: 37,
								type: leaf.number.name,
								fields: new Map(),
							},
							{
								value: null,
								type: leaf.null.name,
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(actual, expected);
		});

		it("Array containing `undefined` (throws if fallback type when not allowed by the schema)", () => {
			const schemaFactory = new SchemaFactory("test");
			assert.throws(
				() =>
					nodeDataToMapTree([42, undefined, 37, undefined] as InsertableContent, [
						schemaFactory.array(schemaFactory.number),
					]),
				/Received unsupported array entry value/,
			);
		});
	});

	describe("Stored schema validation", () => {
		/**
		 * Creates a schema and policy and indicates stored schema validation should be performed.
		 */
		function createSchemaAndPolicy(
			nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map(),
			fieldKinds: Map<FieldKindIdentifier, FieldKindData> = new Map(),
		): SchemaAndPolicy {
			return {
				schema: {
					nodeSchema,
				},
				policy: {
					fieldKinds,
					validateSchema: true,
				},
			};
		}

		const outOfSchemaExpectedError: Partial<Error> = {
			message: "Tree does not conform to schema.",
		};

		const schemaFactory = new SchemaFactory("test");
		const schemaValidationPolicyForSuccess = createSchemaAndPolicy(
			new Map([
				[
					brand(schemaFactory.string.identifier),
					new LeafNodeStoredSchema(ValueSchema.String),
				],
			]),
			new Map(),
		);
		const schemaValidationPolicyForFailure = createSchemaAndPolicy(
			new Map([
				[
					// Fake a stored schema that associates the string identifier to a number schema
					brand(schemaFactory.string.identifier),
					new LeafNodeStoredSchema(ValueSchema.Number),
				],
			]),
			new Map(),
		);

		describe("nodeDataToMapTree", () => {
			it("Success", () => {
				const content = "Hello world";
				nodeDataToMapTree(
					content,
					[schemaFactory.string],
					schemaValidationPolicyForSuccess,
				);
			});

			it("Failure", () => {
				const content = "Hello world";
				assert.throws(
					() =>
						nodeDataToMapTree(
							content,
							[schemaFactory.string],
							schemaValidationPolicyForFailure,
						),
					outOfSchemaExpectedError,
				);
			});
		});

		describe("cursorFromNodeData", () => {
			it("Success", () => {
				const nodeData = "Hello world";
				cursorFromNodeData(
					nodeData,
					[schemaFactory.string],
					createNodeKeyManager(),
					schemaValidationPolicyForSuccess,
				);
			});

			it("Failure", () => {
				const content = "Hello world";
				assert.throws(
					() =>
						cursorFromNodeData(
							content,
							[schemaFactory.string],
							createNodeKeyManager(),
							schemaValidationPolicyForFailure,
						),
					outOfSchemaExpectedError,
				);
			});
		});

		describe("cursorFromFieldData", () => {
			it("Success", () => {
				const content = "Hello world";
				const fieldSchema = createFieldSchema(FieldKind.Required, [schemaFactory.string]);
				cursorFromFieldData(
					content,
					fieldSchema,
					createNodeKeyManager(),
					schemaValidationPolicyForSuccess,
				);
			});

			it("Failure", () => {
				const content = "Hello world";
				const fieldSchema = createFieldSchema(FieldKind.Required, [schemaFactory.string]);
				assert.throws(
					() =>
						cursorFromFieldData(
							content,
							fieldSchema,
							createNodeKeyManager(),
							schemaValidationPolicyForFailure,
						),
					outOfSchemaExpectedError,
				);
			});
		});
	});
});
