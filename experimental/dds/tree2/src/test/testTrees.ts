/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITreeCursorSynchronous, JsonableTree, ValueSchema } from "../core";
import {
	Any,
	FieldKinds,
	FieldSchema,
	FullSchemaPolicy,
	Multiplicity,
	SchemaAware,
	SchemaBuilder,
	SchemaLibrary,
	TreeSchema,
	TypedSchemaCollection,
	cursorsForTypedFieldData,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	singleTextCursor,
	typeNameSymbol,
	valueSymbol,
} from "../feature-libraries";
import { TreeContent } from "../shared-tree";

interface TestTree {
	readonly name: string;
	readonly schemaData: TypedSchemaCollection;
	readonly policy: FullSchemaPolicy;
	readonly treeFactory: () => JsonableTree[];
}

function testTree<T extends TreeSchema>(
	name: string,
	schemaData: SchemaLibrary,
	rootNode: T,
	data: SchemaAware.AllowedTypesToTypedTrees<SchemaAware.ApiMode.Flexible, [T]>,
): TestTree {
	const fieldSchema = SchemaBuilder.fieldValue(rootNode);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FieldSchema>(
	name: string,
	schemaLibrary: SchemaLibrary,
	rootField: T,
	data: SchemaAware.TypedField<T, SchemaAware.ApiMode.Flexible>,
): TestTree {
	const schema = new SchemaBuilder(
		name,
		{ rejectForbidden: false, rejectEmpty: false },
		schemaLibrary,
	).intoDocumentSchema(rootField);
	return {
		name,
		schemaData: schema,
		treeFactory: () => {
			const cursors = cursorsForTypedFieldData({ schema }, schema.rootFieldSchema, data);
			return cursors.map(jsonableTreeFromCursor);
		},
		policy: defaultSchemaPolicy,
	};
}

function cursorsToFieldContent(
	cursors: readonly ITreeCursorSynchronous[],
	schema: FieldSchema,
): readonly ITreeCursorSynchronous[] | ITreeCursorSynchronous | undefined {
	if (schema.kind.multiplicity === Multiplicity.Sequence) {
		return cursors;
	}
	if (cursors.length === 1) {
		return cursors[0];
	}
	assert(cursors.length === 0);
	return undefined;
}

export function treeContentFromTestTree(test: TestTree): TreeContent {
	return {
		schema: test.schemaData,
		initialTree: cursorsToFieldContent(
			test.treeFactory().map(singleTextCursor),
			test.schemaData.rootFieldSchema,
		),
	};
}

const builder = new SchemaBuilder("test");
export const minimal = builder.struct("minimal", {});
export const numeric = builder.leaf("numeric", ValueSchema.Number);
export const bool = builder.leaf("bool", ValueSchema.Boolean);
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
	valueField: SchemaBuilder.fieldValue(numeric),
	sequence: SchemaBuilder.fieldSequence(numeric),
});
export const anyFields = builder.struct("anyFields", {
	optional: SchemaBuilder.fieldOptional(Any),
	valueField: SchemaBuilder.fieldValue(Any),
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
	testTree("true boolean", library, bool, {
		[typeNameSymbol]: "bool",
		[valueSymbol]: true,
	}),
	testTree("false boolean", library, bool, {
		[typeNameSymbol]: "bool",
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
		valueField: 5,
		optional: undefined,
		sequence: [],
	}),
	testTree("allTheFields-full", library, allTheFields, {
		valueField: 5,
		optional: 5,
		sequence: [5],
	}),
	testTree("anyFields-minimal", library, anyFields, {
		valueField: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		optional: undefined,
		sequence: [],
	}),
	testTree("anyFields-full", library, anyFields, {
		valueField: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
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
