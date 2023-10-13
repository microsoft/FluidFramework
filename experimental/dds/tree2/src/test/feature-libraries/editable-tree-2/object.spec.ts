/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder, TypedSchemaCollection } from "../../../feature-libraries";
import { leaf } from "../../../domains";

import { createTreeView, pretty } from "./utils";

interface TestCase {
	initialTree: object;
	schema: TypedSchemaCollection;
}

function testObjectLike(testCases: TestCase[]) {
	describe("Object-like", () => {
		describe("Satisfies 'deepEquals'", () => {
			for (const testCase of testCases) {
				const view = createTreeView(testCase.schema, testCase.initialTree);
				const real = testCase.initialTree;
				const proxy = view.root2(testCase.schema);

				it(`deepEquals(${pretty(proxy)}, ${pretty(real)})`, () => {
					assert.deepEqual(proxy, real);
				});
			}
		});

		function test1(fn: (subject: object) => unknown) {
			for (const testCase of testCases) {
				const view = createTreeView(testCase.schema, testCase.initialTree);
				const real = structuredClone(testCase.initialTree);
				const proxy = view.root2(testCase.schema);

				assert.deepEqual(proxy, real, "Proxy must satisfy 'deepEquals'.");

				const expected = fn(real);

				it(`${pretty(real)} -> ${pretty(expected)}`, () => {
					const actual = fn(proxy);
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
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
			const $ = _.struct("empty", {});
			return _.toDocumentSchema($);
		})(),
		initialTree: {},
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
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
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
			const $ = _.struct("optional (undefined)", {
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
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
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
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });

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
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
			const $ = _.fieldNode("List<string> len(0)", _.sequence(leaf.string));
			return _.toDocumentSchema($);
		})(),
		initialTree: [],
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
			const $ = _.fieldNode("List<string> len(1)", _.sequence(leaf.string));
			return _.toDocumentSchema($);
		})(),
		initialTree: ["A"],
	},
	{
		schema: (() => {
			const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
			const $ = _.fieldNode("List<string> len(2)", _.sequence(leaf.string));
			return _.toDocumentSchema($);
		})(),
		initialTree: ["A", "B"],
	},
];

testObjectLike(tcs);
