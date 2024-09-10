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
import {
	FieldKinds,
	FlexFieldSchema,
	FlexObjectNodeSchema,
	type FlexTreeSchema,
	type FullSchemaPolicy,
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
} from "../feature-libraries/index.js";
import type { TreeContent } from "../shared-tree/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	cursorFromInsertable,
	getFlexSchema,
	numberSchema,
	SchemaFactory,
	stringSchema,
	toFlexSchema,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type ValidateRecursiveSchema,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { jsonableTreesFromFieldCursor } from "./feature-libraries/chunked-forest/fieldCursorTestUtilities.js";
// eslint-disable-next-line import/no-internal-modules
import { fieldJsonCursor } from "./json/jsonCursor.js";
import { brand } from "../util/index.js";
import type { Partial } from "@sinclair/typebox";

interface TestTree {
	readonly name: string;
	readonly schemaData: FlexTreeSchema;
	readonly policy: FullSchemaPolicy;
	readonly treeFactory: (idCompressor?: IIdCompressor) => JsonableTree[];
}

function testSimpleTree<TSchema extends ImplicitFieldSchema>(
	name: string,
	schema: TSchema,
	rootNode: InsertableTreeFieldFromImplicitField<TSchema>,
): TestTree {
	const cursor = cursorFromInsertable(schema, rootNode);
	return test(
		name,
		toFlexSchema(schema),
		cursor === undefined ? [] : [jsonableTreeFromCursor(cursor)],
	);
}

function test(name: string, schemaData: FlexTreeSchema, data: JsonableTree[]): TestTree {
	return {
		name,
		schemaData,
		treeFactory: () => data,
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

export function treeContentFromTestTree(testData: TestTree): TreeContent {
	return {
		schema: testData.schemaData,
		initialTree: cursorsToFieldContent(
			testData.treeFactory().map(cursorForJsonableTreeNode),
			testData.schemaData.rootFieldSchema,
		),
	};
}

const factory = new SchemaFactory("test");
export class Minimal extends factory.object("minimal", {}) {}
export class HasMinimalValueField extends factory.object("hasMinimalValueField", {
	field: Minimal,
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
export const allTheFields = FlexObjectNodeSchema.create(
	{ name: "test" },
	brand("test.allTheFields"),
	{
		optional: FlexFieldSchema.create(FieldKinds.optional, [getFlexSchema(numberSchema)]),
		valueField: FlexFieldSchema.create(FieldKinds.required, [getFlexSchema(numberSchema)]),
		sequence: FlexFieldSchema.create(FieldKinds.sequence, [getFlexSchema(numberSchema)]),
	},
);

export class NumericMap extends factory.map("numericMap", factory.number) {}

export class RecursiveType extends factory.objectRecursive("recursiveType", {
	field: factory.optionalRecursive([() => RecursiveType]),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveType>;
}

const library = {
	nodeSchema: new Map([
		[brand(Minimal.identifier), getFlexSchema(Minimal)],
		[allTheFields.name, allTheFields],
		[brand(factory.number.identifier), getFlexSchema(factory.number)],
	]),
	policy: defaultSchemaPolicy,
	adapters: {},
} satisfies Partial<FlexTreeSchema>;

export const testTrees: readonly TestTree[] = [
	testSimpleTree("empty", factory.optional([]), undefined),
	testSimpleTree("null", factory.null, null),
	testSimpleTree("minimal", Minimal, {}),
	testSimpleTree("numeric", factory.number, 5),
	testSimpleTree("handle", factory.handle, new MockHandle(5)),
	test(
		"numericSequence",
		{
			...toFlexSchema(factory.number),
			rootFieldSchema: FlexFieldSchema.create(FieldKinds.sequence, [
				getFlexSchema(numberSchema),
			]),
		},
		jsonableTreesFromFieldCursor(fieldJsonCursor([1, 2, 3])),
	),
	{
		name: "node-with-identifier-field",
		schemaData: toFlexSchema(HasIdentifierField),
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return [jsonableTreeFromCursor(cursorFromInsertable(HasIdentifierField, { field: id }))];
		},
		policy: defaultSchemaPolicy,
	},
	{
		name: "identifier-field",
		schemaData: toFlexSchema(factory.identifier),
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return [{ type: brand(stringSchema.identifier), value: id }];
		},
		policy: defaultSchemaPolicy,
	},
	testSimpleTree("true boolean", factory.boolean, true),
	testSimpleTree("false boolean", factory.boolean, false),
	testSimpleTree("hasMinimalValueField", HasMinimalValueField, { field: {} }),
	testSimpleTree("hasNumericValueField", HasNumericValueField, { field: 5 }),
	testSimpleTree("hasPolymorphicValueField", HasPolymorphicValueField, { field: 5 }),
	testSimpleTree("hasOptionalField-empty", HasOptionalField, {}),
	test(
		"allTheFields-minimal",
		{
			...library,
			rootFieldSchema: FlexFieldSchema.create(FieldKinds.required, [allTheFields]),
		},
		[
			{
				type: allTheFields.name,
				fields: { valueField: [{ type: brand(numberSchema.identifier), value: 5 }] },
			},
		],
	),
	test(
		"allTheFields-full",
		{
			...library,
			rootFieldSchema: FlexFieldSchema.create(FieldKinds.required, [allTheFields]),
		},
		[
			{
				type: allTheFields.name,
				fields: {
					valueField: [{ type: brand(numberSchema.identifier), value: 5 }],
					optional: [{ type: brand(numberSchema.identifier), value: 5 }],
					sequence: [{ type: brand(numberSchema.identifier), value: 5 }],
				},
			},
		],
	),
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

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
// TODO: randomized schema generator
