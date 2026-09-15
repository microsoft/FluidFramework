/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import type { ICodecOptions } from "../codec/index.js";
import {
	type ITreeCursorSynchronous,
	type JsonableTree,
	ObjectNodeStoredSchema,
	type RevisionTag,
	RevisionTagCodec,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeTypeSet,
} from "../core/index.js";
import { FormatValidatorBasic } from "../external-utilities/index.js";
import {
	FieldKinds,
	type FullSchemaPolicy,
	combineChunks,
	createNodeIdentifierManager,
	cursorForJsonableTreeField,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	jsonableTreeFromFieldCursor,
} from "../feature-libraries/index.js";
import {
	buildConfiguredForest,
	createTreeCheckout,
	defaultSharedTreeOptions,
	ForestTypeExpensiveDebug,
	initialize,
	initializerFromChunk,
	SchematizingSimpleTreeView,
	type ForestOptions,
} from "../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { isLazy, type SchemaUpgrade } from "../simple-tree/core/index.js";
import {
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
	StagedSchemaUpgradePolicy,
	type TreeViewConfiguration,
	type FieldSchemaAlpha,
	normalizeFieldSchema,
	walkFieldSchema,
	ObjectNodeSchema,
} from "../simple-tree/index.js";
import { brand, Breakable } from "../util/index.js";

// eslint-disable-next-line import-x/no-internal-modules
import { fieldJsonCursor } from "./json/jsonCursor.js";
import { fieldCursorFromInsertable, testIdCompressor } from "./utils.js";

interface NamedCase {
	/**
	 * A descriptive name for what is special about this configuration, used in test names.
	 */
	readonly name: string;
}

/**
 * A schema paired with an in-schema tree that can be expressed using the user-facing (aka "simple-tree") API surface.
 */
interface TestSimpleTreeSchema extends NamedCase {
	/** The view schema for the test case. */
	readonly schema: ImplicitFieldSchema;
	/** Whether the schema permits ambiguous content. */
	readonly ambiguous: boolean;
}

/**
 * A schema paired with an in-schema tree that can be expressed using the user-facing (aka "simple-tree") API surface.
 */
interface TestSimpleTree extends TestSimpleTreeSchema {
	/**
	 * InsertableTreeFieldFromImplicitField<TSchema>
	 */
	root(): InsertableField<UnsafeUnknownSchema>;
}

/**
 * A more flexible generalization of {@link TestSimpleTree}, which operates at a lower abstraction level (matching flex-tree).
 *
 * This can customize field kinds used in the tree and use any expressible, persistable stored schema and tree content,
 * regardless of whether it can currently be produced using the user-facing APIs.
 * This is valuable for testing cases that cannot be easily represented using the user-facing APIs,
 * as well as for directly testing specific aspects of the lower-level implementation (glass-box testing).
 */
interface TestTree extends NamedCase {
	readonly schemaData: TreeStoredSchema;
	readonly policy: FullSchemaPolicy;
	readonly treeFactory: (idCompressor?: IIdCompressor) => JsonableTree[];
}

/**
 * Content for a test document, which can have a different stored schema than just toStoredSchema(schema).
 *
 * This gets its "root" from {@link TestTree.treeFactory}, not {@link TestSimpleTree.root},
 * so it is possible to express documents that have content unknown to the view schema (for now, just unknown optional fields).
 *
 * This additional flexibility over {@link TestSimpleTree} is required for testing forward-compatibility scenarios.
 */
export interface TestDocument extends TestTree, Omit<TestSimpleTree, "root"> {
	/**
	 * True if and only if the document has content in unknown optional fields.
	 */
	readonly hasUnknownOptionalFields?: true;

	/**
	 * True if and only if the documents schema has unknown optional fields in the stored schema.
	 */
	readonly hasUnknownOptionalFieldSchema?: true;

	/**
	 * True if and only if the document content requires staged schema features.
	 *
	 * For this to be the case, the stored schema must also have had staged schema features included.
	 */
	readonly requiresStagedSchema?: true;
}

/**
 * Returns the set of staged schema upgrades found within the provided schema (deeply).
 *
 * @param schema - The field schema to deeply inspect for staged schema upgrades.
 */
