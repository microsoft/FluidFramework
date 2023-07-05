/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EmptyKey, MapTree, ValueSchema } from "../../core";

import {
	allowsValue,
	isPrimitiveValue,
	applyTypesFromContext,
	ContextuallyTypedNodeDataObject,
	cursorFromContextualData,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/contextuallyTyped";
import { FieldKinds, SchemaBuilder, jsonableTreeFromCursor } from "../../feature-libraries";

describe("ContextuallyTyped", () => {
	it("isPrimitiveValue", () => {
		assert(isPrimitiveValue(0));
		assert(isPrimitiveValue(0.001));
		assert(isPrimitiveValue(NaN));
		assert(isPrimitiveValue(true));
		assert(isPrimitiveValue(false));
		assert(isPrimitiveValue(""));
		assert(!isPrimitiveValue({}));
		assert(!isPrimitiveValue(undefined));
		assert(!isPrimitiveValue(null));
		assert(!isPrimitiveValue([]));
	});

	it("allowsValue", () => {
		assert(allowsValue(ValueSchema.Serializable, undefined));
		assert(!allowsValue(ValueSchema.Boolean, undefined));
		assert(allowsValue(ValueSchema.Nothing, undefined));
		assert(!allowsValue(ValueSchema.String, undefined));
		assert(!allowsValue(ValueSchema.Number, undefined));

		assert(allowsValue(ValueSchema.Serializable, false));
		assert(allowsValue(ValueSchema.Boolean, false));
		assert(!allowsValue(ValueSchema.Nothing, false));
		assert(!allowsValue(ValueSchema.String, false));
		assert(!allowsValue(ValueSchema.Number, false));

		assert(allowsValue(ValueSchema.Serializable, 5));
		assert(!allowsValue(ValueSchema.Boolean, 5));
		assert(!allowsValue(ValueSchema.Nothing, 5));
		assert(!allowsValue(ValueSchema.String, 5));
		assert(allowsValue(ValueSchema.Number, 5));

		assert(allowsValue(ValueSchema.Serializable, ""));
		assert(!allowsValue(ValueSchema.Boolean, ""));
		assert(!allowsValue(ValueSchema.Nothing, ""));
		assert(allowsValue(ValueSchema.String, ""));
		assert(!allowsValue(ValueSchema.Number, ""));

		assert(allowsValue(ValueSchema.Serializable, {}));
		assert(!allowsValue(ValueSchema.Boolean, {}));
		assert(!allowsValue(ValueSchema.Nothing, {}));
		assert(!allowsValue(ValueSchema.String, {}));
		assert(!allowsValue(ValueSchema.Number, {}));
	});

	it("applyTypesFromContext omits empty fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.primitive("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const numbersObject = builder.object("numbers", { local: { numbers: numberSequence } });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext({ schema }, new Set([numbersObject.name]), {
			numbers: [],
		});
		const expected: MapTree = { fields: new Map(), type: numbersObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	it("applyTypesFromContext omits empty primary fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.primitive("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const primaryObject = builder.object("numbers", { local: { [EmptyKey]: numberSequence } });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext({ schema }, new Set([primaryObject.name]), []);
		const expected: MapTree = { fields: new Map(), type: primaryObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	describe("cursorFromContextualData adds globalFieldKey", () => {
		it("for empty contextual data.", () => {
			const builder = new SchemaBuilder("Identifier Domain");
			const identifierSchema = builder.primitive("identifier", ValueSchema.String);
			const identifierFieldSchema = builder.globalField(
				"identifier",
				SchemaBuilder.fieldValue(identifierSchema),
			);
			const nodeSchema = builder.object("node", {
				global: [identifierFieldSchema] as const,
			});

			const nodeSchemaData = builder.intoDocumentSchema(
				SchemaBuilder.fieldOptional(nodeSchema),
			);
			const contextualData: ContextuallyTypedNodeDataObject = {};

			const identifierField = [
				{
					value: "x",
					type: identifierSchema.name,
					fields: new Map(),
				},
			];
			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						fieldSource: () => (): MapTree[] => identifierField,
					},
					new Set([nodeSchema.name]),
					contextualData,
				),
			);

			assert.equal(treeFromContextualData.globalFields?.identifier[0].value, "x");
		});

		it("for nested contextual data.", () => {
			const builder = new SchemaBuilder("Identifier Domain");
			const identifierSchema = builder.primitive("identifier", ValueSchema.String);
			const identifierFieldSchema = builder.globalField(
				"identifier",
				SchemaBuilder.fieldValue(identifierSchema),
			);
			const nodeSchema = builder.objectRecursive("node", {
				local: {
					child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema),
				},
				global: [identifierFieldSchema] as const,
			});

			const nodeSchemaData = builder.intoDocumentSchema(
				SchemaBuilder.fieldOptional(nodeSchema),
			);
			const contextualData: ContextuallyTypedNodeDataObject = { child: {} };

			const identifierField = [
				{
					value: "x",
					type: identifierSchema.name,
					fields: new Map(),
				},
			];

			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						fieldSource: () => (): MapTree[] => identifierField,
					},
					new Set([nodeSchema.name]),
					contextualData,
				),
			);

			assert.equal(treeFromContextualData.globalFields?.identifier[0].value, "x");
			assert.equal(
				treeFromContextualData.fields?.child[0].globalFields?.identifier[0].value,
				"x",
			);
		});
	});

	// TODO: more tests
});
