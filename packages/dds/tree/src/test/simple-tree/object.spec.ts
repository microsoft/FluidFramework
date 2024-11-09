/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	SchemaFactory,
	type InsertableField,
	type UnsafeUnknownSchema,
} from "../../simple-tree/index.js";

import { hydrate, pretty } from "./utils.js";

interface TestCase<TSchema extends ImplicitFieldSchema> {
	readonly name?: string;
	readonly schema: TSchema;
	readonly initialTree: InsertableTreeFieldFromImplicitField<TSchema>;
}

interface TestCaseErased {
	name?: string;
	schema: ImplicitFieldSchema;
	initialTree: InsertableField<UnsafeUnknownSchema>;
}

function test<T extends ImplicitFieldSchema>(t: TestCase<T>): TestCaseErased {
	return t as TestCaseErased;
}

/**
 * Map a generic function over an array, assuming that doing so is well defined.
 * @remarks
 * This is useful for processing arrays of generically parameterized values with differing values for their type parameter.
 * If the type parameter got type erased when collecting the items into the array, this utility can be used to process the items as iff they each still had the type parameter.
 */
function unsafeMapErased<E, R>(data: readonly E[], f: <T>(t: never) => R): R[] {
	return data.map((item) => f(item as never));
}

export function testObjectPrototype(proxy: object, prototype: object) {
	describe("inherits from Object.prototype", () => {
		it(`${pretty(proxy)} instanceof Object`, () => {
			assert(prototype instanceof Object, "object must be instanceof Object");
		});

		for (const [key, descriptor] of Object.entries(
			Object.getOwnPropertyDescriptors(Object.prototype),
		)) {
			it(`${key} -> ${pretty(descriptor)}}`, () => {
				assert.deepEqual(
					Object.getOwnPropertyDescriptor(prototype, key),
					descriptor,
					`Proxy must expose Object.prototype.${key}`,
				);
			});
		}
	});
}

