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
	TreeStoredSchemaRepository,
	type TreeTypeSet,
} from "../core/index.js";
import {
	FieldKinds,
	type FlexFieldKind,
	type FullSchemaPolicy,
	cursorForJsonableTreeField,
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	fieldKinds,
	jsonableTreeFromFieldCursor,
} from "../feature-libraries/index.js";
import {
	ForestTypeExpensiveDebug,
	type SchematizingSimpleTreeView,
	type TreeStoredContent,
} from "../shared-tree/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	getStoredSchema,
	numberSchema,
	SchemaFactoryAlpha,
	stringSchema,
	toStoredSchema,
	type UnsafeUnknownSchema,
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type ValidateRecursiveSchema,
	type LazyItem,
	schemaStatics,
	type TreeView,
	TreeViewConfigurationAlpha,
	toInitialSchema,
	restrictiveStoredSchemaGenerationOptions,
	permissiveStoredSchemaGenerationOptions,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { fieldJsonCursor } from "./json/jsonCursor.js";
import { brand } from "../util/index.js";
import type { Partial } from "@sinclair/typebox";
// eslint-disable-next-line import/no-internal-modules
import { isLazy } from "../simple-tree/core/index.js";
import { fieldCursorFromInsertable, testIdCompressor } from "./utils.js";
// eslint-disable-next-line import/no-internal-modules
import { typeboxValidator } from "../external-utilities/typeboxValidator.js";
// eslint-disable-next-line import/no-internal-modules
import { independentInitializedViewInternal } from "../shared-tree/independentView.js";

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

/**
 * Content for a test document, which can have a different stored schema than just toStoredSchema(schema).
 */
export interface TestDocument extends TestTree, Omit<TestSimpleTree, "root"> {
	/**
	 * True if and only if the document had content in unknown optional fields.
	 */
	readonly hasUnknownOptionalFields?: true;

	/**
	 * True if and only if the document had staged allowed types.
	 */
	readonly hasStagedSchema?: true;

	/**
	 * True if and only if the document content requires staged allowed types.
	 *
	 * For this to be the case, the stored schema must also have had the staged type included.
	 */
	readonly requiresStagedSchema?: true;
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
	return test(
		data.name,
		toInitialSchema(data.schema),
		jsonableTreeFromFieldCursor(
			fieldCursorFromInsertable<UnsafeUnknownSchema>(data.schema, data.root()),
		),
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

const factory = new SchemaFactoryAlpha("test");
export class Minimal extends factory.objectAlpha("minimal", {}) {}
export class Minimal2 extends factory.objectAlpha("minimal2", {}) {}
export class HasMinimalValueField extends factory.objectAlpha("hasMinimalValueField", {
	field: Minimal,
}) {}
export class HasRenamedField extends factory.objectAlpha("hasRenamedField", {
	field: factory.required(Minimal, { key: "stored-name" }),
}) {}

export class HasDescriptions extends factory.objectAlpha(
	"hasDescriptions",
	{
		field: factory.required(Minimal, { metadata: { description: "the field" } }),
	},
	{ metadata: { description: "root object" } },
) {}

export class HasAllMetadata extends factory.objectAlpha(
	"hasDescriptions",
	{
		field: factory.required(Minimal, {
			metadata: { description: "the field", custom: "CustomField" },
			key: "stored-name",
		}),
	},
	{
		metadata: { description: "root object", custom: "CustomNode" },
		allowUnknownOptionalFields: true,
	},
) {}

export class HasAmbiguousField extends factory.objectAlpha("hasAmbiguousField", {
	field: [Minimal, Minimal2],
}) {}
export class HasNumericValueField extends factory.objectAlpha("hasNumericValueField", {
	field: factory.number,
}) {}
export class HasPolymorphicValueField extends factory.objectAlpha("hasPolymorphicValueField", {
	field: [factory.number, Minimal],
}) {}
export class HasOptionalField extends factory.objectAlpha("hasOptionalField", {
	field: factory.optional(factory.number),
}) {}
export class HasIdentifierField extends factory.objectAlpha("hasIdentifierField", {
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
				persistedMetadata: undefined,
			},
		],
		[
			brand("valueField"),
			{
				kind: FieldKinds.required.identifier,
				types: numberSet,
				persistedMetadata: undefined,
			},
		],
		[
			brand("sequence"),
			{
				kind: FieldKinds.sequence.identifier,
				types: numberSet,
				persistedMetadata: undefined,
			},
		],
	]),
);

export class NumericMap extends factory.map("numericMap", factory.number) {}
export class NumericRecord extends factory.record("numericRecord", factory.number) {}

