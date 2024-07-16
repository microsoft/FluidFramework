/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { MapTree } from "../../core/index.js";
import { SchemaBuilder, leaf } from "../../domains/index.js";
import {
	type ContextuallyTypedNodeDataObject,
	applyTypesFromContext,
	cursorFromContextualData,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/contextuallyTyped.js";
import {
	FieldKinds,
	FlexFieldSchema,
	jsonableTreeFromCursor,
} from "../../feature-libraries/index.js";

describe("ContextuallyTyped", () => {
	it("applyTypesFromContext omits empty fields", () => {
		const builder = new SchemaBuilder({
			scope: "applyTypesFromContext",
			libraries: [leaf.library],
		});
		const numberSequence = SchemaBuilder.sequence(leaf.number);
		const numbersObject = builder.object("numbers", { numbers: numberSequence });
		const schema = builder.intoSchema(numberSequence);
		const mapTree = applyTypesFromContext({ schema }, new Set([numbersObject]), {
			numbers: [],
		});
		const expected: MapTree = {
			fields: new Map(),
			type: numbersObject.name,
			value: undefined,
		};
		assert.deepEqual(mapTree, expected);
	});

	it("applyTypesFromContext omits empty primary fields", () => {
		const builder = new SchemaBuilder({
			scope: "applyTypesFromContext",
			libraries: [leaf.library],
		});
		const numberSequence = SchemaBuilder.sequence(leaf.number);
		const primaryObject = builder.fieldNode("numbers", numberSequence);
		const schema = builder.intoSchema(numberSequence);
		const mapTree = applyTypesFromContext({ schema }, new Set([primaryObject]), []);
		const expected: MapTree = {
			fields: new Map(),
			type: primaryObject.name,
			value: undefined,
		};
		assert.deepEqual(mapTree, expected);
	});

	describe("cursorFromContextualData adds field", () => {
		it("for empty contextual data.", () => {
			const builder = new SchemaBuilder({
				scope: "cursorFromContextualData",
				libraries: [leaf.library],
			});
			const nodeSchema = builder.object("node", {
				foo: leaf.string,
			});

			const nodeSchemaData = builder.intoSchema(builder.optional(nodeSchema));
			const contextualData: ContextuallyTypedNodeDataObject = {};

			const generatedField = [
				{
					value: "x",
					type: leaf.string.name,
					fields: new Map(),
				},
			];
			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						fieldSource: () => (): MapTree[] => generatedField,
					},
					new Set([nodeSchema]),
					contextualData,
				),
			);

			assert.equal(treeFromContextualData.fields?.foo[0].value, "x");
		});

		it("for nested contextual data.", () => {
			const builder = new SchemaBuilder({
				scope: "Identifier Domain",
				libraries: [leaf.library],
			});

			const nodeSchema = builder.objectRecursive("node", {
				foo: builder.required(leaf.string),
				child: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => nodeSchema]),
			});

			const nodeSchemaData = builder.intoSchema(builder.optional(nodeSchema));
			const contextualData: ContextuallyTypedNodeDataObject = { child: {} };

			const generatedField = [
				{
					value: "x",
					type: leaf.string.name,
					fields: new Map(),
				},
			];

			const treeFromContextualData = jsonableTreeFromCursor(
				cursorFromContextualData(
					{
						schema: nodeSchemaData,
						fieldSource: () => (): MapTree[] => generatedField,
					},
					new Set([nodeSchema]),
					contextualData,
				),
			);

			assert.equal(treeFromContextualData.fields?.foo[0].value, "x");
			assert.equal(treeFromContextualData.fields?.child[0].fields?.foo[0].value, "x");
		});
	});

	// TODO: more tests
});