function testObjectLike(testCases: TestCaseErased[]) {
	describe("Object-like", () => {
		describe("satisfies 'deepEqual'", () => {
			unsafeMapErased(
				testCases,
				<const TSchema extends ImplicitFieldSchema>(item: TestCase<TSchema>) => {
					it(item.name ?? pretty(item.initialTree).toString(), () => {
						const proxy = hydrate(item.schema, item.initialTree);
						assert.deepEqual(proxy, item.initialTree, "Proxy must satisfy 'deepEqual'.");
					});
				},
			);
		});

		describe("inherits from Object.prototype", () => {
			function findObjectPrototype(o: unknown) {
				return Object.getPrototypeOf(
					// If 'root' is an array, the immediate prototype is Array.prototype.  We need to go
					// one additional level to get Object.prototype.
					Array.isArray(o) ? Object.getPrototypeOf(o) : o,
				) as object;
			}

			unsafeMapErased(
				testCases,
				<const TSchema extends ImplicitFieldSchema>({
					initialTree,
					schema,
				}: TestCase<TSchema>) => {
					describe("instanceof Object", () => {
						it(`${pretty(initialTree)} -> true`, () => {
							const root = hydrate(schema, initialTree);
							assert(root instanceof Object, "object must be instanceof Object");
						});
					});

					describe("properties inherited from Object.prototype", () => {
						for (const [key, descriptor] of Object.entries(
							Object.getOwnPropertyDescriptors(Object.prototype),
						)) {
							it(`Object.getOwnPropertyDescriptor(${pretty(initialTree)}, ${key}) -> ${pretty(
								descriptor,
							)}`, () => {
								const root = hydrate(schema, initialTree);
								assert.deepEqual(
									Object.getOwnPropertyDescriptor(findObjectPrototype(root), key),
									descriptor,
									`Proxy must expose Object.prototype.${key}`,
								);
							});
						}
					});

					describe("methods inherited from Object.prototype", () => {
						it(`${pretty(initialTree)}.isPrototypeOf(Object.create(root)) -> true`, () => {
							const root = hydrate(schema, initialTree);
							const asObject = root as object;
							// eslint-disable-next-line no-prototype-builtins -- compatibility test
							assert.equal(asObject.isPrototypeOf(Object.create(asObject)), true);
						});

						it(`${pretty(initialTree)}.isPrototypeOf(root) -> false`, () => {
							const root = hydrate(schema, initialTree);
							const asObject = root as object;
							// eslint-disable-next-line no-prototype-builtins -- compatibility test
							assert.equal(asObject.isPrototypeOf(asObject), false);
						});
					});

					describe(`${pretty(initialTree)}.propertyIsEnumerable`, () => {
						for (const key of Object.getOwnPropertyNames(initialTree)) {
							const expected = Object.prototype.propertyIsEnumerable.call(initialTree, key);

							it(`${key} -> ${expected}`, () => {
								const root = hydrate(schema, initialTree);
								const asObject = root as object;
								// eslint-disable-next-line no-prototype-builtins -- compatibility test
								assert.equal(asObject.propertyIsEnumerable(key), expected);
							});
						}
					});
				},
			);
		});

		/**
		 * Creates a test out of applying the given function to both a structural clone of the initial tree object and a hydrated tree created from it for each test case.
		 * The results are asserted to be equal with nodes's assert.deepEqual.
		 */
		function test1(fn: (subject: object) => unknown) {
			unsafeMapErased(
				testCases,
				<const TSchema extends ImplicitFieldSchema>({
					initialTree,
					schema,
					name,
				}: TestCase<TSchema>) => {
					const pojo = structuredClone(initialTree) as object;

					it(name ?? `${pretty(pojo)} -> ${pretty(fn(pojo))}`, () => {
						const expected = fn(pojo);
						const node = hydrate(schema, initialTree);
						const actual = fn(node as object);
						assert.deepEqual(actual, expected);
					});
				},
			);
		}

		describe("Object.keys", () => {
			test1((subject) => Object.keys(subject));
		});

		describe("Object.values", () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			test1((subject) => Object.values(subject));
		});

		describe("Object.entries", () => {
			test1((subject) => Object.entries(subject));
		});

		// The ECMAScript standard recommends using Object.prototype.toString to detect
		// the class of an object.
		describe("Object.prototype.toString", () => {
			test1((subject) => Object.prototype.toString.call(subject));
		});

		describe("Object.prototype.toLocaleString", () => {
			test1((subject) => {
				try {
					return Object.prototype.toLocaleString.call(subject);
				} catch (error: unknown) {
					assert(error instanceof Error);
					// toLocaleString errors if there is a field named toString.
					return error.message;
				}
			});
		});

		// 'deepEqual' requires that objects have the same prototype to be considered equal.
		describe("Object.getPrototypeOf", () => {
			test1((subject) => Object.getPrototypeOf(subject) as unknown);
		});

		// 'deepEqual' enumerates and compares the enumerable own properties of objects
		describe("enumerable Object.getOwnPropertyDescriptors", () => {
			test1((subject) => {
				const all = Object.getOwnPropertyDescriptors(subject);
				return Object.fromEntries(
					Object.entries(all).filter(([key, descriptor]) => descriptor.enumerable),
				);
			});
		});

		// Enumerates keys configured as 'enumerable: true' (both own and inherited.)
		describe("for...in", () => {
			test1((subject) => {
				const result: string[] = [];
				// eslint-disable-next-line no-restricted-syntax, guard-for-in -- compatibility test
				for (const key in subject) {
					// For compatibility, we intentionally do not guard against inherited properties.
					result.push(key);
				}
				return result;
			});
		});

		// Validate that root.toString() === initialTree.toString()
		describe(".toString()", () => {
			test1((subject) => {
				try {
					// eslint-disable-next-line @typescript-eslint/no-base-to-string
					return subject.toString();
				} catch (error: unknown) {
					assert(error instanceof Error);
					// toString errors if there is a field named toString.
					return error.message;
				}
			});
		});

		// Validate that root.toLocaleString() === initialTree.toLocaleString()
		describe(".toLocaleString()", () => {
			test1((subject) => {
				try {
					return subject.toLocaleString();
				} catch (error: unknown) {
					assert(error instanceof Error);
					// toLocaleString errors if there is a field named toString.
					return error.message;
				}
			});
		});

		// Validate that JSON.stringify(root) === JSON.stringify(initialTree)
		describe("JSON.stringify()", () => {
			test1((subject) => JSON.stringify(subject));
		});
	});
}

