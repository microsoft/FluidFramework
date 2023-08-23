/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKinds,
	EditableTree,
	EditableField,
	typeNameSymbol,
	valueSymbol,
	ContextuallyTypedNodeDataObject,
	jsonableTreeFromCursor,
	cursorFromContextualData,
	EditableTreeContext,
	DefaultEditBuilder,
	ContextuallyTypedNodeData,
	buildForest,
	cursorsFromContextualData,
	defaultSchemaPolicy,
	getEditableTreeContext,
	FieldSchema,
	SchemaBuilder,
	Any,
	TypedSchemaCollection,
	createMockNodeKeyManager,
} from "../../../feature-libraries";
import {
	ValueSchema,
	FieldKey,
	EmptyKey,
	JsonableTree,
	IEditableForest,
	InMemoryStoredSchemaRepository,
	initializeForest,
	SchemaData,
} from "../../../core";
import { brand, Brand } from "../../../util";

const builder = new SchemaBuilder("mock data");

export const stringSchema = builder.leaf("String", ValueSchema.String);

export const int32Schema = builder.leaf("Int32", ValueSchema.Number);

export const float64Schema = builder.leaf("Float64", ValueSchema.Number);

export const boolSchema = builder.leaf("Bool", ValueSchema.Boolean);

export const simplePhonesSchema = builder.struct("Test:SimplePhones-1.0.0", {
	[EmptyKey]: SchemaBuilder.field(FieldKinds.sequence, stringSchema),
});

export const complexPhoneSchema = builder.struct("Test:Phone-1.0.0", {
	number: SchemaBuilder.field(FieldKinds.value, stringSchema),
	prefix: SchemaBuilder.field(FieldKinds.value, stringSchema),
	extraPhones: SchemaBuilder.field(FieldKinds.optional, simplePhonesSchema),
});

export const phonesSchema = builder.fieldNode(
	"Test:Phones-1.0.0",
	SchemaBuilder.fieldSequence(
		stringSchema,
		int32Schema,
		complexPhoneSchema,
		// array of arrays
		simplePhonesSchema,
	),
);

export const addressSchema = builder.struct("Test:Address-1.0.0", {
	zip: SchemaBuilder.field(FieldKinds.value, stringSchema, int32Schema),
	street: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	city: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	country: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	phones: SchemaBuilder.field(FieldKinds.optional, phonesSchema),
	sequencePhones: SchemaBuilder.field(FieldKinds.sequence, stringSchema),
});

export const mapStringSchema = builder.map(
	"Map<String>",
	SchemaBuilder.field(FieldKinds.optional, stringSchema),
);

export const personSchema = builder.struct("Test:Person-1.0.0", {
	name: SchemaBuilder.field(FieldKinds.value, stringSchema),
	age: SchemaBuilder.field(FieldKinds.optional, int32Schema),
	adult: SchemaBuilder.field(FieldKinds.optional, boolSchema),
	salary: SchemaBuilder.field(FieldKinds.optional, float64Schema, int32Schema, stringSchema),
	friends: SchemaBuilder.field(FieldKinds.optional, mapStringSchema),
	address: SchemaBuilder.field(FieldKinds.optional, addressSchema),
});

export const optionalChildSchema = builder.struct("Test:OptionalChild-1.0.0", {
	child: SchemaBuilder.fieldOptional(Any),
});

export const arraySchema = builder.fieldNode(
	"Test:Array-1.0.0",
	SchemaBuilder.field(FieldKinds.sequence, stringSchema, int32Schema),
);

export const rootPersonSchema = SchemaBuilder.field(FieldKinds.optional, personSchema);

export const personSchemaLibrary = builder.intoLibrary();

export const fullSchemaData = buildTestSchema(rootPersonSchema);

// TODO: derive types like these from those schema, which subset EditableTree

// TODO: provide relaxed types like these based on ContextuallyTyped setters

export type Float64 = Brand<number, "editable-tree.Float64"> & EditableTree;
export type Int32 = Brand<number, "editable-tree.Int32"> & EditableTree;
export type Bool = Brand<boolean, "editable-tree.Bool"> & EditableTree;

export type ComplexPhone = EditableTree &
	Brand<
		{
			number: string;
			prefix: string;
			extraPhones?: SimplePhones;
		},
		"editable-tree.Test:Phone-1.0.0"
	>;

