/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import {
	type ITreeCursorSynchronous,
	type JsonableTree,
	Multiplicity,
} from "../core/index.js";
import { leaf, typedJsonCursor, type TypedJsonCompatible } from "../domains/index.js";
import {
	Any,
	FieldKinds,
	FlexFieldSchema,
	type FlexTreeNodeSchema,
	type FlexTreeSchema,
	type FullSchemaPolicy,
	SchemaBuilderBase,
	type SchemaLibrary,
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	intoStoredSchemaCollection,
	jsonableTreeFromCursor,
} from "../feature-libraries/index.js";
import type { TreeContent } from "../shared-tree/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { isReadonlyArray } from "../util/index.js";

interface TestTree {
	readonly name: string;
	readonly schemaData: FlexTreeSchema;
	readonly policy: FullSchemaPolicy;
	readonly treeFactory: (idCompressor?: IIdCompressor) => JsonableTree[];
}

function testTree(
	name: string,
	schemaData: SchemaLibrary,
	rootNode: FlexTreeNodeSchema,
	data: TypedJsonCompatible | undefined,
): TestTree {
	const fieldSchema = FlexFieldSchema.create(FieldKinds.required, [rootNode]);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FlexFieldSchema>(
	name: string,
	schemaLibrary: SchemaLibrary,
	rootField: T,
	data: TypedJsonCompatible | undefined,
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
			if (data === undefined) {
				return [];
			}

			if (isReadonlyArray(data)) {
				return data.map((d) => jsonableTreeFromCursor(typedJsonCursor(d)));
			}

			return [jsonableTreeFromCursor(typedJsonCursor(data))];
		},
		policy: defaultSchemaPolicy,
	};
}

function testIdentifierField(name: string, schemaLibrary: SchemaLibrary): TestTree {
	const schema = new SchemaBuilderBase(FieldKinds.required, {
		scope: name,
		lint: { rejectForbidden: false, rejectEmpty: false },
		libraries: [schemaLibrary],
	}).intoSchema(FlexFieldSchema.create(FieldKinds.identifier, [leaf.string]));
	return {
		name,
		schemaData: schema,
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return [jsonableTreeFromCursor(typedJsonCursor(id))];
		},
		policy: defaultSchemaPolicy,
	};
}

function testTreeWithIdentifier(name: string, schemaLibrary: SchemaLibrary): TestTree {
	const schema = new SchemaBuilderBase(FieldKinds.required, {
		scope: name,
		lint: { rejectForbidden: false, rejectEmpty: false },
		libraries: [schemaLibrary],
	}).intoSchema(hasIdentifierField);
	return {
		name,
		schemaData: schema,
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return [
				jsonableTreeFromCursor(
					typedJsonCursor({ [typedJsonCursor.type]: hasIdentifierField, field: id }),
				),
			];
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
export const hasIdentifierField = builder.object("hasIdentifierField", {
	field: FlexFieldSchema.create(FieldKinds.identifier, [leaf.string]),
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

export const anyMap = builder.map(
	"anyMap",
	FlexFieldSchema.create(FieldKinds.sequence, [Any]),
);

export const recursiveType = builder.objectRecursive("recursiveType", {
	field: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveType]),
});

export const library = builder.intoLibrary();
export const storedLibrary = intoStoredSchemaCollection(library);

export const testTrees: readonly TestTree[] = [
	testField("empty", library, FlexFieldSchema.create(FieldKinds.optional, []), undefined),
	testTree("null", library, leaf.null, null),
	testTree("minimal", library, minimal, { [typedJsonCursor.type]: minimal }),
	testTree("numeric", library, leaf.number, 5),
	testTree("handle", library, leaf.handle, new MockHandle(5)),
	testField(
		"numericSequence",
		library,
		FlexFieldSchema.create(FieldKinds.sequence, [leaf.number]),
		[1, 2, 3],
	),
	testTreeWithIdentifier("node-with-identifier-field", library),
	testIdentifierField("identifier-field", library),
	testTree("true boolean", library, leaf.boolean, true),
	testTree("false boolean", library, leaf.boolean, false),
	testTree("hasMinimalValueField", library, hasMinimalValueField, {
		[typedJsonCursor.type]: hasMinimalValueField,
		field: { [typedJsonCursor.type]: minimal },
	}),
	testTree("hasNumericValueField", library, hasNumericValueField, {
		[typedJsonCursor.type]: hasNumericValueField,
		field: 5,
	}),
	testTree("hasPolymorphicValueField", library, hasPolymorphicValueField, {
		[typedJsonCursor.type]: hasPolymorphicValueField,
		field: 5,
	}),
	testTree("hasOptionalField-empty", library, hasOptionalField, {
		[typedJsonCursor.type]: hasOptionalField,
	}),
	testTree("allTheFields-minimal", library, allTheFields, {
		[typedJsonCursor.type]: allTheFields,
		valueField: 5,
	}),
	testTree("allTheFields-full", library, allTheFields, {
		[typedJsonCursor.type]: allTheFields,
		valueField: 5,
		optional: 5,
		sequence: [5],
	}),
	testTree("anyFields-minimal", library, anyFields, {
		[typedJsonCursor.type]: anyFields,
		valueField: 5,
	}),
	testTree("anyFields-full", library, anyFields, {
		[typedJsonCursor.type]: anyFields,
		valueField: 5,
		optional: 5,
		sequence: [5, { [typedJsonCursor.type]: minimal }],
	}),
	testTree("escapedFields", library, escapedFieldProperties, {
		[typedJsonCursor.type]: escapedFieldProperties,
		value: 5,
		set: 6,
		setValue: 7,
		field: 8,
	}),

	testTree("numericMap-empty", library, numericMap, {
		[typedJsonCursor.type]: numericMap,
	}),
	testTree("anyMap-empty", library, anyMap, {
		[typedJsonCursor.type]: anyMap,
	}),

	testTree("numericMap-full", library, numericMap, {
		[typedJsonCursor.type]: numericMap,
		a: 5,
		b: 6,
	}),

	testTree("anyMap-full", library, anyMap, {
		[typedJsonCursor.type]: anyMap,
		a: [1, 2],
		b: [3],
	}),

	testTree("recursiveType-empty", library, recursiveType, {
		[typedJsonCursor.type]: recursiveType,
	}),
	testTree("recursiveType-recursive", library, recursiveType, {
		[typedJsonCursor.type]: recursiveType,
		field: { [typedJsonCursor.type]: recursiveType },
	}),
	testTree("recursiveType-deeper", library, recursiveType, {
		[typedJsonCursor.type]: recursiveType,

		field: {
			[typedJsonCursor.type]: recursiveType,
			field: {
				[typedJsonCursor.type]: recursiveType,
				field: { [typedJsonCursor.type]: recursiveType },
			},
		},
	}),
];

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
// TODO: randomized schema generator
