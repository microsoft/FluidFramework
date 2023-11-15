/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { createProxyTreeAdapter } from "../../../feature-libraries/simple-tree/proxyNodeCursor";
import { SchemaBuilder } from "../../../domains";
import { viewWithContent } from "../../utils";
import { brand } from "../../../util";
import { EmptyKey } from "../../../core";

// Note: the behaviors here are more heavily tested by `proxies.spec.ts`.
// This adds some basic unit test for the generated cursor adapter, but since the adapter is an implementation
// detail of the proxy API, deep coverage at this level was not prioritized.
describe.only("cursorFromProxyTree", () => {
	it("object", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.object("object", {
			a: schemaBuilder.string,
			b: schemaBuilder.list(schemaBuilder.number),
			c: schemaBuilder.map([schemaBuilder.string, schemaBuilder.number]),
			d: schemaBuilder.optional(schemaBuilder.number),
		});
		const schema = schemaBuilder.intoSchema(rootSchema);

		const a = "Hello world";
		const b = [42, 37, -1];
		const cEntries: [string, string | number][] = [
			["foo", 0],
			["bar", "1"],
			["baz", 2],
		];
		const c = new Map<string, number | string>(cEntries);

		const view = viewWithContent({
			schema,
			initialTree: {
				a,
				b,
				c,
				d: undefined,
			} as any,
		});
		const root = view.root;

		const adapter = createProxyTreeAdapter(view.context, schema.rootFieldSchema.types);

		assert.equal(adapter.value(root), undefined);
		assert.equal(adapter.type(root), rootSchema.name);

		const rootKeys = adapter.keysFromNode(root);
		assert.deepEqual(rootKeys, ["a", "b", "c"]); // We don't expect `d` because it is optional and missing.

		const fieldA = adapter.getFieldFromNode(root, brand("a"));
		assert.equal(fieldA.length, 1);
		assert.deepEqual(fieldA[0], a);

		const fieldB = adapter.getFieldFromNode(root, brand("b"));
		assert.equal(fieldB.length, 1);
		assert.deepEqual(fieldB[0], b);

		const fieldC = adapter.getFieldFromNode(root, brand("c"));
		assert.equal(fieldC.length, 1);
		assert.deepEqual(Array.from((fieldC[0] as Map<string, unknown>).entries()), cEntries);

		const fieldD = adapter.getFieldFromNode(root, brand("d"));
		assert.equal(fieldD.length, 0);

		const fieldE = adapter.getFieldFromNode(root, brand("e")); // No such property as "e" in the schema or initial tree
		assert.equal(fieldE.length, 0);

		// Quick test of recursive invokation
		assert.equal(adapter.value(root.a), a);
		assert.equal(adapter.type(root.a), schemaBuilder.string.name);
		assert.deepEqual(adapter.keysFromNode(root.a), []);
	});

	it("string", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const schema = schemaBuilder.intoSchema(schemaBuilder.string);

		const view = viewWithContent({
			schema,
			initialTree: "Hello world",
		});
		const root = view.root;

		const adapter = createProxyTreeAdapter(view.context, schema.rootFieldSchema.types);

		assert.equal(adapter.value(root), "Hello world");
		assert.equal(adapter.type(root), schemaBuilder.string.name);

		const rootKeys = adapter.keysFromNode(root);
		assert.deepEqual(rootKeys, []);
	});

	it("list", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.list("list", [schemaBuilder.number]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const entries = [42, 37, -1];

		const view = viewWithContent({
			schema,
			initialTree: entries as any,
		});
		const root = view.root;

		const adapter = createProxyTreeAdapter(view.context, schema.rootFieldSchema.types);

		assert.equal(adapter.value(root), undefined);
		assert.equal(adapter.type(root), rootSchema.name);

		const rootKeys = adapter.keysFromNode(root);
		assert.deepEqual(rootKeys, [EmptyKey]);

		const field = adapter.getFieldFromNode(root, EmptyKey);
		assert.deepEqual(field, entries);
	});

	it("map", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.map("map", [
			schemaBuilder.number,
			schemaBuilder.string,
			schemaBuilder.boolean,
		]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const entries: [string, boolean | number | string | undefined][] = [
			["a", 42],
			["b", "Hello world"],
			["c", false],
			// ["d", undefined],
		];

		const view = viewWithContent({
			schema,
			initialTree: new Map<string, boolean | number | string | undefined>(entries) as any,
		});
		const root = view.root;

		const adapter = createProxyTreeAdapter(view.context, schema.rootFieldSchema.types);

		assert.equal(adapter.value(root), undefined);
		assert.equal(adapter.type(root), rootSchema.name);

		const rootKeys = adapter.keysFromNode(root);
		assert.deepEqual(rootKeys, ["a", "b", "c"]); // We don't expect `d` because it is optional and missing.

		const fieldA = adapter.getFieldFromNode(root, brand("a"));
		assert.equal(fieldA.length, 1);
		assert.deepEqual(fieldA[0], 42);

		const fieldB = adapter.getFieldFromNode(root, brand("b"));
		assert.equal(fieldB.length, 1);
		assert.deepEqual(fieldB[0], "Hello world");

		const fieldC = adapter.getFieldFromNode(root, brand("c"));
		assert.equal(fieldC.length, 1);
		assert.deepEqual(fieldC[0], false);

		const fieldD = adapter.getFieldFromNode(root, brand("d")); // Entry was specified in initialTree was `undefined`
		assert.equal(fieldD.length, 0);

		const fieldE = adapter.getFieldFromNode(root, brand("e")); // No entry specified in initialTree
		assert.equal(fieldE.length, 0);
	});

	// Our data serialization format does not support certain numeric values.
	// These tests are intended to verify the mapping behaviors for those values.
	describe("Incompatible numeric value conversion", () => {
		function assertMapping(value: number, expected: unknown): void {
			const schemaBuilder = new SchemaBuilder({ scope: "test" });
			const schema = schemaBuilder.intoSchema(schemaBuilder.number);
			const view = viewWithContent({
				schema,
				initialTree: value,
			});
			const adapter = createProxyTreeAdapter(view.context, schema.rootFieldSchema.types);
			const result = adapter.value(view.root);
			assert.deepEqual(result, expected);
		}

		it("NaN", () => {
			assertMapping(Number.NaN, null);
		});

		it("-0", () => {
			assertMapping(-0, 0);
		});

		it("+∞", () => {
			assertMapping(Number.POSITIVE_INFINITY, null);
		});

		it("-∞", () => {
			assertMapping(Number.NEGATIVE_INFINITY, null);
		});
	});
});
