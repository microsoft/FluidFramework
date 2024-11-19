/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import {
	type ITreeCursorSynchronous,
	type JsonableTree,
	Multiplicity,
	ObjectNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	type TreeTypeSet,
} from "../core/index.js";
import {
	FieldKinds,
	type FlexFieldKind,
	type FullSchemaPolicy,
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	fieldKinds,
	jsonableTreeFromCursor,
} from "../feature-libraries/index.js";
import type { TreeStoredContent } from "../shared-tree/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	cursorFromInsertable,
	getStoredSchema,
	numberSchema,
	SchemaFactory,
	stringSchema,
	toStoredSchema,
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type UnsafeUnknownSchema,
	type ValidateRecursiveSchema,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { jsonableTreesFromFieldCursor } from "./feature-libraries/chunked-forest/fieldCursorTestUtilities.js";
// eslint-disable-next-line import/no-internal-modules
import { fieldJsonCursor } from "./json/jsonCursor.js";
import { brand } from "../util/index.js";
import type { Partial } from "@sinclair/typebox";
// eslint-disable-next-line import/no-internal-modules
import { isLazy, type LazyItem } from "../simple-tree/flexList.js";

interface TestSimpleTree {
	readonly name: string;
	readonly schema: ImplicitFieldSchema;
	/**
	 * InsertableTreeFieldFromImplicitField<TSchema>
	 */
	root(): InsertableField<UnsafeUnknownSchema>;
	readonly ambiguous: boolean;
}

interface TestTree {
	readonly name: string;
	readonly schemaData: TreeStoredSchema;
	readonly policy: FullSchemaPolicy;
	readonly treeFactory: (idCompressor?: IIdCompressor) => JsonableTree[];
}

function testSimpleTree<const TSchema extends ImplicitFieldSchema>(
	name: string,
	schema: TSchema,
	root: LazyItem<InsertableTreeFieldFromImplicitField<TSchema>>,
	ambiguous = false,
): TestSimpleTree {
	const normalizedLazy = isLazy(root) ? root : () => root;
	return {
		name,
		schema,
		root: normalizedLazy as () => InsertableField<UnsafeUnknownSchema>,
		ambiguous,
	};
}

function convertSimpleTreeTest(data: TestSimpleTree): TestTree {
	const cursor = cursorFromInsertable<UnsafeUnknownSchema>(data.schema, data.root());
	return test(
		data.name,
		toStoredSchema(data.schema),
		cursor === undefined ? [] : [jsonableTreeFromCursor(cursor)],
	);
}

function test(name: string, schemaData: TreeStoredSchema, data: JsonableTree[]): TestTree {
	return {
		name,
		schemaData,
		treeFactory: () => data,
		policy: defaultSchemaPolicy,
	};
}

function cursorsToFieldContent(
	cursors: readonly ITreeCursorSynchronous[],
	schema: FlexFieldKind,
): readonly ITreeCursorSynchronous[] | ITreeCursorSynchronous | undefined {
	if (schema.multiplicity === Multiplicity.Sequence) {
		return cursors;
	}
	if (cursors.length === 1) {
		return cursors[0];
	}
	assert(cursors.length === 0);
	return undefined;
}

export function treeContentFromTestTree(testData: TestTree): TreeStoredContent {
	return {
		schema: testData.schemaData,
		initialTree: cursorsToFieldContent(
			testData.treeFactory().map(cursorForJsonableTreeNode),
			fieldKinds.get(testData.schemaData.rootFieldSchema.kind) ?? fail("missing kind"),
		),
	};
}

const factory = new SchemaFactory("test");
export class Minimal extends factory.object("minimal", {}) {}
export class Minimal2 extends factory.object("minimal2", {}) {}
export class HasMinimalValueField extends factory.object("hasMinimalValueField", {
	field: Minimal,
}) {}
export class HasRenamedField extends factory.object("hasRenamedField", {
	field: factory.required(Minimal, { key: "stored-name" }),
}) {}
export class HasAmbiguousField extends factory.object("hasAmbiguousField", {
	field: [Minimal, Minimal2],
}) {}
export class HasNumericValueField extends factory.object("hasNumericValueField", {
	field: factory.number,
}) {}
export class HasPolymorphicValueField extends factory.object("hasPolymorphicValueField", {
	field: [factory.number, Minimal],
}) {}
export class HasOptionalField extends factory.object("hasOptionalField", {
	field: factory.optional(factory.number),
}) {}
export class HasIdentifierField extends factory.object("hasIdentifierField", {
	field: factory.identifier,
}) {}

