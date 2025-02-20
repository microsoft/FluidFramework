/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	cursorFromInsertable,
	getStoredSchema,
	SchemaFactory,
	toStoredSchema,
} from "../../../simple-tree/index.js";

import {
	customFromCursor,
	customFromCursorStored,
	tryStoredSchemaAsArray,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/customTree.js";
// eslint-disable-next-line import/no-internal-modules
import { getUnhydratedContext } from "../../../simple-tree/createContext.js";
import { singleJsonCursor } from "../../json/index.js";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";
import { JsonUnion } from "../../../jsonDomainSchema.js";

const schemaFactory = new SchemaFactory("Test");

describe("simple-tree customTree", () => {
	const handle = new MockHandle(1);
	describe("customFromCursor", () => {
		it("leaf", () => {
			const schema = getUnhydratedContext(JsonUnion).schema;
			const leaf_options = { useStoredKeys: true, valueConverter: () => fail("unused") };
			assert.equal(
				customFromCursor(singleJsonCursor(null), leaf_options, schema, () => fail()),
				null,
			);
			assert.equal(
				customFromCursor(singleJsonCursor(5), leaf_options, schema, () => fail()),
				5,
			);
			const log: unknown[] = [];
			assert.equal(
				customFromCursor(
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
				customFromCursor(
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
				customFromCursor(
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

	it("tryStoredSchemaAsArray", () => {
		const arraySchema = schemaFactory.array(schemaFactory.number);
		const arrayCase = tryStoredSchemaAsArray(getStoredSchema(arraySchema));
		assert.deepEqual(arrayCase, new Set([schemaFactory.number.identifier]));

		const objectSchema = schemaFactory.object("x", {});
		const objectCase = tryStoredSchemaAsArray(getStoredSchema(objectSchema));
		assert.deepEqual(objectCase, undefined);

		const objectSchemaEmptyKey = schemaFactory.object("x", { [""]: schemaFactory.number });
		const objectEmptyKeyCase = tryStoredSchemaAsArray(getStoredSchema(objectSchemaEmptyKey));
		assert.deepEqual(objectEmptyKeyCase, undefined);

		const nonObjectCase = tryStoredSchemaAsArray(getStoredSchema(schemaFactory.number));
		assert.deepEqual(nonObjectCase, undefined);
	});

	it("customFromCursorStored", () => {
		const schema = toStoredSchema(JsonUnion).nodeSchema;
		assert.equal(
			customFromCursorStored(singleJsonCursor(null), schema, () => fail()),
			null,
		);
		assert.equal(
			customFromCursorStored(singleJsonCursor(5), schema, () => fail()),
			5,
		);
	});
});
