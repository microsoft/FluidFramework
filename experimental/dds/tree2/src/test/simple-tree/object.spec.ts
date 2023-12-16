/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ImplicitFieldSchema, SchemaFactory, TreeFieldFromImplicitField } from "../../class-tree";
import { getRoot, makeSchema, pretty } from "./utils";

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
	describe("Object-like", () => {
		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		describe.skip("satisfies 'deepEqual'", () => {
			for (const { schema, initialTree } of testCases) {
				const proxy = getRoot(schema, () => initialTree);
				const real = initialTree;

				it(`deepEqual(${pretty(proxy)}, ${pretty(real)})`, () => {
					assert.deepEqual(proxy, real, "Proxy must satisfy 'deepEqual'.");
				});
			}
		});

		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		describe.skip("inherits from Object.prototype", () => {
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
						const root = getRoot(schema, () => initialTree);
						assert(root instanceof Object, "object must be instanceof Object");
					});
				});

				describe("properties inherited from Object.prototype", () => {
					for (const [key, descriptor] of Object.entries(
						Object.getOwnPropertyDescriptors(Object.prototype),
					)) {
						it(`Object.getOwnPropertyDescriptor(${pretty(
							initialTree,
						)}, ${key}) -> ${pretty(descriptor)}`, () => {
							const root = getRoot(schema, () => initialTree);
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
						const root = getRoot(schema, () => initialTree);
						const asObject = root as object;
						// eslint-disable-next-line no-prototype-builtins -- compatibility test
						assert.equal(asObject.isPrototypeOf(Object.create(asObject)), true);
					});

					it(`${pretty(initialTree)}.isPrototypeOf(root) -> false`, () => {
						const root = getRoot(schema, () => initialTree);
						const asObject = root as object;
						// eslint-disable-next-line no-prototype-builtins -- compatibility test
						assert.equal(asObject.isPrototypeOf(asObject), false);
					});
				});

				describe(`${pretty(initialTree)}.propertyIsEnumerable`, () => {
					for (const key of Object.getOwnPropertyNames(initialTree)) {
						const expected = Object.prototype.propertyIsEnumerable.call(
							initialTree,
							key,
						);

						it(`${key} -> ${expected}`, () => {
							const root = getRoot(schema, () => initialTree);
							const asObject = root as object;
							// eslint-disable-next-line no-prototype-builtins -- compatibility test
							assert.equal(asObject.propertyIsEnumerable(key), expected);
						});
					}
				});
			}
		});

		function test1(fn: (subject: object) => unknown) {
			for (const { schema, initialTree } of testCases) {
				const real = structuredClone(initialTree) as object;
				const expected = fn(real);

				it(`${pretty(real)} -> ${pretty(expected)}`, () => {
					const proxy = getRoot(schema, () => initialTree);
					const actual = fn(proxy as object);
					assert.deepEqual(actual, expected);
				});
			}
		}

		describe("Object.keys", () => {
			test1((subject) => Object.keys(subject));
		});

		// TODO: Make 'class-schema' property values match original object.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		describe.skip("Object.values", () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			test1((subject) => Object.values(subject));
		});

		// TODO: Make 'class-schema' property values match original object.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		describe.skip("Object.entries", () => {
			test1((subject) => Object.entries(subject));
		});

		// The ECMAScript standard recommends using Object.prototype.toString to detect
		// the class of an object.
		describe("Object.prototype.toString", () => {
			test1((subject) => Object.prototype.toString.call(subject));
		});

		describe("Object.prototype.toLocaleString", () => {
			test1((subject) => Object.prototype.toLocaleString.call(subject));
		});

		// 'deepEqual' requires that objects have the same prototype to be considered equal.
		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		describe.skip("Object.getPrototypeOf", () => {
			test1((subject) => Object.getPrototypeOf(subject) as unknown);
		});

		// 'deepEqual' enumerates and compares the own properties of objects.
		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		describe.skip("Object.getOwnPropertyDescriptors", () => {
			test1((subject) => {
				return Object.getOwnPropertyDescriptors(subject);
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
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			test1((subject) => subject.toString());
		});

		// Validate that root.toLocaleString() === initialTree.toLocaleString()
		describe(".toLocaleString()", () => {
			test1((subject) => subject.toLocaleString());
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
			const _ = new SchemaFactory("test");
			return _.object("empty", {});
		})(),
		initialTree: {},
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("test");
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
			const _ = new SchemaFactory("test");
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
			const _ = new SchemaFactory("test");
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
			const _ = new SchemaFactory("test");

			const inner = _.object("inner", {});

			return _.object("outer", {
				nested: inner,
			});
		})(),
		initialTree: { nested: {} },
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("test");
			return _.array(_.string);
		})(),
		initialTree: [],
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("test");
			return _.array(_.string);
		})(),
		initialTree: ["A"],
	},
	{
		schema: (() => {
			const _ = new SchemaFactory("test");
			return _.array(_.string);
		})(),
		initialTree: ["A", "B"],
	},
];

