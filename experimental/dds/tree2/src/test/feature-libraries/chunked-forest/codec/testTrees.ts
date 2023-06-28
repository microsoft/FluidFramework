/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree, SchemaDataAndPolicy, ValueSchema } from "../../../../core";
import {
	Any,
	FieldKinds,
	FieldSchema,
	FullSchemaPolicy,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
	cursorsForTypedFieldData,
	jsonableTreeFromCursor,
	typeNameSymbol,
	valueSymbol,
} from "../../../../feature-libraries";

interface TestTree {
	readonly name: string;
	readonly schemaData: SchemaDataAndPolicy<FullSchemaPolicy>;
	readonly schema: FieldSchema;
	readonly tree: JsonableTree[];
}

function testTree<T extends TreeSchema>(
	name: string,
	schemaData: SchemaDataAndPolicy<FullSchemaPolicy>,
	schema: T,
	data: SchemaAware.AllowedTypesToTypedTrees<SchemaAware.ApiMode.Flexible, [T]>,
): TestTree {
	const fieldSchema = SchemaBuilder.fieldValue(schema);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FieldSchema>(
	name: string,
	schemaData: SchemaDataAndPolicy<FullSchemaPolicy>,
	schema: T,
	data: SchemaAware.TypedField<T, SchemaAware.ApiMode.Flexible>,
): TestTree {
	const cursors = cursorsForTypedFieldData({ schema: schemaData }, schema, data);
	return { name, schema, tree: cursors.map(jsonableTreeFromCursor), schemaData };
}

const builder = new SchemaBuilder("test");
export const minimal = builder.object("minimal", {});
export const numeric = builder.primitive("numeric", ValueSchema.Number);
export const serializable = builder.object("serializable", { value: ValueSchema.Serializable });
export const hasMinimalValueField = builder.object("hasMinimalValueField", {
	local: { field: SchemaBuilder.fieldValue(minimal) },
});
export const hasNumericValueField = builder.object("hasNumericValueField", {
	local: { field: SchemaBuilder.fieldValue(numeric) },
});
export const hasPolymorphicValueField = builder.object("hasPolymorphicValueField", {
	local: { field: SchemaBuilder.fieldValue(numeric, minimal) },
});
export const hasAnyValueField = builder.object("hasAnyValueField", {
	local: { field: SchemaBuilder.fieldValue(Any) },
});
export const hasOptionalField = builder.object("hasOptionalField", {
	local: { field: SchemaBuilder.fieldOptional(numeric) },
});
export const hasExtraLocalFields = builder.object("hasExtraLocalFields", {
	extraLocalFields: SchemaBuilder.fieldOptional(numeric),
});
export const globalNumericField = builder.globalField(
	"global_numeric",
	SchemaBuilder.fieldOptional(numeric),
);
export const globalAnyField = builder.globalField("global_any", SchemaBuilder.fieldSequence(Any));
export const hasGlobalField = builder.object("hasGlobalField", {
	global: [globalNumericField] as const,
});
export const hasExtraGlobalField = builder.object("hasExtraGlobalField", {
	extraGlobalFields: true,
});
export const allTheFields = builder.object("allTheFields", {
	local: {
		optional: SchemaBuilder.fieldOptional(numeric),
		value: SchemaBuilder.fieldValue(numeric),
		sequence: SchemaBuilder.fieldSequence(numeric),
	},
	global: [globalNumericField] as const,
	extraLocalFields: SchemaBuilder.fieldOptional(numeric),
	extraGlobalFields: true,
});
export const anyFields = builder.object("anyFields", {
	local: {
		optional: SchemaBuilder.fieldOptional(Any),
		value: SchemaBuilder.fieldValue(Any),
		sequence: SchemaBuilder.fieldSequence(Any),
	},
	global: [globalAnyField] as const,
	extraLocalFields: SchemaBuilder.fieldOptional(Any),
	extraGlobalFields: true,
	value: ValueSchema.Serializable,
});
export const recursiveType = builder.objectRecursive("recursiveType", {
	local: {
		field: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => recursiveType),
	},
});

export const library = builder.intoLibrary();

export const testTrees: readonly TestTree[] = [
	testField("empty", library, SchemaBuilder.fieldOptional(), undefined),
	testTree("minimal", library, minimal, {}),
	testTree("numeric", library, numeric, 5),
	testField("numericSequence", library, SchemaBuilder.fieldSequence(numeric), [1, 2, 3]),
	testTree("true boolean", library, serializable, {
		[typeNameSymbol]: "serializable",
		[valueSymbol]: true,
	}),
	testTree("false boolean", library, serializable, {
		[typeNameSymbol]: "serializable",
		[valueSymbol]: false,
	}),
	testTree("hasMinimalValueField", library, hasMinimalValueField, {
		field: {},
	}),
	testTree("hasNumericValueField", library, hasNumericValueField, {
		field: 5,
	}),
	testTree("hasPolymorphicValueField", library, hasPolymorphicValueField, {
		field: 5,
	}),
	testTree("hasAnyValueField", library, hasAnyValueField, {
		field: {
			[typeNameSymbol]: "numeric",
			[valueSymbol]: 5,
		},
	}),
	testTree("hasAnyValueFieldRecursive", library, hasAnyValueField, {
		field: {
			[typeNameSymbol]: "hasAnyValueField",
			field: {
				[typeNameSymbol]: "numeric",
				[valueSymbol]: 5,
			},
		},
	}),
	testTree("hasOptionalField-empty", library, hasOptionalField, { field: undefined }),
	testTree("hasExtraLocalFields-none", library, hasExtraLocalFields, {}),
	testTree("hasGlobalField", library, hasGlobalField, { [globalNumericField.symbol]: 5 }),
	testTree("hasExtraGlobalField", library, hasExtraGlobalField, {
		[globalNumericField.symbol]: 5,
	}),
	testTree("hasExtraGlobalField-empty", library, hasExtraGlobalField, {}),
	testTree("allTheFields-minimal", library, allTheFields, {
		value: 5,
		optional: undefined,
		sequence: [],
	}),
	testTree("allTheFields-full", library, allTheFields, {
		value: 5,
		optional: 5,
		sequence: [5],
		[globalNumericField.symbol]: 5,
	}),
	testTree("anyFields-minimal", library, anyFields, {
		value: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		optional: undefined,
		sequence: [],
	}),
	testTree("anyFields-full", library, anyFields, {
		value: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		optional: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		sequence: [
			{ [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
			{ [typeNameSymbol]: minimal.name },
		],
		[globalNumericField.symbol]: 5,
		[valueSymbol]: "value",
	}),
	testTree("recursiveType-empty", library, recursiveType, { field: undefined }),
	testTree("recursiveType-recursive", library, recursiveType, { field: { field: undefined } }),
	testTree("recursiveType-deeper", library, recursiveType, {
		field: { field: { field: { field: undefined } } },
	}),
];

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