export function getStagedSchemaUpgrades(schema: ImplicitFieldSchema): Set<SchemaUpgrade> {
	const stagedSchemaUpgrades = new Set<SchemaUpgrade>();
	function processFieldSchema(field: FieldSchemaAlpha): void {
		if (field.isStagedOptional !== false) {
			stagedSchemaUpgrades.add(field.isStagedOptional);
		}
	}
	visitFieldSchema(schema, processFieldSchema);
	walkFieldSchema(schema, {
		allowedTypes: ({ types }) => {
			for (const type of types) {
				if (type.metadata.stagedSchemaUpgrade) {
					stagedSchemaUpgrades.add(type.metadata.stagedSchemaUpgrade);
				}
			}
		},
	});
	return stagedSchemaUpgrades;
}

export function visitFieldSchema(
	schema: ImplicitFieldSchema,
	callback: (field: FieldSchemaAlpha) => void,
): void {
	const root = normalizeFieldSchema(schema);
	callback(root);

	walkFieldSchema(root, {
		node: (nodeSchema) => {
			if (nodeSchema instanceof ObjectNodeSchema) {
				for (const field of nodeSchema.fields.values()) {
					callback(field);
				}
			}
		},
	});
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

const factory = new SchemaFactoryAlpha("test");
const emptySchema = factory.optional([]);
export class Minimal extends factory.objectAlpha("minimal", {}) {}
export class Minimal2 extends factory.object("minimal2", {}) {}
export class HasMinimalValueField extends factory.object("hasMinimalValueField", {
	field: Minimal,
}) {}
export class HasRenamedField extends factory.object("hasRenamedField", {
	field: factory.required(Minimal, { key: "stored-name" }),
}) {}

/** Exercises persisted descriptions on an object and one of its fields. */
export class HasDescriptions extends factory.object(
	"hasDescriptions",
	{
		field: factory.required(Minimal, { metadata: { description: "the field" } }),
	},
	{ metadata: { description: "root object" } },
) {}

/**
 * A node schema configured with all metadata options.
 *
 * @remarks
 * Used to validate metadata handling in schema-focused tests.
 * Use {@link hasAllMetadataRootSchema} when testing a root field schema.
 */
export class HasAllMetadata extends factory.object(
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

/**
 * A root field schema configured with all metadata options.
 * @remarks
 * Root fields receive special handling in several code paths,
 * so this is used to validate that their metadata is preserved correctly.
 */
export const hasAllMetadataRootSchema = SchemaFactoryAlpha.optional(HasAllMetadata, {
	key: "unused root key",
	metadata: { description: "root field", custom: "root field custom" },
});

/** Exercises ambiguity between two structurally identical object types. */
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
/** A lower-level stored schema used to test all supported field kinds. */
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

export class HasStagedAllowedTypes extends factory.objectAlpha("hasStagedAllowedTypes", {
	x: SchemaFactoryAlpha.types([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
	]),
}) {}

export class HasStagedOptionalField extends factory.objectAlpha("hasStagedOptionalField", {
	x: SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number),
}) {}

class MapWithStaged extends factory.mapAlpha(
	"MapWithStaged",
	SchemaFactoryAlpha.types([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
	]),
) {}

/** Allows unknown optional fields so older views can tolerate fields added by newer views. */
export class AllowsUnknownOptionalFields extends factory.objectAlpha(
	"hasUnknownOptionalFields",
	{},
	{
		allowUnknownOptionalFields: true,
	},
) {}

/** Adds representative fields that can be unknown to {@link AllowsUnknownOptionalFields}. */
export class AllowsUnknownOptionalFieldsV2 extends factory.objectRecursive(
	"hasUnknownOptionalFields",
	{
		recursive: factory.optionalRecursive([() => AllowsUnknownOptionalFieldsV2]),
		minimal: factory.optional(Minimal),
		hasMinimalValueField: factory.optional(HasMinimalValueField),
		leaf: factory.optional(SchemaFactoryAlpha.string),
	},
	{
		allowUnknownOptionalFields: true,
	},
) {}

class ArrayWithStaged extends factory.arrayAlpha(
	"ArrayWithStaged",
	SchemaFactoryAlpha.types([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
	]),
) {}

const stagedAllowedTypesRoot = SchemaFactoryAlpha.types([
	SchemaFactoryAlpha.number,
	SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
]);
const stagedOptionalRoot = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number);
const optionalRoot = SchemaFactoryAlpha.optional(SchemaFactoryAlpha.number);
const stagedOptionalA = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number);
const stagedOptionalB = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.string);

