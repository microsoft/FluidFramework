/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	MockHandle,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	ValueSchema,
	type FieldKey,
	type FieldKindData,
	type FieldKindIdentifier,
	type MapTree,
	type SchemaAndPolicy,
	type TreeFieldStoredSchema,
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
	type TreeNodeSchema,
	type ContextualFieldProvider,
	type ConstantFieldProvider,
	type FieldProvider,
	type FieldProps,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";
import {
	cursorFromFieldData,
	cursorFromNodeData,
	mapTreeFromNodeData,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/toMapTree.js";
import { brand } from "../../util/index.js";
import {
	FieldKinds,
	MockNodeKeyManager,
	type NodeKeyManager,
} from "../../feature-libraries/index.js";

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 */
function getFieldSchema(
	kind: { identifier: FieldKindIdentifier },
	allowedTypes?: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind: kind.identifier,
		types: allowedTypes === undefined ? undefined : new Set(allowedTypes),
	};
}

describe("toMapTree", () => {
	let nodeKeyManager: MockNodeKeyManager;
	beforeEach(() => {
		nodeKeyManager = new MockNodeKeyManager();
	});

	it("string", () => {
		const schemaFactory = new SchemaFactory("test");
		const tree = "Hello world";

		const actual = mapTreeFromNodeData(tree, [schemaFactory.string]);

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

		const actual = mapTreeFromNodeData(null, [schema]);

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

		const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[brand("b"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
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

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.map"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
					[brand("b"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
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

			const actual = mapTreeFromNodeData(tree, [schema]);

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
				() => mapTreeFromNodeData(tree, schema),
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

			const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
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

			const actual = mapTreeFromNodeData(tree, [schema]);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>([
					[brand("a"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
					[
						brand("b"),
						[
							{
								type: brand("test.child-object"),
								fields: new Map<FieldKey, MapTree[]>([
									[brand("foo"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
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

			const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, [schema]);

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

			const actual = mapTreeFromNodeData(tree, schema, nodeKeyManager);

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

			const actual = mapTreeFromNodeData(tree, schema);

			const expected: MapTree = {
				type: brand("test.object"),
				fields: new Map<FieldKey, MapTree[]>(),
			};

			assert.deepEqual(actual, expected);
		});

		it("Populates a tree with defaults", () => {
			const defaultValue = 3;
			const constantProvider: ConstantFieldProvider = () => {
				return defaultValue;
			};
			const contextualProvider: ContextualFieldProvider = (context: NodeKeyManager) => {
				assert.equal(context, nodeKeyManager);
				return defaultValue;
			};
			function createDefaultFieldProps(provider: FieldProvider): FieldProps {
				return {
					// By design, the public `DefaultProvider` type cannot be casted to, so we must disable type checking with `any`.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					defaultProvider: provider as any,
				};
			}

			const schemaFactory = new SchemaFactory("test");
			class LeafObject extends schemaFactory.object("Leaf", {
				constantValue: schemaFactory.optional(
					schemaFactory.number,
					createDefaultFieldProps(constantProvider),
				),
				contextualValue: schemaFactory.optional(
					schemaFactory.number,
					createDefaultFieldProps(contextualProvider),
				),
			}) {}
			class RootObject extends schemaFactory.object("Root", {
				object: schemaFactory.required(LeafObject),
				array: schemaFactory.array(LeafObject),
				map: schemaFactory.map(LeafObject),
			}) {}

			const nodeData = {
				object: {},
				array: [{}, {}],
				map: new Map([
					["a", {}],
					["b", {}],
				]),
			};

			// Don't pass in a context
			let mapTree = mapTreeFromNodeData(nodeData, RootObject);

			const getObject = () => mapTree.fields.get(brand("object"))?.[0];
			const getArray = () => mapTree.fields.get(brand("array"))?.[0].fields.get(EmptyKey);
			const getMap = () => mapTree.fields.get(brand("map"))?.[0];
			const getConstantValue = (leafObject: MapTree | undefined) =>
				leafObject?.fields.get(brand("constantValue"))?.[0].value;
			const getContextualValue = (leafObject: MapTree | undefined) =>
				leafObject?.fields.get(brand("contextualValue"))?.[0].value;

			// Assert that we've populated the constant defaults...
			assert.equal(getConstantValue(getObject()), defaultValue);
			assert.equal(getConstantValue(getArray()?.[0]), defaultValue);
			assert.equal(getConstantValue(getArray()?.[1]), defaultValue);
			assert.equal(getConstantValue(getMap()?.fields.get(brand("a"))?.[0]), defaultValue);
			assert.equal(getConstantValue(getMap()?.fields.get(brand("b"))?.[0]), defaultValue);
			// ...but not the contextual ones
			assert.equal(getContextualValue(getObject()), undefined);
			assert.equal(getContextualValue(getArray()?.[0]), undefined);
			assert.equal(getContextualValue(getArray()?.[1]), undefined);
			assert.equal(getContextualValue(getMap()?.fields.get(brand("a"))?.[0]), undefined);
			assert.equal(getContextualValue(getMap()?.fields.get(brand("b"))?.[0]), undefined);

			// This time, pass the context in
			mapTree = mapTreeFromNodeData(nodeData, RootObject, nodeKeyManager);

			// Assert that all defaults are populated
			assert.equal(getConstantValue(getObject()), defaultValue);
			assert.equal(getConstantValue(getArray()?.[0]), defaultValue);
			assert.equal(getConstantValue(getArray()?.[1]), defaultValue);
			assert.equal(getConstantValue(getMap()?.fields.get(brand("a"))?.[0]), defaultValue);
			assert.equal(getConstantValue(getMap()?.fields.get(brand("b"))?.[0]), defaultValue);
			assert.equal(getContextualValue(getObject()), defaultValue);
			assert.equal(getContextualValue(getArray()?.[0]), defaultValue);
			assert.equal(getContextualValue(getArray()?.[1]), defaultValue);
			assert.equal(getContextualValue(getMap()?.fields.get(brand("a"))?.[0]), defaultValue);
			assert.equal(getContextualValue(getMap()?.fields.get(brand("b"))?.[0]), defaultValue);
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
								[brand("baz"), [{ type: leaf.number.name, value: 2, fields: new Map() }]],
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
					mapTreeFromNodeData([42, undefined, 37, undefined] as InsertableContent, [
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

		describe("mapTreeFromNodeData", () => {
			describe("Leaf node", () => {
				function createSchemaAndPolicyForLeafNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
						]),
						new Map(),
					);
				}

				it("Success", () => {
					const content = "Hello world";
					const schemaValidationPolicy = createSchemaAndPolicyForLeafNode();
					mapTreeFromNodeData(
						content,
						[schemaFactory.string],
						undefined,
						schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const content = "Hello world";
					const schemaValidationPolicy = createSchemaAndPolicyForLeafNode(true);
					assert.throws(
						() =>
							mapTreeFromNodeData(
								content,
								[schemaFactory.string],
								undefined,
								schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});

			describe("Object node", () => {
				const content = { foo: "Hello world" };
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					brand(schemaFactory.string.identifier),
				]);
				const myObjectSchema = schemaFactory.object("myObject", {
					foo: schemaFactory.string,
				});

				function createSchemaAndPolicyForObjectNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
							[
								brand(myObjectSchema.identifier),
								new ObjectNodeStoredSchema(
									new Map<FieldKey, TreeFieldStoredSchema>([[brand("foo"), fieldSchema]]),
								),
							],
						]),
						new Map([[fieldSchema.kind, FieldKinds.required]]),
					);
				}
				it("Success", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForObjectNode();
					mapTreeFromNodeData(
						content,
						[myObjectSchema, schemaFactory.string],
						undefined,
						schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForObjectNode(true);
					assert.throws(
						() =>
							mapTreeFromNodeData(
								content,
								[myObjectSchema, schemaFactory.string],
								undefined,
								schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});

			describe("Map node", () => {
				const content = new Map([["foo", "Hello world"]]);
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					brand(schemaFactory.string.identifier),
				]);
				const myMapSchema = schemaFactory.map("myMap", [schemaFactory.string]);

				function createSchemaAndPolicyForMapNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
							[brand(myMapSchema.identifier), new MapNodeStoredSchema(fieldSchema)],
						]),
						new Map([[fieldSchema.kind, FieldKinds.required]]),
					);
				}
				it("Success", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode();
					mapTreeFromNodeData(
						content,
						[myMapSchema, schemaFactory.string],
						undefined,
						schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode(true);
					assert.throws(
						() =>
							mapTreeFromNodeData(
								content,
								[myMapSchema, schemaFactory.string],
								undefined,
								schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});

			describe("Array node", () => {
				const content = ["foo"];
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					brand(schemaFactory.string.identifier),
				]);
				const myArrayNodeSchema = schemaFactory.array("myArrayNode", [schemaFactory.string]);

				function createSchemaAndPolicyForMapNode(invalid: boolean = false) {
					return createSchemaAndPolicy(
						new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
							[
								// An invalid stored schema will associate the string identifier to a number schema
								brand(schemaFactory.string.identifier),
								invalid
									? new LeafNodeStoredSchema(ValueSchema.Number)
									: new LeafNodeStoredSchema(ValueSchema.String),
							],
							[brand(myArrayNodeSchema.identifier), new MapNodeStoredSchema(fieldSchema)],
						]),
						new Map([[fieldSchema.kind, FieldKinds.required]]),
					);
				}
				it("Success", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode();
					mapTreeFromNodeData(
						content,
						[myArrayNodeSchema, schemaFactory.string],
						undefined,
						schemaValidationPolicy,
					);
				});

				it("Failure", () => {
					const schemaValidationPolicy = createSchemaAndPolicyForMapNode(true);
					assert.throws(
						() =>
							mapTreeFromNodeData(
								content,
								[myArrayNodeSchema, schemaFactory.string],
								undefined,
								schemaValidationPolicy,
							),
						outOfSchemaExpectedError,
					);
				});
			});
		});

		const schemaValidationPolicyForSuccess = createSchemaAndPolicy(
			new Map([
				[brand(schemaFactory.string.identifier), new LeafNodeStoredSchema(ValueSchema.String)],
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

		describe("cursorFromNodeData", () => {
			it("Success", () => {
				const nodeData = "Hello world";
				cursorFromNodeData(
					nodeData,
					[schemaFactory.string],
					undefined,
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
							undefined,
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
				cursorFromFieldData(content, fieldSchema, undefined, schemaValidationPolicyForSuccess);
			});

			it("Failure", () => {
				const content = "Hello world";
				const fieldSchema = createFieldSchema(FieldKind.Required, [schemaFactory.string]);
				assert.throws(
					() =>
						cursorFromFieldData(
							content,
							fieldSchema,
							undefined,
							schemaValidationPolicyForFailure,
						),
					outOfSchemaExpectedError,
				);
			});
		});
	});
});
