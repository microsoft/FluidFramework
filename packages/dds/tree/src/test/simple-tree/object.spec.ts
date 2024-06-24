/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type ImplicitFieldSchema,
	type NodeKind,
	SchemaFactory,
	type TreeFieldFromImplicitField,
	type TreeNodeSchema,
} from "../../simple-tree/index.js";

import { hydrate, pretty } from "./utils.js";

const schemaFactory = new SchemaFactory("Test");

interface TestCase<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
	name?: string;
	schema: TSchema;
	initialTree: TreeFieldFromImplicitField<TSchema>;
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

function testObjectLike(testCases: TestCase[]) {
	describe("Object-like", () => {
		describe("satisfies 'deepEqual'", () => {
			for (const { schema, initialTree, name } of testCases) {
				it(name ?? pretty(initialTree).toString(), () => {
					const proxy = hydrate(schema, initialTree);
					assert.deepEqual(proxy, initialTree, "Proxy must satisfy 'deepEqual'.");
				});
			}
		});

		describe("inherits from Object.prototype", () => {
			function findObjectPrototype(o: unknown) {
				return Object.getPrototypeOf(
					// If 'root' is an array, the immediate prototype is Array.prototype.  We need to go
					// one additional level to get Object.prototype.
					Array.isArray(o) ? Object.getPrototypeOf(o) : o,
				) as object;
			}

			for (const { schema, initialTree } of testCases) {
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
			}
		});

		/**
		 * Creates a test out of applying the given function to both a structural clone of the initial tree object and a hydrated tree created from it for each test case.
		 * The results are asserted to be equal with nodes's assert.deepEqual.
		 */
		function test1(fn: (subject: object) => unknown) {
			for (const { schema, initialTree, name } of testCases) {
				const pojo = structuredClone(initialTree) as object;

				it(name ?? `${pretty(pojo)} -> ${pretty(fn(pojo))}`, () => {
					const expected = fn(pojo);
					const node = hydrate(schema, initialTree);
					const actual = fn(node as object);
					assert.deepEqual(actual, expected);
				});
			}
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
				} catch (e: unknown) {
					assert(e instanceof Error);
					// toLocaleString errors if there is a field named toString.
					return e.message;
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
				} catch (e: unknown) {
					assert(e instanceof Error);
					// toString errors if there is a field named toString.
					return e.message;
				}
			});
		});

		// Validate that root.toLocaleString() === initialTree.toLocaleString()
		describe(".toLocaleString()", () => {
			test1((subject) => {
				try {
					return subject.toLocaleString();
				} catch (e: unknown) {
					assert(e instanceof Error);
					// toLocaleString errors if there is a field named toString.
					return e.message;
				}
			});
		});

		// Validate that JSON.stringify(root) === JSON.stringify(initialTree)
		describe("JSON.stringify()", () => {
			test1((subject) => JSON.stringify(subject));
		});
	});
}

const tcs: TestCase[] = [
	{
		schema: (() => {
			const _ = new SchemaFactory("testA");
			return _.object("empty", {});
		})(),
		initialTree: {},
	},
	{
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
	},
	{
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
	},
	{
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
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("testE");

			const inner = _.object("inner", {});

			return _.object("outer", {
				nested: inner,
			});
		})(),
		initialTree: { nested: {} },
	},
	// Case with explicit stored keys
	{
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
	},
	// Case with omitted optional property
	{
		schema: (() => {
			const schemaFactoryInner = new SchemaFactory("test-inner");
			return schemaFactoryInner.object("object", {
				foo: schemaFactoryInner.optional(schemaFactoryInner.number),
			});
		})(),
		initialTree: {
			// `foo` property omitted - property should be implicitly treated as `undefined`.
		},
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("testF");
			return _.array(_.string);
		})(),
		initialTree: [],
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("testG");
			return _.array(_.string);
		})(),
		initialTree: ["A"],
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("testH");
			return _.array(_.string);
		})(),
		initialTree: ["A", "B"],
	},
	{
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
	},
	{
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
	},
];

testObjectLike(tcs);

const factory = new SchemaFactory("test");

