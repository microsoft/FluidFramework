/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockHandle } from "@fluidframework/test-runtime-utils";
import { ITreeCursorSynchronous, JsonableTree } from "../core/index.js";
import { leaf } from "../domains/index.js";
import {
	AllowedTypesToFlexInsertableTree,
	Any,
	FieldKinds,
	FlexFieldSchema,
	FlexTreeNodeSchema,
	FlexTreeSchema,
	FullSchemaPolicy,
	InsertableFlexField,
	Multiplicity,
	SchemaBuilderBase,
	SchemaLibrary,
	cursorForJsonableTreeNode,
	cursorsForTypedFieldData,
	defaultSchemaPolicy,
	intoStoredSchemaCollection,
	jsonableTreeFromFieldCursor,
	typeNameSymbol,
	valueSymbol,
} from "../feature-libraries/index.js";
import { TreeContent } from "../shared-tree/index.js";

interface TestTree {
	readonly name: string;
	readonly schemaData: FlexTreeSchema;
	readonly policy: FullSchemaPolicy;
	readonly treeFactory: () => JsonableTree[];
}

function testTree<T extends FlexTreeNodeSchema>(
	name: string,
	schemaData: SchemaLibrary,
	rootNode: T,
	data: AllowedTypesToFlexInsertableTree<[T]>,
): TestTree {
	const fieldSchema = FlexFieldSchema.create(FieldKinds.required, [rootNode]);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FlexFieldSchema>(
	name: string,
	schemaLibrary: SchemaLibrary,
	rootField: T,
	data: InsertableFlexField<T>,
): TestTree {
	const schema = new SchemaBuilderBase(FieldKinds.required, {
		scope: name,
		lint: { rejectForbidden: false, rejectEmpty: false },
		libraries: [schemaLibrary],
	}).intoSchema(rootField);
	return {
		name,
		schemaData: schema,
		treeFactory: () => {
			const cursor = cursorsForTypedFieldData({ schema }, schema.rootFieldSchema, data);
			return jsonableTreeFromFieldCursor(cursor);
		},
		policy: defaultSchemaPolicy,
	};
}

function cursorsToFieldContent(
	cursors: readonly ITreeCursorSynchronous[],
	schema: FlexFieldSchema,
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
			test.treeFactory().map(cursorForJsonableTreeNode),
			test.schemaData.rootFieldSchema,
		),
	};
}

const builder = new SchemaBuilderBase(FieldKinds.required, {
	scope: "test",
	libraries: [leaf.library],
});
export const minimal = builder.object("minimal", {});
export const hasMinimalValueField = builder.object("hasMinimalValueField", {
	field: minimal,
});
export const hasNumericValueField = builder.object("hasNumericValueField", {
	field: leaf.number,
});
export const hasPolymorphicValueField = builder.object("hasPolymorphicValueField", {
	field: [leaf.number, minimal],
});
export const hasAnyValueField = builder.object("hasAnyValueField", {
	field: Any,
});
export const hasOptionalField = builder.object("hasOptionalField", {
	field: FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
});
export const allTheFields = builder.object("allTheFields", {
	optional: FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
	valueField: leaf.number,
	sequence: FlexFieldSchema.create(FieldKinds.sequence, [leaf.number]),
});
export const anyFields = builder.object("anyFields", {
	optional: FlexFieldSchema.create(FieldKinds.optional, [Any]),
	valueField: Any,
	sequence: FlexFieldSchema.create(FieldKinds.sequence, [Any]),
});
export const escapedFieldProperties = builder.object("escapedFieldProperties", {
	value: FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
	set: FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
	setValue: FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
	field: FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
});

export const numericMap = builder.map(
	"numericMap",
	FlexFieldSchema.create(FieldKinds.optional, [leaf.number]),
);

type NumericMapData = AllowedTypesToFlexInsertableTree<[typeof numericMap]>;

export const anyMap = builder.map("anyMap", FlexFieldSchema.create(FieldKinds.sequence, [Any]));

export const recursiveType = builder.objectRecursive("recursiveType", {
	field: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveType]),
});

export const library = builder.intoLibrary();
export const storedLibrary = intoStoredSchemaCollection(library);

export const testTrees: readonly TestTree[] = [
	testField("empty", library, FlexFieldSchema.create(FieldKinds.optional, []), undefined),
	testTree("null", library, leaf.null, null),
	testTree("minimal", library, minimal, {}),
	testTree("numeric", library, leaf.number, 5),
	testTree("handle", library, leaf.handle, new MockHandle(5)),
	testField(
		"numericSequence",
		library,
		FlexFieldSchema.create(FieldKinds.sequence, [leaf.number]),
		[1, 2, 3],
	),
	testTree("true boolean", library, leaf.boolean, true),
	testTree("false boolean", library, leaf.boolean, false),
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
	testTree("escapedFields", library, escapedFieldProperties, {
		value: 5,
		set: 6,
		setValue: 7,
		field: 8,
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
