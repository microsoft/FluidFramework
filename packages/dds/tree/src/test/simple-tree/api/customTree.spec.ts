/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	numberSchema,
	SchemaFactoryAlpha,
	toInitialSchema,
} from "../../../simple-tree/index.js";

import {
	customFromCursor,
	customFromCursorStored,
	KeyEncodingOptions,
	replaceHandles,
	tryStoredSchemaAsArray,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/customTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getUnhydratedContext } from "../../../simple-tree/createContext.js";
import { singleJsonCursor } from "../../json/index.js";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { fieldCursorFromInsertable } from "../../utils.js";
import {
	EmptyKey,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	ValueSchema,
	type TreeFieldStoredSchema,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import { FieldKinds } from "../../../feature-libraries/index.js";

const schemaFactory = new SchemaFactoryAlpha("Test");

describe("simple-tree customTree", () => {
	describe("customFromCursor", () => {
		it("leaf", () => {
			const context = getUnhydratedContext(JsonAsTree.Tree);
			const leaf_options = { keys: KeyEncodingOptions.allStoredKeys };
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

		describe("keys", () => {
			class A extends schemaFactory.object("A", {
				a: schemaFactory.number,
				b: schemaFactory.required(schemaFactory.number, { key: "stored" }),
			}) {}

			/**
			 * Same as A, but with A field missing and allowUnknownOptionalFields
			 */
			class UnknownOptionalFieldA extends schemaFactory.objectAlpha(
				"A",
				{
					b: schemaFactory.required(schemaFactory.number, { key: "stored" }),
				},
				{ allowUnknownOptionalFields: true },
			) {}

			const contextA = getUnhydratedContext(A);
			const contextUnknownOptionalFieldA = getUnhydratedContext(UnknownOptionalFieldA);
			const contentCursor = fieldCursorFromInsertable(A, { a: 1, b: 2 });
			contentCursor.enterNode(0);

			it("allStoredKeys", () => {
				assert.deepEqual(
					customFromCursor(
						contentCursor,
						{
							keys: KeyEncodingOptions.allStoredKeys,
						},
						contextA.flexContext.schema.nodeSchema,
						contextA.schema,
						(cursor) => ({ child: cursor.value }),
					),
					{ a: { child: 1 }, stored: { child: 2 } },
				);
				assert.deepEqual(
					customFromCursor(
						contentCursor,
						{
							keys: KeyEncodingOptions.allStoredKeys,
						},
						contextUnknownOptionalFieldA.flexContext.schema.nodeSchema,
						contextUnknownOptionalFieldA.schema,
						(cursor) => ({ child: cursor.value }),
					),
					{ a: { child: 1 }, stored: { child: 2 } },
				);
			});
			it("usePropertyKeys", () => {
				assert.deepEqual(
					customFromCursor(
						contentCursor,
						{
							keys: KeyEncodingOptions.usePropertyKeys,
						},
						contextA.flexContext.schema.nodeSchema,
						contextA.schema,
						(cursor) => ({ child: cursor.value }),
					),
					{ a: { child: 1 }, b: { child: 2 } },
				);
				assert.deepEqual(
					customFromCursor(
						contentCursor,
						{
							keys: KeyEncodingOptions.usePropertyKeys,
						},
						contextUnknownOptionalFieldA.flexContext.schema.nodeSchema,
						contextUnknownOptionalFieldA.schema,
						(cursor) => ({ child: cursor.value }),
					),
					{ b: { child: 2 } },
				);
			});
			it("knownStoredKeys", () => {
				assert.deepEqual(
					customFromCursor(
						contentCursor,
						{
							keys: KeyEncodingOptions.knownStoredKeys,
						},
						contextA.flexContext.schema.nodeSchema,
						contextA.schema,
						(cursor) => ({ child: cursor.value }),
					),
					{ a: { child: 1 }, stored: { child: 2 } },
				);
				assert.deepEqual(
					customFromCursor(
						contentCursor,
						{
							keys: KeyEncodingOptions.knownStoredKeys,
						},
						contextUnknownOptionalFieldA.flexContext.schema.nodeSchema,
						contextUnknownOptionalFieldA.schema,
						(cursor) => ({ child: cursor.value }),
					),
					{ stored: { child: 2 } },
				);
			});
		});
	});

	it("tryStoredSchemaAsArray", () => {
		const numberSequence: TreeFieldStoredSchema = {
			kind: FieldKinds.sequence.identifier,
			types: new Set([brand(numberSchema.identifier)]),
			persistedMetadata: {},
		};
		const arrayCase = tryStoredSchemaAsArray(
			new ObjectNodeStoredSchema(new Map([[EmptyKey, numberSequence]])),
		);
		assert.deepEqual(arrayCase, new Set([schemaFactory.number.identifier]));

		const namedCase = tryStoredSchemaAsArray(
			new ObjectNodeStoredSchema(new Map([[brand("x"), numberSequence]])),
		);
		assert.deepEqual(namedCase, undefined);
		const optionalCase = tryStoredSchemaAsArray(
			new ObjectNodeStoredSchema(
				new Map([[EmptyKey, { ...numberSequence, kind: FieldKinds.optional.identifier }]]),
			),
		);
		assert.deepEqual(optionalCase, undefined);

		const requiredCase = tryStoredSchemaAsArray(
			new ObjectNodeStoredSchema(
				new Map([
					[
						EmptyKey,
						{
							...numberSequence,
							kind: FieldKinds.required.identifier,
						},
					],
				]),
			),
		);
		assert.deepEqual(requiredCase, undefined);

		const nonObjectCase = tryStoredSchemaAsArray(
			new LeafNodeStoredSchema(ValueSchema.Boolean),
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