export type SimplePhones = EditableField & Brand<string[], "editable-tree.Test:SimplePhones-1.0.0">;

export type Phones = EditableField &
	Brand<(Int32 | string | ComplexPhone | SimplePhones)[], "editable-tree.Test:Phones-1.0.0">;

export type Address = EditableTree &
	Brand<
		{
			zip: string | Int32;
			street?: string;
			city?: string;
			country?: string;
			phones?: Phones;
			sequencePhones?: SimplePhones;
		},
		"editable-tree.Test:Address-1.0.0"
	>;
export type Friends = EditableTree & Brand<Record<FieldKey, string>, "editable-tree.Map<String>">;

export type Person = EditableTree &
	Brand<
		{
			name: string;
			age?: Int32;
			adult?: Bool;
			salary?: Float64 | Int32;
			friends?: Friends;
			address?: Address;
		},
		"editable-tree.Test:Person-1.0.0"
	>;

export const personData: ContextuallyTypedNodeDataObject = {
	name: "Adam",
	age: 35,
	adult: true,
	salary: { [valueSymbol]: 10420.2, [typeNameSymbol]: float64Schema.name },
	friends: {
		Mat: "Mat",
	},
	address: {
		zip: "99999",
		street: "treeStreet",
		phones: [
			"+49123456778",
			123456879,
			{
				[typeNameSymbol]: complexPhoneSchema.name,
				number: "012345",
				prefix: "0123",
				extraPhones: ["91919191"],
			},
			{
				[typeNameSymbol]: simplePhonesSchema.name,
				[EmptyKey]: ["112", "113"],
			},
		],
		sequencePhones: ["113", "114"],
	},
};

export function personJsonableTree(): JsonableTree {
	return jsonableTreeFromCursor(
		cursorFromContextualData(
			{
				schema: fullSchemaData,
			},
			rootPersonSchema.types,
			personData,
		),
	);
}

export function getPerson(): Person {
	const age: Int32 = brand(35);
	return {
		// typed with built-in primitive type
		name: "Adam",
		// explicitly typed
		age,
		// inline typed
		adult: brand<Bool>(true),
		// Float64 | Int32
		salary: {
			[valueSymbol]: 10420.2,
			[typeNameSymbol]: float64Schema.name,
		},
		friends: {
			Mat: "Mat",
		},
		address: {
			// string | Int32
			zip: "99999",
			street: "treeStreet",
			// (Int32 | string | ComplexPhone | SimplePhones)[]
			phones: [
				"+49123456778",
				123456879,
				{
					[typeNameSymbol]: complexPhoneSchema.name,
					prefix: "0123",
					number: "012345",
					extraPhones: ["91919191"],
				},
				["112", "113"],
			],
			sequencePhones: ["113", "114"],
		},
	} as unknown as Person; // TODO: fix up these strong types to reflect unwrapping
}

/**
 * Create schema supporting all type defined in this file, with the specified root field.
 */
export function buildTestSchema<T extends FieldSchema>(rootField: T) {
	return new SchemaBuilder("buildTestSchema", {}, personSchemaLibrary).intoDocumentSchema(
		rootField,
	);
}

export function getReadonlyEditableTreeContext(forest: IEditableForest): EditableTreeContext {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getEditableTreeContext(forest, dummyEditor, createMockNodeKeyManager());
}

export function setupForest<T extends FieldSchema>(
	schema: TypedSchemaCollection<T>,
	data: ContextuallyTypedNodeData | undefined,
): IEditableForest {
	const schemaRepo = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
	const forest = buildForest(schemaRepo);
	const root = cursorsFromContextualData(
		{
			schema: schemaRepo,
		},
		schema.rootFieldSchema,
		data,
	);
	initializeForest(forest, root);
	return forest;
}

export function buildTestTree(
	data: ContextuallyTypedNodeData | undefined,
	rootField: FieldSchema = rootPersonSchema,
): EditableTreeContext {
	const schema = buildTestSchema(rootField);
	const forest = setupForest(schema, data);
	const context = getReadonlyEditableTreeContext(forest);
	return context;
}

export function buildTestPerson(): readonly [SchemaData, Person] {
	const context = buildTestTree(personData);
	return [context.schema, context.unwrappedRoot as Person];
}
