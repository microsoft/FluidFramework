/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree, ValueSchema } from "../../../../core";
import {
	Any,
	FieldKinds,
	FieldSchema,
	FullSchemaPolicy,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
	TypedSchemaCollection,
	cursorsForTypedFieldData,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	typeNameSymbol,
	valueSymbol,
} from "../../../../feature-libraries";

interface TestTree {
	readonly name: string;
	readonly schemaData: TypedSchemaCollection;
	readonly policy: FullSchemaPolicy;
	readonly schema: FieldSchema;
	readonly treeFactory: () => JsonableTree[];
}

function testTree<T extends TreeSchema>(
	name: string,
	schemaData: TypedSchemaCollection,
	schema: T,
	data: SchemaAware.AllowedTypesToTypedTrees<SchemaAware.ApiMode.Flexible, [T]>,
): TestTree {
	const fieldSchema = SchemaBuilder.fieldValue(schema);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FieldSchema>(
	name: string,
	schemaData: TypedSchemaCollection,
	schema: T,
	data: SchemaAware.TypedField<T, SchemaAware.ApiMode.Flexible>,
): TestTree {
	return {
		name,
		schema,
		treeFactory: () => {
			const cursors = cursorsForTypedFieldData({ schema: schemaData }, schema, data);
			return cursors.map(jsonableTreeFromCursor);
		},
		schemaData,
		policy: defaultSchemaPolicy,
	};
}

const builder = new SchemaBuilder("test");
export const minimal = builder.struct("minimal", {});
export const numeric = builder.leaf("numeric", ValueSchema.Number);
export const serializable = builder.leaf("serializable", ValueSchema.Serializable);
export const hasMinimalValueField = builder.struct("hasMinimalValueField", {
	field: SchemaBuilder.fieldValue(minimal),
});
export const hasNumericValueField = builder.struct("hasNumericValueField", {
	field: SchemaBuilder.fieldValue(numeric),
});
export const hasPolymorphicValueField = builder.struct("hasPolymorphicValueField", {
	field: SchemaBuilder.fieldValue(numeric, minimal),
});
export const hasAnyValueField = builder.struct("hasAnyValueField", {
	field: SchemaBuilder.fieldValue(Any),
});
export const hasOptionalField = builder.struct("hasOptionalField", {
	field: SchemaBuilder.fieldOptional(numeric),
});
export const allTheFields = builder.struct("allTheFields", {
	optional: SchemaBuilder.fieldOptional(numeric),
	value: SchemaBuilder.fieldValue(numeric),
	sequence: SchemaBuilder.fieldSequence(numeric),
});
export const anyFields = builder.struct("anyFields", {
	optional: SchemaBuilder.fieldOptional(Any),
	value: SchemaBuilder.fieldValue(Any),
	sequence: SchemaBuilder.fieldSequence(Any),
});

export const numericMap = builder.map("numericMap", SchemaBuilder.fieldOptional(numeric));

type NumericMapData = SchemaAware.AllowedTypesToTypedTrees<
	SchemaAware.ApiMode.Flexible,
	[typeof numericMap]
>;

export const anyMap = builder.map("anyMap", SchemaBuilder.fieldSequence(Any));

export const recursiveType = builder.structRecursive("recursiveType", {
	field: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => recursiveType),
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
	testTree("allTheFields-minimal", library, allTheFields, {
		value: 5,
		optional: undefined,
		sequence: [],
	}),
	testTree("allTheFields-full", library, allTheFields, {
		value: 5,
		optional: 5,
		sequence: [5],
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
	}),

	testTree("numericMap-empty", library, numericMap, {}),
	testTree("anyMap-empty", library, anyMap, {}),

	testTree("numericMap-full", library, numericMap, {
		a: 5,
		b: 6,
		// TODO: SchemaAware API for map nodes, and remove this cast
	} as any),

	testTree("anyMap-full", library, anyMap, {
		a: [
			{ [typeNameSymbol]: numeric.name, [valueSymbol]: 1 },
			{ [typeNameSymbol]: numeric.name, [valueSymbol]: 2 },
		],
		b: [{ [typeNameSymbol]: numeric.name, [valueSymbol]: 3 }],
		// TODO: SchemaAware API for map nodes, and remove this cast
	} as any),

	testTree("recursiveType-empty", library, recursiveType, { field: undefined }),
	testTree("recursiveType-recursive", library, recursiveType, { field: { field: undefined } }),
	testTree("recursiveType-deeper", library, recursiveType, {
		field: { field: { field: { field: undefined } } },
	}),
];

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
// TODO: randomized schema generator
