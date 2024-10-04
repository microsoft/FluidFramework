/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { cursorFromInsertable, SchemaFactory } from "../../../simple-tree/index.js";

// eslint-disable-next-line import/no-internal-modules
import { customFromCursorInner } from "../../../simple-tree/api/customTree.js";
// eslint-disable-next-line import/no-internal-modules
import { getUnhydratedContext } from "../../../simple-tree/createContext.js";
import { JsonUnion, singleJsonCursor } from "../../json/index.js";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

const schemaFactory = new SchemaFactory("Test");

describe("simple-tree customTree", () => {
	const handle = new MockHandle(1);
	describe("customFromCursorInner", () => {
		it("leaf", () => {
			const schema = getUnhydratedContext(JsonUnion).schema;
			const leaf_options = { useStoredKeys: true, valueConverter: () => fail("unused") };
			assert.equal(
				customFromCursorInner(singleJsonCursor(null), leaf_options, schema, () => fail()),
				null,
			);
			assert.equal(
				customFromCursorInner(singleJsonCursor(5), leaf_options, schema, () => fail()),
				5,
			);
			const log: unknown[] = [];
			assert.equal(
				customFromCursorInner(
					cursorFromInsertable(schemaFactory.handle, handle),
					{
						useStoredKeys: true,
						valueConverter: (h) => {
							log.push(h);
							return "replaced";
						},
					},
					getUnhydratedContext(schemaFactory.handle).schema,
					() => fail(),
				),
				"replaced",
			);
			assert.deepEqual(log, [handle]);
		});

		it("useStoredKeys", () => {
			class A extends schemaFactory.object("A", {
				a: schemaFactory.number,
				b: schemaFactory.required(schemaFactory.number, { key: "stored" }),
			}) {}

			const schema = getUnhydratedContext(A).schema;
			assert.deepEqual(
				customFromCursorInner(
					cursorFromInsertable(A, { a: 1, b: 2 }),
					{
						useStoredKeys: true,
						valueConverter: () => fail(),
					},
					schema,
					(cursor) => ({ child: cursor.value }),
				),
				{ a: { child: 1 }, stored: { child: 2 } },
			);

			assert.deepEqual(
				customFromCursorInner(
					cursorFromInsertable(A, { a: 1, b: 2 }),
					{
						useStoredKeys: false,
						valueConverter: () => fail(),
					},
					schema,
					(cursor) => ({ child: cursor.value }),
				),
				{ a: { child: 1 }, b: { child: 2 } },
			);
		});
	});
});
