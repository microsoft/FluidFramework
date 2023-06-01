/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { GlobalFieldKey, ValueSchema, symbolFromKey } from "../../core";
import {
	FieldKinds,
	SchemaBuilder,
	isPrimitiveValue,
	jsonableTreeFromCursor,
} from "../../feature-libraries";
// Allow importing from this specific file which is being tested:
import {
	ContextuallyTypedNodeDataObject,
	allowsValue,
	cursorFromContextualData,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/contextuallyTyped";
import { brand } from "../../util";

const builder = new SchemaBuilder("Identifier Domain");

/**
 * The tree schema for the identifier primitive
 */
export const identifierSchema = builder.primitive("identifier", ValueSchema.String);

/**
 * The field schema for fields which contain identifiers (see {@link identifierSchema})
 */
const identifierFieldSchema = builder.globalField(
	"identifier",
	SchemaBuilder.fieldValue(identifierSchema),
);

// const builder = new SchemaBuilder("identifier index tests", identifierFieldSchemaLibrary);
const nodeSchema = builder.objectRecursive("node", {
	local: { child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema) },
	global: [identifierFieldSchema] as const,
});

const nodeSchemaData = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(nodeSchema));
const globalFieldKey: GlobalFieldKey = brand("identifier");

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

	// TODO: more tests
});

describe.only("cursorFromContextualData adds globalFieldKey", () => {
	it("for empty contextual data.", () => {
		const contextualData: ContextuallyTypedNodeDataObject = {};

		const treeFromContextualData = jsonableTreeFromCursor(
			cursorFromContextualData(
				{
					schemaData: nodeSchemaData,
					typeSet: new Set([nodeSchema.name]),
					globalFieldKeySymbol: symbolFromKey(globalFieldKey),
				},
				contextualData,
			),
		);

		assert(treeFromContextualData.globalFields?.identifier !== undefined);
	});
	it("for nested contextual data with no global fields provided", () => {
		const contextualData: ContextuallyTypedNodeDataObject = { child: {} };

		const treeFromContextualData = jsonableTreeFromCursor(
			cursorFromContextualData(
				{
					schemaData: nodeSchemaData,
					typeSet: new Set([nodeSchema.name]),
					globalFieldKeySymbol: symbolFromKey(globalFieldKey),
				},
				contextualData,
			),
		);

		assert(treeFromContextualData.globalFields?.identifier !== undefined);
		assert(treeFromContextualData.fields?.child[0].globalFields?.identifier !== undefined);
	});
});
