/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import {
	EmptyKey,
	FieldKey,
	FieldStoredSchema,
	GlobalFieldKey,
	MapTree,
	ValueSchema,
} from "../../core";

import {
	allowsValue,
	isPrimitiveValue,
	applyTypesFromContext,
	ContextuallyTypedNodeDataObject,
	cursorFromContextualData,
	defaultGetFieldGenerator,
	FieldGenerator,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/contextuallyTyped";
import { FieldKinds, SchemaBuilder, jsonableTreeFromCursor } from "../../feature-libraries";
import { brand } from "../../util";

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
		const mapTree = applyTypesFromContext(
			{ schema, getFieldGenerator: defaultGetFieldGenerator },
			new Set([numbersObject.name]),
			{
				numbers: [],
			},
		);
		const expected: MapTree = { fields: new Map(), type: numbersObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	it("applyTypesFromContext omits empty primary fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.primitive("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const primaryObject = builder.object("numbers", { local: { [EmptyKey]: numberSequence } });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext(
			{ schema, getFieldGenerator: defaultGetFieldGenerator },
			new Set([primaryObject.name]),
			[],
		);
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
			const nodeSchema = builder.objectRecursive("node", {
				local: {
					child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema),
				},
				global: [identifierFieldSchema] as const,
			});

			const nodeSchemaData = builder.intoDocumentSchema(
				SchemaBuilder.fieldOptional(nodeSchema),
			);
			const globalFieldKey: GlobalFieldKey = brand("identifier");
			const contextualData: ContextuallyTypedNodeDataObject = {};

			const getFieldGenerator = (
				key: FieldKey,
				schema: FieldStoredSchema,
			): FieldGenerator => {
				const fieldGenerator = (): MapTree[] => {
					return [
						{
							value: uuid(),
							type: identifierSchema.name,
							fields: new Map(),
						},
					];
				};
				return fieldGenerator;
			};

			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						getFieldGenerator,
					},
					new Set([nodeSchema.name]),
					contextualData,
				),
			);

			assert(treeFromContextualData.globalFields?.identifier !== undefined);
		});
		it("for nested contextual data with no global fields provided", () => {
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

			const getFieldGenerator = (
				key: FieldKey,
				schema: FieldStoredSchema,
			): FieldGenerator => {
				const fieldGenerator = (): MapTree[] => {
					return [
						{
							value: uuid(),
							type: identifierSchema.name,
							fields: new Map(),
						},
					];
				};
				return fieldGenerator;
			};

			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						getFieldGenerator,
					},
					new Set([nodeSchema.name]),
					contextualData,
				),
			);

			assert(treeFromContextualData.globalFields?.identifier !== undefined);
			assert(treeFromContextualData.fields?.child[0].globalFields?.identifier !== undefined);
		});
	});

	// TODO: more tests
});
