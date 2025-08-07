/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	getStoredSchema,
	restrictiveStoredSchemaGenerationOptions,
	SchemaFactoryAlpha,
	schemaStatics,
	toInitialSchema,
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
import { fieldCursorFromInsertable } from "../../utils.js";

const schemaFactory = new SchemaFactoryAlpha("Test");

describe("simple-tree customTree", () => {
	describe("customFromCursor", () => {
		it("leaf", () => {
			const context = getUnhydratedContext(JsonAsTree.Tree);
			const leaf_options = { useStoredKeys: true };
			assert.equal(
				customFromCursor(
					singleJsonCursor(null),
					leaf_options,
					context.flexContext.schema.nodeSchema,
					context.schema,
					() => fail(),
				),
				null,
			);
			assert.equal(
				customFromCursor(
					singleJsonCursor(5),
					leaf_options,
					context.flexContext.schema.nodeSchema,
					context.schema,
					() => fail(),
				),
				5,
			);
		});

		it("useStoredKeys", () => {
			class A extends schemaFactory.object("A", {
				a: schemaFactory.number,
				b: schemaFactory.required(schemaFactory.number, { key: "stored" }),
			}) {}

			const context = getUnhydratedContext(A);
			const contentCursor = fieldCursorFromInsertable(A, { a: 1, b: 2 });
			contentCursor.enterNode(0);
			assert.deepEqual(
				customFromCursor(
					contentCursor,
					{
						useStoredKeys: true,
					},
					context.flexContext.schema.nodeSchema,
					context.schema,
					(cursor) => ({ child: cursor.value }),
				),
				{ a: { child: 1 }, stored: { child: 2 } },
			);

			assert.deepEqual(
				customFromCursor(
					contentCursor,
					{
						useStoredKeys: false,
					},
					context.flexContext.schema.nodeSchema,
					context.schema,
					(cursor) => ({ child: cursor.value }),
				),
				{ a: { child: 1 }, b: { child: 2 } },
			);
		});
	});

	it("tryStoredSchemaAsArray", () => {
		const arraySchema = schemaFactory.arrayAlpha("A", schemaFactory.number);
		const arrayCase = tryStoredSchemaAsArray(
			getStoredSchema(arraySchema, restrictiveStoredSchemaGenerationOptions),
		);
		assert.deepEqual(arrayCase, new Set([schemaFactory.number.identifier]));

		const objectSchema = schemaFactory.objectAlpha("x", {});
		const objectCase = tryStoredSchemaAsArray(
			getStoredSchema(objectSchema, restrictiveStoredSchemaGenerationOptions),
		);
		assert.deepEqual(objectCase, undefined);

		const objectSchemaEmptyKey = schemaFactory.objectAlpha("x", {
			[""]: schemaFactory.number,
		});
		const objectEmptyKeyCase = tryStoredSchemaAsArray(
			getStoredSchema(objectSchemaEmptyKey, restrictiveStoredSchemaGenerationOptions),
		);
		assert.deepEqual(objectEmptyKeyCase, undefined);

		const nonObjectCase = tryStoredSchemaAsArray(
			getStoredSchema(schemaStatics.number, restrictiveStoredSchemaGenerationOptions),
		);
		assert.deepEqual(nonObjectCase, undefined);
	});

	it("customFromCursorStored", () => {
		const schema = toInitialSchema(JsonAsTree.Tree).nodeSchema;
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