export class RecursiveType extends factory.objectRecursive("recursiveType", {
	field: factory.optionalRecursive([() => RecursiveType]),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveType>;
}

const allTheFieldsName: TreeNodeSchemaIdentifier = brand("test.allTheFields");

const library = {
	nodeSchema: new Map([
		[
			brand(Minimal.identifier),
			getStoredSchema(Minimal, restrictiveStoredSchemaGenerationOptions),
		],
		[allTheFieldsName, allTheFields],
		[
			brand(factory.number.identifier),
			getStoredSchema(schemaStatics.number, restrictiveStoredSchemaGenerationOptions),
		],
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
	testSimpleTree("hasDescriptions", HasDescriptions, { field: {} }),
	testSimpleTree("hasAllMetadata", HasAllMetadata, { field: {} }),
	testSimpleTree(
		"hasAllMetadataRootField",
		SchemaFactoryAlpha.optional(HasAllMetadata, {
			key: "unused root key",
			metadata: { description: "root field", custom: "root field custom" },
		}),
		{ field: {} },
	),
	testSimpleTree("hasNumericValueField", HasNumericValueField, { field: 5 }),
	testSimpleTree("hasPolymorphicValueField", HasPolymorphicValueField, { field: 5 }),
	testSimpleTree("hasOptionalField-empty", HasOptionalField, {}),
	testSimpleTree("numericMap-empty", NumericMap, {}),
	testSimpleTree("numericMap-full", NumericMap, { a: 5, b: 6 }),
	testSimpleTree("numericRecord-empty", NumericRecord, {}),
	testSimpleTree("numericRecord-full", NumericRecord, { a: 5, b: 6 }),
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
			...toStoredSchema(factory.number, restrictiveStoredSchemaGenerationOptions),
			rootFieldSchema: {
				kind: FieldKinds.sequence.identifier,
				types: numberSet,
				persistedMetadata: undefined,
			},
		},
		jsonableTreeFromFieldCursor(fieldJsonCursor([1, 2, 3])),
	),
	{
		name: "node-with-identifier-field",
		schemaData: toStoredSchema(HasIdentifierField, restrictiveStoredSchemaGenerationOptions),
		treeFactory: (idCompressor?: IIdCompressor) => {
			assert(idCompressor !== undefined, "idCompressor must be provided");
			const id = idCompressor.decompress(idCompressor.generateCompressedId());
			return jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(HasIdentifierField, { field: id }),
			);
		},
		policy: defaultSchemaPolicy,
	},
	{
		name: "identifier-field",
		schemaData: toStoredSchema(factory.identifier, restrictiveStoredSchemaGenerationOptions),
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
				persistedMetadata: undefined,
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
				persistedMetadata: undefined,
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

export class HasUnknownOptionalFields extends factory.objectAlpha(
	"hasUnknownOptionalFields",
	{},
	{
		allowUnknownOptionalFields: true,
	},
) {}

export class HasUnknownOptionalFieldsV2 extends factory.objectRecursive(
	"hasUnknownOptionalFields",
	{
		recursive: factory.optionalRecursive([() => HasUnknownOptionalFieldsV2]),
		minimal: factory.optional(Minimal),
		hasMinimalValueField: factory.optional(HasMinimalValueField),
		leaf: factory.optional(SchemaFactoryAlpha.string),
	},
	{
		allowUnknownOptionalFields: true,
	},
) {}

export class HasStagedAllowedTypes extends factory.objectAlpha("hasStagedAllowedTypes", {
	x: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string)],
}) {}

export class HasStagedAllowedTypesAfterUpdate extends factory.objectAlpha(
	"hasStagedAllowedTypes",
	{
		x: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.string],
	},
) {}

class MapWithStaged extends factory.mapAlpha("MapWithStaged", [
	SchemaFactoryAlpha.number,
	SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
]) {}

class ArrayWithStaged extends factory.arrayAlpha("ArrayWithStaged", [
	SchemaFactoryAlpha.number,
	SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
]) {}

const multiStageCUpgrade = SchemaFactoryAlpha.staged(ArrayWithStaged);

class NestedMultiStage extends factory.object("NestedMultiStage", {
	a: SchemaFactoryAlpha.optional(SchemaFactoryAlpha.staged(SchemaFactoryAlpha.number)),
	b: SchemaFactoryAlpha.required([
		SchemaFactoryAlpha.staged({
			type: () => MapWithStaged,
			metadata: {},
		}),
		SchemaFactoryAlpha.null,
	]),
	c: SchemaFactoryAlpha.required([multiStageCUpgrade, SchemaFactoryAlpha.null]),
}) {}

// TODO: AB#45711: add recursive staged schema tests documents

/**
 * Collection of {@link TestDocument|TestDocuments}.
 *
 * Use these test documents to test import and export APIs.
 *
 * Can be used to test schema evolution related features where view and stored schema can diverge.
 * Includes for example documents with unknown optional fields;
 *
 * TODO: will include documents with staged allowed types (once supported) both before and after the stored schema update.
 */
