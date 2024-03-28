/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FlexFieldNodeSchema, FlexObjectNodeSchema } from "../../feature-libraries/index.js";
import {
	ImplicitFieldSchema,
	NodeKind,
	SchemaFactory,
	TreeFieldFromImplicitField,
	TreeNodeSchema,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { isReadonlyArray } from "../../util/index.js";
import { hydrate, pretty } from "./utils.js";

const schemaFactory = new SchemaFactory("Test");

interface TestCase<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
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
	describe("satisfies 'deepEqual'", () => {
		for (const { schema, initialTree } of testCases) {
			it(`deepEqual(${pretty(initialTree)})`, () => {
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

	/** Runs the provided function twice, once with a JS object and once with the equivalent object proxy, and checks that the same output is produced both times. */
	function testProxyBehavior(fn: (proxyOrJsObject: object) => unknown) {
		for (const { schema, initialTree } of testCases) {
			const real = structuredClone(initialTree) as object;
			const expected = fn(real);

			it(`${pretty(real)} -> ${pretty(expected)}`, () => {
				const proxy = hydrate(schema, initialTree);
				const actual = fn(proxy as object);
				assert.deepEqual(actual, expected);
			});
		}
	}

	describe("keys", () => {
		describe("Object.keys", () => {
			testProxyBehavior((proxyOrJsObject) => Object.keys(proxyOrJsObject));
		});

		describe("Reflect.ownKeys", () => {
			testProxyBehavior((proxyOrJsObject) => Reflect.ownKeys(proxyOrJsObject));
		});

		describe("for-in", () => {
			testProxyBehavior((proxyOrJsObject) => {
				const keys: string[] = [];
				// eslint-disable-next-line guard-for-in, no-restricted-syntax
				for (const key in proxyOrJsObject) {
					keys.push(key);
				}
				return keys;
			});
		});

		describe("key in", () => {
			for (const { schema, initialTree } of testCases) {
				const real = structuredClone(initialTree) as object;
				it(`keys of ${pretty(real)}`, () => {
					const proxy = hydrate(schema, initialTree);
					const flexSchema = toFlexSchema(schema);
					assert(typeof proxy === "object" && proxy !== null);
					const objectSchema = flexSchema.rootFieldSchema.monomorphicChildType;
					if (objectSchema instanceof FlexObjectNodeSchema) {
						// Iterate over all keys in the schema, not merely the keys in the object itself.
						// This simulates all keys that a user would realistically check with "in".
						// Iterating via "Object.keys()" or similar is insufficient since those keys are already filtered to exclude potentially problematic keys, e.g. keys with undefined values.
						for (const key of objectSchema.objectNodeFields.keys()) {
							assert.equal(key in proxy, key in real);
						}
					} else {
						assert(objectSchema instanceof FlexFieldNodeSchema);
						assert(isReadonlyArray(proxy));
						for (let i = 0; i < proxy.length; i++) {
							assert.equal(i in proxy, i in real);
						}
					}
				});
			}
		});
	});

	describe("Object.values", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		testProxyBehavior((proxyOrJsObject) => Object.values(proxyOrJsObject));
	});

	describe("Object.entries", () => {
		testProxyBehavior((proxyOrJsObject) => Object.entries(proxyOrJsObject));
	});

	// The ECMAScript standard recommends using Object.prototype.toString to detect
	// the class of an object.
	describe("Object.prototype.toString", () => {
		testProxyBehavior((proxyOrJsObject) => Object.prototype.toString.call(proxyOrJsObject));
	});

	describe("Object.prototype.toLocaleString", () => {
		testProxyBehavior((proxyOrJsObject) =>
			Object.prototype.toLocaleString.call(proxyOrJsObject),
		);
	});

	// 'deepEqual' requires that objects have the same prototype to be considered equal.
	describe("Object.getPrototypeOf", () => {
		testProxyBehavior((proxyOrJsObject) => Object.getPrototypeOf(proxyOrJsObject) as unknown);
	});

	// 'deepEqual' enumerates and compares the own properties of objects.
	describe("Object.getOwnPropertyDescriptors", () => {
		testProxyBehavior((proxyOrJsObject) => {
			return Object.getOwnPropertyDescriptors(proxyOrJsObject);
		});
	});

	// Enumerates keys configured as 'enumerable: true' (both own and inherited.)
	describe("for...in", () => {
		testProxyBehavior((proxyOrJsObject) => {
			const result: string[] = [];
			// eslint-disable-next-line no-restricted-syntax, guard-for-in -- compatibility test
			for (const key in proxyOrJsObject) {
				// For compatibility, we intentionally do not guard against inherited properties.
				result.push(key);
			}
			return result;
		});
	});

	// Validate that root.toString() === initialTree.toString()
	describe(".toString()", () => {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		testProxyBehavior((proxyOrJsObject) => proxyOrJsObject.toString());
	});

	// Validate that root.toLocaleString() === initialTree.toLocaleString()
	describe(".toLocaleString()", () => {
		testProxyBehavior((proxyOrJsObject) => proxyOrJsObject.toLocaleString());
	});

	// Validate that JSON.stringify(root) === JSON.stringify(initialTree)
	describe("JSON.stringify()", () => {
		testProxyBehavior((proxyOrJsObject) => JSON.stringify(proxyOrJsObject));
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
];

const factory = new SchemaFactory("test");

describe("Object-like", () => {
	testObjectLike(tcs);

	describe("setting a local field", () => {
		it("throws TypeError in POJO emulation mode", () => {
			const root = hydrate(schemaFactory.object("no fields", {}), {});
			assert.throws(() => {
				// The actual error "'TypeError: 'set' on proxy: trap returned falsish for property 'foo'"
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
