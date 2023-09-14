/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockHandle, validateAssertionError } from "@fluidframework/test-runtime-utils";
import { EmptyKey, MapTree, ValueSchema } from "../../core";

import {
	allowsValue,
	isPrimitiveValue,
	applyTypesFromContext,
	ContextuallyTypedNodeDataObject,
	cursorFromContextualData,
	isFluidHandle,
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
		assert(!isPrimitiveValue(new MockHandle(5)));
	});

	it("isFluidHandle", () => {
		assert(!isFluidHandle(0));
		assert(!isFluidHandle({}));
		assert(!isFluidHandle(undefined));
		assert(!isFluidHandle(null));
		assert(!isFluidHandle([]));
		assert(isFluidHandle(new MockHandle(5)));
		assert(!isFluidHandle({ IFluidHandle: 5 }));
		assert(!isFluidHandle({ IFluidHandle: {} }));
		const loopy = { IFluidHandle: {} };
		loopy.IFluidHandle = loopy;
		// isFluidHandle has extra logic to check the handle is valid if it passed the detection via cyclic ref.
		// Thus this case asserts:
		assert.throws(
			() => isFluidHandle(loopy),
			(e: Error) => validateAssertionError(e, /IFluidHandle/),
		);
	});

	it("allowsValue", () => {
		assert(!allowsValue(ValueSchema.FluidHandle, undefined));
		assert(!allowsValue(ValueSchema.Boolean, undefined));
		assert(allowsValue(undefined, undefined));
		assert(!allowsValue(ValueSchema.String, undefined));
		assert(!allowsValue(ValueSchema.Number, undefined));

		assert(!allowsValue(ValueSchema.FluidHandle, false));
		assert(allowsValue(ValueSchema.Boolean, false));
		assert(!allowsValue(undefined, false));
		assert(!allowsValue(ValueSchema.String, false));
		assert(!allowsValue(ValueSchema.Number, false));

		assert(!allowsValue(ValueSchema.FluidHandle, 5));
		assert(!allowsValue(ValueSchema.Boolean, 5));
		assert(!allowsValue(undefined, 5));
		assert(!allowsValue(ValueSchema.String, 5));
		assert(allowsValue(ValueSchema.Number, 5));

		assert(!allowsValue(ValueSchema.FluidHandle, ""));
		assert(!allowsValue(ValueSchema.Boolean, ""));
		assert(!allowsValue(undefined, ""));
		assert(allowsValue(ValueSchema.String, ""));
		assert(!allowsValue(ValueSchema.Number, ""));

		const handle = new MockHandle(5);
		assert(allowsValue(ValueSchema.FluidHandle, handle));
		assert(!allowsValue(ValueSchema.Boolean, handle));
		assert(!allowsValue(undefined, handle));
		assert(!allowsValue(ValueSchema.String, handle));
		assert(!allowsValue(ValueSchema.Number, handle));
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