class NestedStagedOptional extends factory.object("NestedStagedOptional", {
	a: stagedOptionalA,
	b: stagedOptionalB,
}) {}

const multiStageCUpgrade = SchemaFactoryAlpha.staged(ArrayWithStaged);

class NestedMultiStage extends factory.object("NestedMultiStage", {
	a: SchemaFactoryAlpha.optional(
		SchemaFactoryAlpha.types([SchemaFactoryAlpha.staged(SchemaFactoryAlpha.number)]),
	),
	b: SchemaFactoryAlpha.required(
		SchemaFactoryAlpha.types([
			SchemaFactoryAlpha.staged({
				type: () => MapWithStaged,
				metadata: {},
			}),
			SchemaFactoryAlpha.null,
		]),
	),
	c: SchemaFactoryAlpha.required(
		SchemaFactoryAlpha.types([multiStageCUpgrade, SchemaFactoryAlpha.null]),
	),
}) {}

const allTheFieldsName: TreeNodeSchemaIdentifier = brand("test.allTheFields");

const library = {
	nodeSchema: new Map([
		...toStoredSchema([Minimal, schemaStatics.number], StagedSchemaUpgradePolicy.restrictive)
			.nodeSchema,
		[allTheFieldsName, allTheFields],
	]),
} satisfies Partial<TreeStoredSchema>;

/**
 * Named simple-tree schemas used by schema-focused test suites.
 *
 * Each schema must have at least one matching entry in {@link testSimpleTrees}.
 */
export const testSchema: readonly TestSimpleTreeSchema[] = [
	{ name: "empty", schema: emptySchema, ambiguous: false },
	{ name: "null", schema: factory.null, ambiguous: false },
	{ name: "minimal", schema: Minimal, ambiguous: false },
	{ name: "number", schema: schemaStatics.number, ambiguous: false },
	{ name: "handle", schema: factory.handle, ambiguous: false },
	{ name: "boolean", schema: factory.boolean, ambiguous: false },
	{ name: "hasMinimalValueField", schema: HasMinimalValueField, ambiguous: false },
	{ name: "hasRenamedField", schema: HasRenamedField, ambiguous: false },
	{ name: "hasAmbiguousField", schema: HasAmbiguousField, ambiguous: true },
	{ name: "hasDescriptions", schema: HasDescriptions, ambiguous: false },
	{ name: "hasAllMetadata", schema: HasAllMetadata, ambiguous: false },
	{ name: "hasAllMetadataRootField", schema: hasAllMetadataRootSchema, ambiguous: false },
	{ name: "hasNumericValueField", schema: HasNumericValueField, ambiguous: false },
	{ name: "hasPolymorphicValueField", schema: HasPolymorphicValueField, ambiguous: false },
	{ name: "hasOptionalField", schema: HasOptionalField, ambiguous: false },
	{ name: "numericMap", schema: NumericMap, ambiguous: false },
	{ name: "numericRecord", schema: NumericRecord, ambiguous: false },
	{ name: "recursiveType", schema: RecursiveType, ambiguous: false },
	{
		name: "allowsUnknownOptionalFields",
		schema: AllowsUnknownOptionalFields,
		ambiguous: false,
	},
	{ name: "hasStagedAllowedTypes", schema: HasStagedAllowedTypes, ambiguous: false },
	{ name: "mapWithStaged", schema: MapWithStaged, ambiguous: false },
	{ name: "stagedAllowedTypesRoot", schema: stagedAllowedTypesRoot, ambiguous: false },
	{ name: "hasStagedOptionalField", schema: HasStagedOptionalField, ambiguous: false },
	{ name: "stagedOptionalRoot", schema: stagedOptionalRoot, ambiguous: false },
	{ name: "nestedStagedOptional", schema: NestedStagedOptional, ambiguous: false },
	{ name: "nestedMultiStage", schema: NestedMultiStage, ambiguous: false },
];

