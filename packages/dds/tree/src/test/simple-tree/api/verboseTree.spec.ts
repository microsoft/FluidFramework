/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import { testSpecializedCursor, type TestTree } from "../../cursorTestSuite.js";

import { SchemaFactory, type EncodeOptions } from "../../../simple-tree/index.js";

import {
	applySchemaToParserOptions,
	cursorFromVerbose,
	replaceVerboseTreeHandles,
	verboseFromCursor,
	type ParseOptions,
	type VerboseTree,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/verboseTree.js";
import type { ITreeCursor } from "../../../core/index.js";
import { cursorForJsonableTreeNode } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";

const schema = new SchemaFactory("Test");

describe("simple-tree verboseTree", () => {
	describe("applySchemaToParserOptions", () => {
		it("keyConverter", () => {
			class A extends schema.object("A", {
				a: schema.number,
				b: schema.required(schema.number, { key: "stored" }),
			}) {}
			class B extends schema.object("B", {
				b: schema.number,
			}) {}
			{
				const options = applySchemaToParserOptions([A, B], {
					useStoredKeys: false,
				});
				assert(options.keyConverter !== undefined);
				assert.equal(options.keyConverter.parse(A.identifier, "a"), "a");
				assert.equal(options.keyConverter.parse(A.identifier, "b"), "stored");
				assert.equal(options.keyConverter.parse(B.identifier, "b"), "b");
				assert.equal(options.keyConverter.encode(A.identifier, brand("a")), "a");
				assert.equal(options.keyConverter.encode(A.identifier, brand("stored")), "b");
				assert.equal(options.keyConverter.encode(B.identifier, brand("b")), "b");
			}
			{
				const options = applySchemaToParserOptions([A, B], {
					useStoredKeys: true,
				});
				assert(options.keyConverter === undefined);
			}
			{
				const options = applySchemaToParserOptions([A, B], {});
				assert(options.keyConverter !== undefined);
				assert.equal(options.keyConverter.encode(A.identifier, brand("stored")), "b");
				assert.equal(options.keyConverter.parse(A.identifier, "b"), "stored");
			}
		});
	});

	describe("verboseFromCursor", () => {
		it("minimal", () => {
			const encodeOptions: EncodeOptions = {};
			class TestObject extends schema.object("T", {}) {}
			const cursor = cursorForJsonableTreeNode({ type: brand("Test.T") });
			const verbose = verboseFromCursor(cursor, TestObject, encodeOptions);
			assert.deepEqual(verbose, { type: "Test.T", fields: {} });
		});
	});

	describe("verboseTreeAdapter", () => {
		class TestObject extends schema.object("A", {
			a: schema.optional(schema.number),
			b: schema.optional(schema.number, { key: "stored" }),
		}) {}
		class TestMap extends schema.map("M", [schema.number, TestObject]) {}

		const sharedCases: readonly VerboseTree[] = [
			"leaf",
			null,
			{ type: TestObject.identifier, fields: { a: 1 } },
			{ type: TestMap.identifier, fields: {} },
			{ type: TestMap.identifier, fields: { a: 1 } },
			{ type: TestMap.identifier, fields: { b: 2, c: 3 } },
			{
				type: TestMap.identifier,
				fields: { a: { type: TestObject.identifier, fields: { a: 1 } } },
			},
		];

		const storedKeyCases: readonly VerboseTree[] = [
			...sharedCases,
			{ type: TestObject.identifier, fields: { stored: 2 } },
			{ type: TestObject.identifier, fields: { a: 1, stored: 2 } },
			{
				type: TestMap.identifier,
				fields: { a: { type: TestObject.identifier, fields: { stored: 1 } } },
			},
		];

		const propertyKeyCases: readonly VerboseTree[] = [
			...sharedCases,
			{ type: TestObject.identifier, fields: { b: 2 } },
			{ type: TestObject.identifier, fields: { a: 1, b: 2 } },
			{
				type: TestMap.identifier,
				fields: { a: { type: TestObject.identifier, fields: { b: 1 } } },
			},
		];

		const RootSchema = [TestMap, TestObject, schema.string, schema.null] as const;

		for (const useStoredKeys of [false, true]) {
			describe(useStoredKeys ? "stored keys" : "property keys", () => {
				const testTrees: TestTree<VerboseTree>[] = [];

				for (const testCase of useStoredKeys ? storedKeyCases : propertyKeyCases) {
					testTrees.push({
						name: JSON.stringify(testCase),
						dataFactory: () => testCase,
					});
				}

				const options: ParseOptions = {
					useStoredKeys,
				};
				const encodeOptions: EncodeOptions = {
					useStoredKeys,
				};

				const finalOptions = applySchemaToParserOptions(RootSchema, options);

				testSpecializedCursor<VerboseTree, ITreeCursor>({
					cursorName: "verboseTree",
					cursorFactory: (data) => cursorFromVerbose(data, finalOptions),
					dataFromCursor: (cursor) => verboseFromCursor(cursor, RootSchema, encodeOptions),
					testData: testTrees,
					builders: {
						withKeys: (keys) => {
							const obj = {};
							for (const key of keys) {
								Object.defineProperty(obj, key, {
									enumerable: true,
									configurable: true,
									writable: true,
									value: 5, // Arbitrary child node value
								});
							}
							return { type: TestMap.identifier, fields: obj };
						},
					},
				});
			});
		}
	});

	describe("replaceVerboseTreeHandles", () => {
		it("no handles", () => {
			const tree = { type: "a", fields: { b: 1 } };
			const clone = replaceVerboseTreeHandles(tree, () => {
				fail();
			});
			assert.notEqual(clone, tree);
			assert.deepEqual(clone, tree);
		});

		it("handles", () => {
			const tree = { type: "a", fields: { b: new MockHandle(1) } };
			const clone = replaceVerboseTreeHandles(tree, () => "handle");
			assert.deepEqual(clone, { type: "a", fields: { b: "handle" } });
		});
	});
});