const tcs: TestCaseErased[] = [
	test({
		schema: (() => {
			const _ = new SchemaFactory("testA");
			return _.object("empty", {});
		})(),
		initialTree: {},
	}),
	test({
		schema: (() => {
			const _ = new SchemaFactory("testB");
			return _.object("primitives", {
				boolean: _.boolean,
				number: _.number,
				string: _.string,
			});
		})(),
		initialTree: {
			boolean: false,
			number: Math.E,
			string: "",
		},
	}),
	test({
		name: "Empty tree, optional fields",
		schema: (() => {
			const _ = new SchemaFactory("testC");
			return _.object("optional", {
				boolean: _.optional(_.boolean),
				number: _.optional(_.number),
				string: _.optional(_.string),
			});
		})(),
		initialTree: {},
	}),
	test({
		schema: (() => {
			const _ = new SchemaFactory("testD");
			return _.object("optional (defined)", {
				boolean: _.optional(_.boolean),
				number: _.optional(_.number),
				string: _.optional(_.string),
			});
		})(),
		initialTree: {
			boolean: true,
			number: 0,
			string: "",
		},
	}),
	test({
		schema: (() => {
			const _ = new SchemaFactory("testE");

			const inner = _.object("inner", {});

			return _.object("outer", {
				nested: inner,
			});
		})(),
		initialTree: { nested: {} },
	}),
	// Case with explicit stored keys
	test({
		schema: (() => {
			const schemaFactoryInner = new SchemaFactory("testE");
			return schemaFactoryInner.object("object", {
				foo: schemaFactoryInner.optional(schemaFactoryInner.number),
				bar: schemaFactoryInner.optional(schemaFactoryInner.string, { key: "stable-bar" }),
				baz: schemaFactoryInner.required(
					[schemaFactoryInner.boolean, schemaFactoryInner.null],
					{ key: "stable-baz" },
				),
			});
		})(),
		initialTree: {
			foo: 42,
			bar: "hello world",
			baz: null,
		},
	}),
	// Case with omitted optional property
	test({
		schema: (() => {
			const schemaFactoryInner = new SchemaFactory("test-inner");
			return schemaFactoryInner.object("object", {
				foo: schemaFactoryInner.optional(schemaFactoryInner.number),
			});
		})(),
		initialTree: {
			// `foo` property omitted - property should be implicitly treated as `undefined`.
		},
	}),
	test({
		schema: (() => {
			const _ = new SchemaFactory("testF");
			return _.array(_.string);
		})(),
		initialTree: [],
	}),
	test({
		schema: (() => {
			const _ = new SchemaFactory("testG");
			return _.array(_.string);
		})(),
		initialTree: ["A"],
	}),
	test({
		schema: (() => {
			const _ = new SchemaFactory("testH");
			return _.array(_.string);
		})(),
		initialTree: ["A", "B"],
	}),
	test({
		name: "Special Keys",
		schema: (() => {
			const _ = new SchemaFactory("testI");
			return _.object("special keys", {
				value: _.number,
				[""]: _.number,
				set: _.number,
				__proto__: _.number,
				constructor: _.number,
				setting: _.number,
			});
		})(),
		initialTree: {
			value: 1,
			[""]: 2,
			set: 3,
			__proto__: 4,
			constructor: 5,
			setting: 6,
		},
	}),
	test({
		name: "toString key",
		schema: (() => {
			const _ = new SchemaFactory("testI");
			return _.object("special keys", {
				toString: _.number,
			});
		})(),
		initialTree: {
			toString: 1,
		},
	}),
];

testObjectLike(tcs);
