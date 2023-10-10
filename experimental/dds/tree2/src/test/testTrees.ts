/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITreeCursorSynchronous, JsonableTree } from "../core";
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
import { leaf } from "../domains";

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
	const fieldSchema = SchemaBuilder.fieldRequired(rootNode);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FieldSchema>(
	name: string,
	schemaLibrary: SchemaLibrary,
	rootField: T,
	data: SchemaAware.TypedField<T, SchemaAware.ApiMode.Flexible>,
): TestTree {
	const schema = new SchemaBuilder({
		scope: name,
		lint: { rejectForbidden: false, rejectEmpty: false },
		libraries: [schemaLibrary],
	}).toDocumentSchema(rootField);
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

const builder = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
export const minimal = builder.struct("minimal", {});
export const hasMinimalValueField = builder.struct("hasMinimalValueField", {
	field: minimal,
});
export const hasNumericValueField = builder.struct("hasNumericValueField", {
	field: leaf.number,
});
export const hasPolymorphicValueField = builder.struct("hasPolymorphicValueField", {
	field: [leaf.number, minimal],
});
export const hasAnyValueField = builder.struct("hasAnyValueField", {
	field: Any,
});
export const hasOptionalField = builder.struct("hasOptionalField", {
	field: SchemaBuilder.fieldOptional(leaf.number),
});
export const allTheFields = builder.struct("allTheFields", {
	optional: SchemaBuilder.fieldOptional(leaf.number),
	valueField: leaf.number,
	sequence: SchemaBuilder.fieldSequence(leaf.number),
});
export const anyFields = builder.struct("anyFields", {
	optional: SchemaBuilder.fieldOptional(Any),
	valueField: Any,
	sequence: SchemaBuilder.fieldSequence(Any),
});

export const numericMap = builder.map("numericMap", SchemaBuilder.fieldOptional(leaf.number));

type NumericMapData = SchemaAware.AllowedTypesToTypedTrees<
	SchemaAware.ApiMode.Flexible,
	[typeof numericMap]
>;

export const anyMap = builder.map("anyMap", SchemaBuilder.fieldSequence(Any));

export const recursiveType = builder.structRecursive("recursiveType", {
	field: FieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveType]),
});

export const library = builder.finalize();

export const testTrees: readonly TestTree[] = [
	testField("empty", library, SchemaBuilder.fieldOptional(), undefined),
	testTree("minimal", library, minimal, {}),
	testTree("numeric", library, leaf.number, 5),
	testField("numericSequence", library, SchemaBuilder.fieldSequence(leaf.number), [1, 2, 3]),
	testTree("true boolean", library, leaf.boolean, {
		[typeNameSymbol]: leaf.boolean.name,
		[valueSymbol]: true,
	}),
	testTree("false boolean", library, leaf.boolean, {
		[typeNameSymbol]: leaf.boolean.name,
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
			[typeNameSymbol]: leaf.number.name,
			[valueSymbol]: 5,
		},
	}),
	testTree("hasAnyValueFieldRecursive", library, hasAnyValueField, {
		field: {
			[typeNameSymbol]: hasAnyValueField.name,
			field: {
				[typeNameSymbol]: leaf.number.name,
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
		valueField: { [typeNameSymbol]: leaf.number.name, [valueSymbol]: 5 },
		optional: undefined,
		sequence: [],
	}),
	testTree("anyFields-full", library, anyFields, {
		valueField: { [typeNameSymbol]: leaf.number.name, [valueSymbol]: 5 },
		optional: { [typeNameSymbol]: leaf.number.name, [valueSymbol]: 5 },
		sequence: [
			{ [typeNameSymbol]: leaf.number.name, [valueSymbol]: 5 },
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
			{ [typeNameSymbol]: leaf.number.name, [valueSymbol]: 1 },
			{ [typeNameSymbol]: leaf.number.name, [valueSymbol]: 2 },
		],
		b: [{ [typeNameSymbol]: leaf.number.name, [valueSymbol]: 3 }],
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