testObjectLike(tcs);

describe("Object-like", () => {
	describe("setting an invalid field", () => {
		// TODO: Restore original behavior for bare '_.object()'?
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		it.skip("throws TypeError in strict mode", () => {
			const root = getRoot(
				makeSchema((_) => _.object("no fields", {})),
				() => ({}),
			);
			assert.throws(() => {
				// The actual error "'TypeError: 'set' on proxy: trap returned falsish for property 'foo'"
				(root as unknown as any).foo = 3;
			}, "attempting to set an invalid field must throw.");
		});
	});

	describe("supports setting", () => {
		describe("primitives", () => {
			function check<const TSchema extends ImplicitFieldSchema>(
				schema: TSchema,
				before: TreeFieldFromImplicitField<TSchema>,
				after: TreeFieldFromImplicitField<TSchema>,
			) {
				describe(`required ${typeof before} `, () => {
					it(`(${pretty(before)} -> ${pretty(after)})`, () => {
						const root = getRoot(
							makeSchema((_) => _.object("", { _value: schema })),
							() => ({ _value: before }),
						);
						assert.equal(root._value, before);
						root._value = after;
						assert.equal(root._value, after);
					});
				});

				describe(`optional ${typeof before}`, () => {
					it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
						const root = getRoot(
							// Is there a way to avoid the cast to 'any' when using 'class-schema'?
							// TODO: https://dev.azure.com/fluidframework/internal/_workitems/edit/6551
							makeSchema((_) => _.object("", { _value: _.optional(schema as any) })),
							() => ({ _value: undefined }),
						);
						assert.equal(root._value, undefined);
						root._value = before;
						assert.equal(root._value, before);
						root._value = after;
						assert.equal(root._value, after);
					});
				});
			}

			check(
				makeSchema((_) => _.boolean),
				false,
				true,
			);
			check(
				makeSchema((_) => _.number),
				0,
				1,
			);
			check(
				makeSchema((_) => _.string),
				"",
				"!",
			);
		});

		describe("required object", () => {
			const schema = makeSchema((_) =>
				_.object("parent", {
					child: _.object("child", {
						objId: _.number,
					}),
				}),
			);

			const before = { objId: 0 };
			const after = { objId: 1 };

			it(`(${pretty(before)} -> ${pretty(after)})`, () => {
				const root = getRoot(schema, () => ({ child: before }));
				assert.equal(root.child.objId, 0);
				root.child = after;
				assert.equal(root.child.objId, 1);
			});
		});

		describe("optional object", () => {
			const schema = makeSchema((_) =>
				_.object("parent", {
					child: _.optional(
						_.object("child", {
							objId: _.number,
						}),
					),
				}),
			);

			const before = { objId: 0 };
			const after = { objId: 1 };

			it(`(undefined -> ${pretty(before)} -> ${pretty(after)})`, () => {
				const root = getRoot(schema, () => ({ child: undefined }));
				assert.equal(root.child, undefined);
				root.child = before;
				assert.equal(root.child.objId, 0);
				root.child = after;
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
