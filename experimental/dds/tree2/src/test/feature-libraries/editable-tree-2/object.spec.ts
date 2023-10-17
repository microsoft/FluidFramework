/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { LeafSchema, DocumentSchema } from "../../../feature-libraries";
import { leaf, SchemaBuilder } from "../../../domains";

// eslint-disable-next-line import/no-internal-modules
import { TypedValue } from "../../../feature-libraries/schema-aware/internal";
import { createTreeView, itWithRoot, makeSchema, pretty } from "./utils";

interface TestCase {
	initialTree: object;
	schema: DocumentSchema;
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
		describe("satisfies 'deepEquals'", () => {
			for (const { schema, initialTree } of testCases) {
				const view = createTreeView(schema, initialTree);
				const real = initialTree;
				const proxy = view.root2(schema);

				// We do not use 'itWithRoot()' so we can pretty-print the 'proxy' in the test title.
				it(`deepEquals(${pretty(proxy)}, ${pretty(real)})`, () => {
					assert.deepEqual(proxy, real, "Proxy must satisfy 'deepEquals'.");
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
				itWithRoot(
					`${pretty(initialTree)} instanceof Object`,
					schema,
					initialTree,
					(root) => {
						assert(root instanceof Object, "object must be instanceof Object");
					},
				);

				for (const [key, descriptor] of Object.entries(
					Object.getOwnPropertyDescriptors(Object.prototype),
				)) {
					itWithRoot(`${key} -> ${pretty(descriptor)}}`, schema, initialTree, (root) => {
						assert.deepEqual(
							Object.getOwnPropertyDescriptor(findObjectPrototype(root), key),
							descriptor,
							`Proxy must expose Object.prototype.${key}`,
						);
					});
				}
			}
		});

		function test1(fn: (subject: object) => unknown) {
			for (const { schema, initialTree } of testCases) {
				const real = structuredClone(initialTree);
				const expected = fn(real);

				itWithRoot(
					`${pretty(real)} -> ${pretty(expected)}`,
					schema,
					initialTree,
					(proxy) => {
						const actual = fn(proxy as object);
						assert.deepEqual(actual, expected);
					},
				);
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

		// 'deepEquals' requires that objects have the same prototype to be considered equal.
		describe("Object.getPrototypeOf", () => {
			test1((subject) => Object.getPrototypeOf(subject) as unknown);
		});

		// 'deepEquals' enumerates and compares the own properties of objects.
		describe("Object.getOwnPropertyDescriptors", () => {
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

		// Enumerates keys configured as 'enumerable: true' (both own and inherited.)
		describe("JSON.stringify()", () => {
			test1((subject) => JSON.stringify(subject));
		});
	});
}

const tcs: TestCase[] = [
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.struct("empty", {});
			return _.toDocumentSchema($);
		})(),
		initialTree: {},
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.struct("primitives", {
				boolean: leaf.boolean,
				number: leaf.number,
				string: leaf.string,
			});
			return _.toDocumentSchema($);
		})(),
		initialTree: {
			boolean: false,
			number: NaN,
			string: "",
		},
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.struct("optional", {
				boolean: _.optional(leaf.boolean),
				number: _.optional(leaf.number),
				string: _.optional(leaf.string),
			});
			return _.toDocumentSchema($);
		})(),
		initialTree: {},
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.struct("optional (defined)", {
				boolean: _.optional(leaf.boolean),
				number: _.optional(leaf.number),
				string: _.optional(leaf.string),
			});
			return _.toDocumentSchema($);
		})(),
		initialTree: {
			boolean: true,
			number: -0,
			string: "",
		},
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });

			const inner = _.struct("inner", {});

			const $ = _.struct("outer", {
				nested: inner,
			});

			return _.toDocumentSchema($);
		})(),
		initialTree: { nested: {} },
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.fieldNode("List<string> len(0)", _.sequence(leaf.string));
			return _.toDocumentSchema($);
		})(),
		initialTree: [],
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.fieldNode("List<string> len(1)", _.sequence(leaf.string));
			return _.toDocumentSchema($);
		})(),
		initialTree: ["A"],
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test" });
			const $ = _.fieldNode("List<string> len(2)", _.sequence(leaf.string));
			return _.toDocumentSchema($);
		})(),
		initialTree: ["A", "B"],
	},
];

testObjectLike(tcs);