const numberSet: TreeTypeSet = new Set([brand(numberSchema.identifier)]);
export const allTheFields = new ObjectNodeStoredSchema(
	new Map([
		[
			brand("optional"),
			{
				kind: FieldKinds.optional.identifier,
				types: numberSet,
			},
		],
		[
			brand("valueField"),
			{
				kind: FieldKinds.required.identifier,
				types: numberSet,
			},
		],
		[
			brand("sequence"),
			{
				kind: FieldKinds.sequence.identifier,
				types: numberSet,
			},
		],
	]),
);

export class NumericMap extends factory.map("numericMap", factory.number) {}

export class RecursiveType extends factory.objectRecursive("recursiveType", {
	field: factory.optionalRecursive([() => RecursiveType]),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveType>;
}

const allTheFieldsName: TreeNodeSchemaIdentifier = brand("test.allTheFields");

const library = {
	nodeSchema: new Map([
		[brand(Minimal.identifier), getStoredSchema(Minimal)],
		[allTheFieldsName, allTheFields],
		[brand(factory.number.identifier), getStoredSchema(factory.number)],
	]),
} satisfies Partial<TreeStoredSchema>;

export const testSimpleTrees: readonly TestSimpleTree[] = [
	testSimpleTree("empty", factory.optional([]), undefined),
	testSimpleTree("null", factory.null, null),
	testSimpleTree("minimal", Minimal, {}),
	testSimpleTree("numeric", factory.number, 5),
	testSimpleTree("handle", factory.handle, new MockHandle(5)),
	testSimpleTree("true boolean", factory.boolean, true),
	testSimpleTree("false boolean", factory.boolean, false),
	testSimpleTree("hasMinimalValueField", HasMinimalValueField, { field: {} }),
	testSimpleTree("hasRenamedField", HasRenamedField, { field: {} }),
	testSimpleTree(
		"hasAmbiguousField",
		HasAmbiguousField,
		() => ({ field: new Minimal({}) }),
		true,
	),
	testSimpleTree("hasNumericValueField", HasNumericValueField, { field: 5 }),
	testSimpleTree("hasPolymorphicValueField", HasPolymorphicValueField, { field: 5 }),
	testSimpleTree("hasOptionalField-empty", HasOptionalField, {}),
	testSimpleTree("numericMap-empty", NumericMap, {}),
	testSimpleTree("numericMap-full", NumericMap, { a: 5, b: 6 }),
	testSimpleTree("recursiveType-empty", RecursiveType, new RecursiveType({})),
	testSimpleTree(
		"recursiveType-recursive",
		RecursiveType,
		new RecursiveType({ field: new RecursiveType({}) }),
	),
	testSimpleTree(
		"recursiveType-deeper",
		RecursiveType,
		new RecursiveType({
			field: new RecursiveType({ field: new RecursiveType({ field: new RecursiveType({}) }) }),
		}),
	),
];

export const testTrees: readonly TestTree[] = [
	...testSimpleTrees.map(convertSimpleTreeTest),
	test(
		"numericSequence",
		{
			...toStoredSchema(factory.number),
			rootFieldSchema: { kind: FieldKinds.sequence.identifier, types: numberSet },
		},
		jsonableTreesFromFieldCursor(fieldJsonCursor([1, 2, 3])),
	),
	{
		name: "node-with-identifier-field",
		schemaData: toStoredSchema(HasIdentifierField),
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return [jsonableTreeFromCursor(cursorFromInsertable(HasIdentifierField, { field: id }))];
		},
		policy: defaultSchemaPolicy,
	},
	{
		name: "identifier-field",
		schemaData: toStoredSchema(factory.identifier),
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return [{ type: brand(stringSchema.identifier), value: id }];
		},
		policy: defaultSchemaPolicy,
	},

	test(
		"allTheFields-minimal",
		{
			...library,
			rootFieldSchema: {
				kind: FieldKinds.required.identifier,
				types: new Set([allTheFieldsName]),
			},
		},
		[
			{
				type: allTheFieldsName,
				fields: { valueField: [{ type: brand(numberSchema.identifier), value: 5 }] },
			},
		],
	),
	test(
		"allTheFields-full",
		{
			...library,
			rootFieldSchema: {
				kind: FieldKinds.required.identifier,
				types: new Set([allTheFieldsName]),
			},
		},
		[
			{
				type: allTheFieldsName,
				fields: {
					valueField: [{ type: brand(numberSchema.identifier), value: 5 }],
					optional: [{ type: brand(numberSchema.identifier), value: 5 }],
					sequence: [{ type: brand(numberSchema.identifier), value: 5 }],
				},
			},
		],
	),
];

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
// TODO: randomized schema generator
