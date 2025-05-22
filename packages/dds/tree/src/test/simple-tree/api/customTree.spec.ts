/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	getStoredSchema,
	SchemaFactoryAlpha,
	schemaStatics,
	toStoredSchema,
} from "../../../simple-tree/index.js";

import {
	customFromCursor,
	customFromCursorStored,
	replaceHandles,
	tryStoredSchemaAsArray,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/customTree.js";
// eslint-disable-next-line import/no-internal-modules
import { getUnhydratedContext } from "../../../simple-tree/createContext.js";
import { singleJsonCursor } from "../../json/index.js";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { cursorFromInsertable } from "../../utils.js";

const schemaFactory = new SchemaFactoryAlpha("Test");

describe("simple-tree customTree", () => {
	describe("customFromCursor", () => {
		it("leaf", () => {
			const schema = getUnhydratedContext(JsonAsTree.Tree).schema;
			const leaf_options = { useStoredKeys: true };
			assert.equal(
				customFromCursor(singleJsonCursor(null), leaf_options, schema, () => fail()),
				null,
			);
			assert.equal(
				customFromCursor(singleJsonCursor(5), leaf_options, schema, () => fail()),
				5,
			);
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
					},
					schema,
					(cursor) => ({ child: cursor.value }),
				),
				{ a: { child: 1 }, b: { child: 2 } },
			);
		});
	});

	it("tryStoredSchemaAsArray", () => {
		const arraySchema = schemaFactory.arrayAlpha("A", schemaFactory.number);
		const arrayCase = tryStoredSchemaAsArray(getStoredSchema(arraySchema));
		assert.deepEqual(arrayCase, new Set([schemaFactory.number.identifier]));

		const objectSchema = schemaFactory.objectAlpha("x", {});
		const objectCase = tryStoredSchemaAsArray(getStoredSchema(objectSchema));
		assert.deepEqual(objectCase, undefined);

		const objectSchemaEmptyKey = schemaFactory.objectAlpha("x", {
			[""]: schemaFactory.number,
		});
		const objectEmptyKeyCase = tryStoredSchemaAsArray(getStoredSchema(objectSchemaEmptyKey));
		assert.deepEqual(objectEmptyKeyCase, undefined);

		const nonObjectCase = tryStoredSchemaAsArray(getStoredSchema(schemaStatics.number));
		assert.deepEqual(nonObjectCase, undefined);
	});

	it("customFromCursorStored", () => {
		const schema = toStoredSchema(JsonAsTree.Tree).nodeSchema;
		assert.equal(
			customFromCursorStored(singleJsonCursor(null), schema, () => fail()),
			null,
		);
		assert.equal(
			customFromCursorStored(singleJsonCursor(5), schema, () => fail()),
			5,
		);
	});

	describe("replaceHandles", () => {
		it("no handles", () => {
			const tree = { x: { b: 1 } };
			const clone = replaceHandles(tree, () => {
				fail();
			});
			assert.notEqual(clone, tree);
			assert.deepEqual(clone, tree);
		});

		it("handles", () => {
			const tree = { x: { b: new MockHandle(1) } };
			const clone = replaceHandles(tree, () => "handle");
			assert.deepEqual(clone, { x: { b: "handle" } });
		});
	});
});