/**
 * Simple-tree-compatible trees.
 *
 * Can be used to exercise APIs which accept insertable content,
 * or which process the trees constructed from that content.
 *
 * Add at least one representative here whenever adding a schema to {@link testSchema}.
 */
export const testSimpleTrees: readonly TestSimpleTree[] = [
	testSimpleTree("empty", emptySchema, undefined),
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
	testSimpleTree("hasAllMetadataRootField", hasAllMetadataRootSchema, { field: {} }),
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
	testSimpleTree("allowsUnknownOptionalFields", AllowsUnknownOptionalFields, {}),
	testSimpleTree("HasStagedAllowedTypesBeforeUpdate", HasStagedAllowedTypes, { x: 5 }, false),
	testSimpleTree("mapWithStaged", MapWithStaged, {}),
	testSimpleTree("Staged in root", stagedAllowedTypesRoot, 5, false),
	testSimpleTree(
		"HasStagedOptionalFieldBeforeUpdate",
		HasStagedOptionalField,
		{ x: 5 },
		false,
	),
	testSimpleTree("Staged optional in root", stagedOptionalRoot, 5, false),
	testSimpleTree(
		"NestedStagedOptional with no upgrades",
		NestedStagedOptional,
		{ a: 5, b: "text" },
		false,
	),
	testSimpleTree(
		"NestedMultiStage with no upgrades",
		NestedMultiStage,
		{ b: null, c: null },
		false,
	),
];

/**
 * Stored-schema trees used by lower-level tree tests.
 * Prefer adding cases to {@link testSimpleTrees}; add custom cases here only when simple-tree cannot express them.
 */