export const testDocuments: readonly TestDocument[] = [
	...testSimpleTrees.map(
		(tree): TestDocument => ({
			name: tree.name,
			schema: tree.schema,
			ambiguous: tree.ambiguous,
			policy: defaultSchemaPolicy,
			schemaData: toInitialSchema(tree.schema),
			treeFactory: () =>
				jsonableTreeFromFieldCursor(
					fieldCursorFromInsertable<UnsafeUnknownSchema>(tree.schema, tree.root()),
				),
		}),
	),
	{
		ambiguous: false,
		name: "AllowsUnknownOptionalFields",
		schema: HasUnknownOptionalFields,
		// Unknown optional fields are allowed but empty in this document.
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(HasUnknownOptionalFieldsV2),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(HasUnknownOptionalFields, {})),
	},
	{
		ambiguous: false,
		name: "HasUnknownOptionalFields",
		schema: HasUnknownOptionalFields,
		hasUnknownOptionalFields: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(HasUnknownOptionalFieldsV2),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(
					HasUnknownOptionalFieldsV2,
					new HasUnknownOptionalFieldsV2({
						recursive: new HasUnknownOptionalFieldsV2({ leaf: "nested leaf" }),
						minimal: {},
						hasMinimalValueField: { field: {} },
						leaf: "leaf",
					}),
				),
			),
	},
	{
		ambiguous: false,
		name: "HasStagedAllowedTypesBeforeUpdate",
		schema: HasStagedAllowedTypes,
		hasStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(HasStagedAllowedTypes),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(HasStagedAllowedTypes, { x: 5 })),
	},
	{
		ambiguous: false,
		name: "HasStagedAllowedTypesAfterUpdate",
		schema: HasStagedAllowedTypes,
		hasStagedSchema: true,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(HasStagedAllowedTypesAfterUpdate),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(HasStagedAllowedTypes, { x: "text" }),
			),
	},
	{
		ambiguous: false,
		name: "Staged in root",
		schema: SchemaFactoryAlpha.required([
			SchemaFactoryAlpha.number,
			SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
		]),
		hasStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(SchemaFactoryAlpha.number),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(SchemaFactoryAlpha.number, 5)),
	},
	{
		ambiguous: false,
		name: "Staged node in root",
		schema: SchemaFactoryAlpha.required([
			SchemaFactoryAlpha.number,
			SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
		]),
		hasStagedSchema: true,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(
			SchemaFactoryAlpha.required([SchemaFactoryAlpha.number, SchemaFactoryAlpha.string]),
		),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(SchemaFactoryAlpha.string, "text"),
			),
	},
	{
		ambiguous: false,
		name: "Staged in map",
		schema: MapWithStaged,
		hasStagedSchema: true,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(MapWithStaged, permissiveStoredSchemaGenerationOptions),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(MapWithStaged, [["key", "text"]])),
	},
	{
		ambiguous: false,
		name: "NestedMultiStage with no upgrades",
		schema: NestedMultiStage,
		hasStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedMultiStage, restrictiveStoredSchemaGenerationOptions),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(NestedMultiStage, { b: null, c: null }),
			),
	},
	{
		ambiguous: false,
		name: "NestedMultiStage with one upgrade",
		schema: NestedMultiStage,
		hasStagedSchema: true,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedMultiStage, {
			includeStaged: (upgrade) => upgrade === multiStageCUpgrade.metadata.stagedSchemaUpgrade,
		}),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(NestedMultiStage, { b: null, c: [5] }),
			),
	},
	{
		ambiguous: false,
		name: "NestedMultiStage with all upgrades",
		schema: NestedMultiStage,
		hasStagedSchema: true,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedMultiStage, permissiveStoredSchemaGenerationOptions),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(NestedMultiStage, { a: 5, b: [], c: ["text"] }),
			),
	},
];

export function testDocumentIndependentView(
	document: Pick<TestDocument, "schema" | "treeFactory" | "schemaData" | "ambiguous">,
): SchematizingSimpleTreeView<UnsafeUnknownSchema> {
	const config = new TreeViewConfigurationAlpha({
		schema: document.schema,
		preventAmbiguity: !document.ambiguous,
		enableSchemaValidation: true,
	});
	const idCompressor = testIdCompressor;

	const cursor = cursorForJsonableTreeField(document.treeFactory(idCompressor));

	const view: SchematizingSimpleTreeView<ImplicitFieldSchema> =
		independentInitializedViewInternal(
			config,
			{
				forest: ForestTypeExpensiveDebug,
				jsonValidator: typeboxValidator,
			},
			new TreeStoredSchemaRepository(document.schemaData),
			cursor,
			idCompressor,
		);
	return view as TreeView<ImplicitFieldSchema> as SchematizingSimpleTreeView<UnsafeUnknownSchema>;
}

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
// TODO: randomized schema generator
