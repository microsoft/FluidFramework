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
		assert(!allowsValue(ValueSchema.Serializable, undefined));
		assert(!allowsValue(ValueSchema.Boolean, undefined));
		assert(allowsValue(undefined, undefined));
		assert(!allowsValue(ValueSchema.String, undefined));
		assert(!allowsValue(ValueSchema.Number, undefined));

		assert(allowsValue(ValueSchema.Serializable, false));
		assert(allowsValue(ValueSchema.Boolean, false));
		assert(!allowsValue(undefined, false));
		assert(!allowsValue(ValueSchema.String, false));
		assert(!allowsValue(ValueSchema.Number, false));

		assert(allowsValue(ValueSchema.Serializable, 5));
		assert(!allowsValue(ValueSchema.Boolean, 5));
		assert(!allowsValue(undefined, 5));
		assert(!allowsValue(ValueSchema.String, 5));
		assert(allowsValue(ValueSchema.Number, 5));

		assert(allowsValue(ValueSchema.Serializable, ""));
		assert(!allowsValue(ValueSchema.Boolean, ""));
		assert(!allowsValue(undefined, ""));
		assert(allowsValue(ValueSchema.String, ""));
		assert(!allowsValue(ValueSchema.Number, ""));

		assert(allowsValue(ValueSchema.Serializable, {}));
		assert(!allowsValue(ValueSchema.Boolean, {}));
		assert(!allowsValue(undefined, {}));
		assert(!allowsValue(ValueSchema.String, {}));
		assert(!allowsValue(ValueSchema.Number, {}));
	});

	it("applyTypesFromContext omits empty fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.leaf("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const numbersObject = builder.struct("numbers", { numbers: numberSequence });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext({ schema }, new Set([numbersObject.name]), {
			numbers: [],
		});
		const expected: MapTree = { fields: new Map(), type: numbersObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	it("applyTypesFromContext omits empty primary fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.leaf("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const primaryObject = builder.struct("numbers", { [EmptyKey]: numberSequence });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext({ schema }, new Set([primaryObject.name]), []);
		const expected: MapTree = { fields: new Map(), type: primaryObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	describe("cursorFromContextualData adds field", () => {
		it("for empty contextual data.", () => {
			const builder = new SchemaBuilder("cursorFromContextualData");
			const generatedSchema = builder.leaf("generated", ValueSchema.String);
			const nodeSchema = builder.struct("node", {
				foo: SchemaBuilder.fieldValue(generatedSchema),
			});

			const nodeSchemaData = builder.intoDocumentSchema(
				SchemaBuilder.fieldOptional(nodeSchema),
			);
			const contextualData: ContextuallyTypedNodeDataObject = {};

			const generatedField = [
				{
					value: "x",
					type: generatedSchema.name,
					fields: new Map(),
				},
			];
			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						fieldSource: () => (): MapTree[] => generatedField,
					},
					new Set([nodeSchema.name]),
					contextualData,
				),
			);

			assert.equal(treeFromContextualData.fields?.foo[0].value, "x");
		});

		it("for nested contextual data.", () => {
			const builder = new SchemaBuilder("Identifier Domain");
			const generatedSchema = builder.leaf("generated", ValueSchema.String);

			const nodeSchema = builder.structRecursive("node", {
				foo: SchemaBuilder.fieldValue(generatedSchema),
				child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema),
			});

			const nodeSchemaData = builder.intoDocumentSchema(
				SchemaBuilder.fieldOptional(nodeSchema),
			);
			const contextualData: ContextuallyTypedNodeDataObject = { child: {} };

			const generatedField = [
				{
					value: "x",
					type: generatedSchema.name,
					fields: new Map(),
				},
			];

			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						fieldSource: () => (): MapTree[] => generatedField,
					},
					new Set([nodeSchema.name]),
					contextualData,
				),
			);

			assert.equal(treeFromContextualData.fields?.foo[0].value, "x");
			assert.equal(treeFromContextualData.fields?.child[0].fields?.foo[0].value, "x");
		});
	});

	// TODO: more tests
});