describe("Object-like", () => {
	describe("setting an invalid field", () => {
		itWithRoot(
			"throws TypeError in strict mode",
			makeSchema((_) => _.struct("no fields", {})),
			{},
			(root) => {
				assert.throws(() => {
					// The actual error "'TypeError: 'set' on proxy: trap returned falsish for property 'foo'"
					(root as any).foo = 3;
				}, "attempting to set an invalid field must throw.");
			},
		);
	});

	describe("supports setting", () => {
		describe("primitives", () => {
			function check<const TSchema extends LeafSchema>(
				schema: LeafSchema,
				before: TypedValue<TSchema["leafValue"]>,
				after: TypedValue<TSchema["leafValue"]>,
			) {
				describe(`required ${typeof before} `, () => {
					itWithRoot(
						`(${pretty(before)} -> ${pretty(after)})`,
						makeSchema((_) => _.struct("", { _value: schema })),
						{ _value: before },
						(root) => {
							assert.equal(root._value, before);
							root._value = after;
							assert.equal(root._value, after);
						},
					);
				});

				describe(`optional ${typeof before}`, () => {
					itWithRoot(
						`(undefined -> ${pretty(before)} -> ${pretty(after)})`,
						makeSchema((_) => _.struct("", { _value: _.optional(schema) })),
						{ _value: undefined },
						(root) => {
							assert.equal(root._value, undefined);
							root._value = before;
							assert.equal(root._value, before);
							root._value = after;
							assert.equal(root._value, after);
						},
					);
				});
			}

			check(leaf.boolean, false, true);
			check(leaf.number, 0, 1);
			check(leaf.string, "", "!");
		});

		describe("required object", () => {
			const _ = new SchemaBuilder({ scope: "test" });
			const child = _.struct("child", {
				objId: _.number,
			});
			const parent = _.struct("parent", {
				child,
			});
			const schema = _.toDocumentSchema(parent);

			const before = { objId: 0 };
			const after = { objId: 1 };

			itWithRoot(
				`(${pretty(before)} -> ${pretty(after)})`,
				schema,
				{ child: before },
				(root) => {
					assert.equal(root.child.objId, 0);
					root.child = after;
					assert.equal(root.child.objId, 1);
				},
			);
		});

		describe("optional object", () => {
			const _ = new SchemaBuilder({ scope: "test" });
			const child = _.struct("child", {
				objId: _.number,
			});
			const parent = _.struct("parent", {
				child: _.optional(child),
			});
			const schema = _.toDocumentSchema(parent);

			const before = { objId: 0 };
			const after = { objId: 1 };

			itWithRoot(
				`(undefined -> ${pretty(before)} -> ${pretty(after)})`,
				schema,
				// TODO: Remove explicit undefined once implicit undefined is supported.
				{ child: undefined },
				(root) => {
					assert.equal(root.child, undefined);
					root.child = before;
					assert.equal(root.child.objId, 0);
					root.child = after;
					assert.equal(root.child.objId, 1);
				},
			);
		});

		describe.skip("required list", () => {
			// const _ = new SchemaBuilder({ scope: "test" });
			// const list = _.fieldNode("List<string>", _.sequence(leaf.string));
			// const parent = _.struct("parent", {
			// 	list,
			// });
			// const schema = _.toDocumentSchema(parent);
			// const before: string[] = [];
			// const after = ["A"];
			// itWithRoot(
			// 	`(${pretty(before)} -> ${pretty(after)})`,
			// 	schema,
			// 	{ list: before },
			// 	(root) => {
			// 		assert.deepEqual(root.list, before);
			// 		root.list = after;
			// 		assert.deepEqual(root.list, after);
			// 	},
			// );
		});

		describe.skip("optional list", () => {
			// const _ = new SchemaBuilder({ scope: "test" });
			// const list = _.fieldNode("List<string>", _.sequence(leaf.string));
			// const parent = _.struct("parent", {
			// 	list: _.optional(list),
			// });
			// const schema = _.toDocumentSchema(parent);
			// const before: string[] = [];
			// const after = ["A"];
			// itWithRoot(
			// 	`(undefined -> ${pretty(before)} -> ${pretty(after)})`,
			// 	schema,
			// 	// TODO: Remove explicit undefined once implicit undefined is supported.
			// 	{ list: undefined },
			// 	(root) => {
			// 		assert.equal(root.list, undefined);
			// 		root.list = before;
			// 		assert.deepEqual(root.list, before);
			// 		root.list = after;
			// 		assert.deepEqual(root.list, after);
			// 	},
			// );
		});

		describe("required map", () => {
			// TODO
		});

		describe("optional map", () => {
			// TODO
		});
	});
});
