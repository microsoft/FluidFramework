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
	GlobalFieldSchema,
	TypedSchemaCollection,
} from "../../../feature-libraries";
import {
	ValueSchema,
	LocalFieldKey,
	EmptyKey,
	JsonableTree,
	GlobalFieldKeySymbol,
	IEditableForest,
	SchemaDataAndPolicy,
	InMemoryStoredSchemaRepository,
	initializeForest,
} from "../../../core";
import { brand, Brand } from "../../../util";

const builder = new SchemaBuilder("mock data");

export const stringSchema = builder.object("String", {
	value: ValueSchema.String,
});

export const int32Schema = builder.object("Int32", {
	value: ValueSchema.Number,
});

export const float64Schema = builder.object("Float64", {
	value: ValueSchema.Number,
});

export const boolSchema = builder.object("Bool", {
	value: ValueSchema.Boolean,
});

export const simplePhonesSchema = builder.object("Test:SimplePhones-1.0.0", {
	local: {
		[EmptyKey]: SchemaBuilder.field(FieldKinds.sequence, stringSchema),
	},
});

export const complexPhoneSchema = builder.object("Test:Phone-1.0.0", {
	local: {
		number: SchemaBuilder.field(FieldKinds.value, stringSchema),
		prefix: SchemaBuilder.field(FieldKinds.value, stringSchema),
		extraPhones: SchemaBuilder.field(FieldKinds.optional, simplePhonesSchema),
	},
});

export const phonesSchema = builder.object("Test:Phones-1.0.0", {
	local: {
		[EmptyKey]: SchemaBuilder.fieldSequence(
			stringSchema,
			int32Schema,
			complexPhoneSchema,
			// array of arrays
			simplePhonesSchema,
		),
	},
});

export const globalFieldSchemaSequencePhones = builder.globalField(
	"sequencePhones",
	SchemaBuilder.fieldSequence(stringSchema),
);

export const globalFieldSymbolSequencePhones: GlobalFieldKeySymbol =
	globalFieldSchemaSequencePhones.symbol;

export const addressSchema = builder.object("Test:Address-1.0.0", {
	local: {
		zip: SchemaBuilder.field(FieldKinds.value, stringSchema, int32Schema),
		street: SchemaBuilder.field(FieldKinds.optional, stringSchema),
		city: SchemaBuilder.field(FieldKinds.optional, stringSchema),
		country: SchemaBuilder.field(FieldKinds.optional, stringSchema),
		phones: SchemaBuilder.field(FieldKinds.optional, phonesSchema),
		sequencePhones: SchemaBuilder.field(FieldKinds.sequence, stringSchema),
	},
	globalFields: [globalFieldSchemaSequencePhones],
});

export const mapStringSchema = builder.object("Map<String>", {
	extraLocalFields: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	value: ValueSchema.Serializable,
});

export const personSchema = builder.object("Test:Person-1.0.0", {
	local: {
		name: SchemaBuilder.field(FieldKinds.value, stringSchema),
		age: SchemaBuilder.field(FieldKinds.optional, int32Schema),
		adult: SchemaBuilder.field(FieldKinds.optional, boolSchema),
		salary: SchemaBuilder.field(FieldKinds.optional, float64Schema, int32Schema, stringSchema),
		friends: SchemaBuilder.field(FieldKinds.optional, mapStringSchema),
		address: SchemaBuilder.field(FieldKinds.optional, addressSchema),
	},
});

export const optionalChildSchema = builder.object("Test:OptionalChild-1.0.0", {
	local: {
		child: SchemaBuilder.fieldOptional(Any),
	},
	value: ValueSchema.Serializable,
});

export const arraySchema = builder.object("Test:Array-1.0.0", {
	local: {
		[EmptyKey]: SchemaBuilder.field(FieldKinds.sequence, stringSchema, int32Schema),
	},
});

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
export type Friends = EditableTree &
	Brand<Record<LocalFieldKey, string>, "editable-tree.Map<String>">;

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
		[globalFieldSymbolSequencePhones]: ["115", "116"],
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
			[globalFieldSymbolSequencePhones]: ["115", "116"],
		},
	} as unknown as Person; // TODO: fix up these strong types to reflect unwrapping
}

/**
 * Create schema supporting all type defined in this file, with the specified root field.
 */
export function buildTestSchema<T extends FieldSchema>(rootField: T) {
	return new SchemaBuilder("buildTestSchema", personSchemaLibrary).intoDocumentSchema(rootField);
}

export function getReadonlyEditableTreeContext(forest: IEditableForest): EditableTreeContext {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getEditableTreeContext(forest, dummyEditor);
}

export function setupForest<T extends GlobalFieldSchema>(
	schema: TypedSchemaCollection<T>,
	data: ContextuallyTypedNodeData | undefined,
): IEditableForest {
	const schemaRepo = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
	const forest = buildForest(schemaRepo);
	const root = cursorsFromContextualData(
		{
			schema: schemaRepo,
		},
		schema.root.schema,
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

export function buildTestPerson(): readonly [SchemaDataAndPolicy, Person] {
	const context = buildTestTree(personData);
	return [context.schema, context.unwrappedRoot as Person];
}