export const testTrees: readonly TestTree[] = [
	...testSimpleTrees.map(convertSimpleTreeTest),
	test(
		"numericSequence",
		{
			...toStoredSchema(factory.number, StagedSchemaUpgradePolicy.restrictive),
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
		schemaData: toStoredSchema(HasIdentifierField, StagedSchemaUpgradePolicy.restrictive),
		treeFactory: (idCompressor?: IIdCompressor): JsonableTree[] => {
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
		schemaData: toStoredSchema(factory.identifier, StagedSchemaUpgradePolicy.restrictive),
		treeFactory: (idCompressor?: IIdCompressor): JsonableTree[] => {
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

export class HasStagedAllowedTypesAfterUpdate extends factory.objectAlpha(
	"hasStagedAllowedTypes",
	{
		x: [SchemaFactoryAlpha.number, SchemaFactoryAlpha.string],
	},
) {}

export class HasStagedOptionalFieldAfterUpdate extends factory.objectAlpha(
	"hasStagedOptionalField",
	{
		x: SchemaFactoryAlpha.optional(SchemaFactoryAlpha.number),
	},
) {}

// TODO: AB#45711: add recursive staged schema tests documents

/**
 * Collection of {@link TestDocument|TestDocuments}.
 * @remarks
 * Use these test documents to test import and export APIs.
 *
 * Can be used to test schema evolution related features where view and stored schema can diverge.
 * Includes for example documents with unknown optional fields;
 *
 * Includes documents with staged schema features both before and after the stored schema update.
 *
 * @privateRemarks
 * When possible, add test cases to {@link testSimpleTrees} instead of this collection:
 * such cases are automatically included here as well.
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
		schema: AllowsUnknownOptionalFields,
		hasUnknownOptionalFieldSchema: true,
		// Unknown optional fields are allowed but empty in this document.
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(AllowsUnknownOptionalFieldsV2),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(AllowsUnknownOptionalFields, {})),
	},
	{
		ambiguous: false,
		name: "HasUnknownOptionalFields",
		schema: AllowsUnknownOptionalFields,
		hasUnknownOptionalFields: true,
		hasUnknownOptionalFieldSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(AllowsUnknownOptionalFieldsV2),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(
					AllowsUnknownOptionalFieldsV2,
					new AllowsUnknownOptionalFieldsV2({
						recursive: new AllowsUnknownOptionalFieldsV2({ leaf: "nested leaf" }),
						minimal: {},
						hasMinimalValueField: { field: {} },
						leaf: "leaf",
					}),
				),
			),
	},
	{
		ambiguous: false,
		name: "HasStagedAllowedTypesAfterUpdate",
		schema: HasStagedAllowedTypes,
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
		name: "Staged node in root",
		schema: stagedAllowedTypesRoot,
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
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(MapWithStaged, StagedSchemaUpgradePolicy.permissive),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(MapWithStaged, [["key", "text"]])),
	},
	{
		ambiguous: false,
		name: "HasStagedOptionalFieldAfterUpdate",
		schema: HasStagedOptionalField,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(HasStagedOptionalFieldAfterUpdate),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(HasStagedOptionalField, {})),
	},
	{
		ambiguous: false,
		name: "Staged optional empty root",
		schema: stagedOptionalRoot,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toInitialSchema(optionalRoot),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(stagedOptionalRoot, undefined)),
	},
	{
		ambiguous: false,
		name: "NestedStagedOptional with one upgrade",
		schema: NestedStagedOptional,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedStagedOptional, {
			includeStaged: () => false,
			includeStagedOptional: (upgrade) => upgrade === stagedOptionalA.isStagedOptional,
		}),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(NestedStagedOptional, { b: "text" }),
			),
	},
	{
		ambiguous: false,
		name: "NestedStagedOptional with all upgrades",
		schema: NestedStagedOptional,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedStagedOptional, StagedSchemaUpgradePolicy.permissive),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(fieldCursorFromInsertable(NestedStagedOptional, {})),
	},
	{
		ambiguous: false,
		name: "NestedMultiStage with one upgrade",
		schema: NestedMultiStage,
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedMultiStage, {
			includeStaged: (upgrade) => upgrade === multiStageCUpgrade.metadata.stagedSchemaUpgrade,
			includeStagedOptional: () => false,
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
		requiresStagedSchema: true,
		policy: defaultSchemaPolicy,
		schemaData: toStoredSchema(NestedMultiStage, StagedSchemaUpgradePolicy.permissive),
		treeFactory: () =>
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable(NestedMultiStage, { a: 5, b: [], c: ["text"] }),
			),
	},
];

/** Creates an independent view initialized with a {@link TestDocument}'s stored schema and content. */
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
				jsonValidator: FormatValidatorBasic,
			},
			new TreeStoredSchemaRepository(document.schemaData),
			cursor,
			idCompressor,
		);
	return view as TreeView<ImplicitFieldSchema> as SchematizingSimpleTreeView<UnsafeUnknownSchema>;
}

/**
 * {@link independentInitializedView} but using internal types instead of persisted data formats.
 */
function independentInitializedViewInternal<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
	options: ForestOptions & ICodecOptions,
	schema: TreeStoredSchema,
	rootFieldCursor: ITreeCursorSynchronous,
	idCompressor: IIdCompressor,
): SchematizingSimpleTreeView<TSchema> {
	const breaker = new Breakable("independentInitializedView");
	const revisionTagCodec = new RevisionTagCodec(idCompressor);
	const mintRevisionTag = (): RevisionTag => idCompressor.generateCompressedId();

	// To ensure the forest is in schema when constructed, start it with an empty schema and set the schema repository content later.
	const schemaRepository = new TreeStoredSchemaRepository();

	const forest = buildConfiguredForest(
		breaker,
		options.forest ?? defaultSharedTreeOptions.forest,
		schemaRepository,
		idCompressor,
		defaultIncrementalEncodingPolicy,
	);

	const checkout = createTreeCheckout(idCompressor, mintRevisionTag, revisionTagCodec, {
		forest,
		schema: schemaRepository,
	});

	initialize(
		checkout,
		schema,
		initializerFromChunk(checkout, () =>
			combineChunks(checkout.forest.chunkField(rootFieldCursor)),
		),
	);
	return new SchematizingSimpleTreeView<TSchema>(
		checkout,
		config,
		createNodeIdentifierManager(idCompressor),
	);
}

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches
// TODO: randomized schema generator