describe("Object-like-2", () => {
	describe("setting an local field", () => {
		it("throws TypeError in POJO emulation mode", () => {
			const root = hydrate(schemaFactory.object("no fields", {}), {});
			assert.throws(() => {
				// The actual error "'TypeError: 'set' on proxy: trap returned falsish for property 'foo'"
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(root as unknown as any).foo = 3;
			}, "attempting to set an invalid field must throw.");
		});

		it("works in Customizable mode", () => {
			class Custom extends schemaFactory.object("no fields", {}) {
				public foo?: number;
			}
			const root = hydrate(Custom, {});
			root.foo = 3;
		});
	});

	describe("deep equality and types", () => {
		it("types are ignored in POJO emulation mode", () => {
			const a = hydrate(schemaFactory.object("a", {}), {});
			const b = hydrate(schemaFactory.object("b", {}), {});
			assert.deepEqual(a, {});
			assert.deepEqual(a, b);
		});

		it("types are compared in Customizable mode", () => {
			class A extends schemaFactory.object("a", {}) {}
			class B extends schemaFactory.object("b", {}) {}
			const a = hydrate(A, {});
			const b = hydrate(B, {});
			assert.notDeepEqual(a, {});
			assert.notDeepEqual(a, b);
			const a2 = hydrate(A, {});
			assert.deepEqual(a, a2);
		});
	});

	describe("supports setting", () => {
		describe("primitives", () => {
			function check<const TNode>(
				schema: TreeNodeSchema<string, NodeKind, TNode>,
				before: TNode,
				after: TNode,
			) {
				describe(`required ${typeof before} `, () => {
					it(`(${pretty(before)} -> ${pretty(after)})`, () => {
						const Root = factory.object("", { value: schema });
						const root = hydrate(Root, { value: before });
						assert.equal(root.value, before);
						root.value = after;
						assert.equal(root.value, after);
					});
				});

				describe(`optional ${typeof before}`, () => {
					it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
						const root = hydrate(
							schemaFactory.object("", { value: schemaFactory.optional(schema) }),
							{ value: undefined },
						);
						assert.equal(root.value, undefined);
						root.value = before;
						assert.equal(root.value, before);
						root.value = after;
						assert.equal(root.value, after);
					});
				});
			}

			check(schemaFactory.boolean, false, true);
			check(schemaFactory.number, 0, 1);
			check(schemaFactory.string, "", "!");
		});

		describe("required object", () => {
			const Child = factory.object("child", {
				objId: factory.number,
			});
			const Schema = factory.object("parent", {
				child: Child,
			});

			const before = { objId: 0 };
			const after = { objId: 1 };

			it(`(${pretty(before)} -> ${pretty(after)})`, () => {
				const root = hydrate(Schema, { child: before });
				assert.equal(root.child.objId, 0);
				root.child = new Child(after);
				assert.equal(root.child.objId, 1);
			});
		});

		describe("optional object", () => {
			const Child = factory.object("child", {
				objId: factory.number,
			});
			const Schema = factory.object("parent", {
				child: factory.optional(Child),
			});

			const before = { objId: 0 };
			const after = { objId: 1 };

			it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
				const root = hydrate(Schema, { child: undefined });
				assert.equal(root.child, undefined);
				root.child = new Child(before);
				assert.equal(root.child.objId, 0);
				root.child = new Child(after);
				assert.equal(root.child.objId, 1);
			});
		});

		describe.skip("required list", () => {
			// const _ = new SchemaFactory("test");
			// const list = _.fieldNode("List<string>", _.sequence(_.string));
			// const parent = _.struct("parent", {
			// 	list,
			// });
			// const schema = _.intoSchema(parent);
			// const before: string[] = [];
			// const after = ["A"];
			// it(`(${pretty(before)} -> ${pretty(after)})`, () => {
			// 	const root = getRoot(schema, { list: before });
			// 	assert.deepEqual(root.list, before);
			// 	root.list = after;
			// 	assert.deepEqual(root.list, after);
			// });
		});

		describe.skip("optional list", () => {
			// const _ = new SchemaFactory("test");
			// const list = _.fieldNode("List<string>", _.sequence(_.string));
			// const parent = _.struct("parent", {
			// 	list: _.optional(list),
			// });
			// const schema = _.intoSchema(parent);
			// const before: string[] = [];
			// const after = ["A"];
			// it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
			// 	const root = getRoot(schema, { list: undefined });
			// 	assert.equal(root.list, undefined);
			// 	root.list = before;
			// 	assert.deepEqual(root.list, before);
			// 	root.list = after;
			// 	assert.deepEqual(root.list, after);
			// });
		});

		describe("required map", () => {
			// TODO
		});

		describe("optional map", () => {
			// TODO
		});
	});
});
