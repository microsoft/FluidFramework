/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { createProxyTreeAdapter } from "../../../../feature-libraries/editable-tree-2/proxies/proxyNodeCursor";
import { SchemaBuilder } from "../../../../domains";
import { viewWithContent } from "../../../utils";
import { brand } from "../../../../util";

// Note: the behaviors here are more heavily tested by `proxies.spec.ts`.
// This adds some basic unit test for the generated cursor adapter, but since the adaptor is an implementation
// detail of the proxy API, deep coverage at this level was not prioritized.
describe("cursorFromProxyTree", () => {
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

		const fieldE = adapter.getFieldFromNode(root, brand("d")); // No such property as "e" in the schema or initial tree
		assert.equal(fieldE.length, 0);
	});
});
