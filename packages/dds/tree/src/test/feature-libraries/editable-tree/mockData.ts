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
	TypedSchema,
	SchemaAware,
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
	FieldViewSchema,
} from "../../../feature-libraries";
import {
	ValueSchema,
	GlobalFieldKey,
	LocalFieldKey,
	EmptyKey,
	rootFieldKey,
	JsonableTree,
	symbolFromKey,
	GlobalFieldKeySymbol,
	SchemaData,
	IEditableForest,
	SchemaDataAndPolicy,
	InMemoryStoredSchemaRepository,
	lookupGlobalFieldSchema,
	initializeForest,
} from "../../../core";
import { brand, Brand } from "../../../util";

export const stringSchema = TypedSchema.tree("String", {
	value: ValueSchema.String,
});

export const int32Schema = TypedSchema.tree("Int32", {
	value: ValueSchema.Number,
});

export const float64Schema = TypedSchema.tree("Float64", {
	value: ValueSchema.Number,
});

export const boolSchema = TypedSchema.tree("Bool", {
	value: ValueSchema.Boolean,
});

export const simplePhonesSchema = TypedSchema.tree("Test:SimplePhones-1.0.0", {
	local: {
		[EmptyKey]: TypedSchema.field(FieldKinds.sequence, stringSchema),
	},
});

export const complexPhoneSchema = TypedSchema.tree("Test:Phone-1.0.0", {
	local: {
		number: TypedSchema.field(FieldKinds.value, stringSchema),
		prefix: TypedSchema.field(FieldKinds.value, stringSchema),
		extraPhones: TypedSchema.field(FieldKinds.optional, simplePhonesSchema),
	},
});

export const phonesSchema = TypedSchema.tree("Test:Phones-1.0.0", {
	local: {
		[EmptyKey]: TypedSchema.field(
			FieldKinds.sequence,
			stringSchema,
			int32Schema,
			complexPhoneSchema,
			// array of arrays
			simplePhonesSchema,
		),
	},
});

export const globalFieldKeySequencePhones: GlobalFieldKey = brand("sequencePhones");
export const globalFieldSymbolSequencePhones: GlobalFieldKeySymbol = symbolFromKey(
	globalFieldKeySequencePhones,
);
export const globalFieldSchemaSequencePhones = TypedSchema.field(FieldKinds.sequence, stringSchema);

export const addressSchema = TypedSchema.tree("Test:Address-1.0.0", {
	local: {
		zip: TypedSchema.field(FieldKinds.value, stringSchema, int32Schema),
		street: TypedSchema.field(FieldKinds.optional, stringSchema),
		city: TypedSchema.field(FieldKinds.optional, stringSchema),
		country: TypedSchema.field(FieldKinds.optional, stringSchema),
		phones: TypedSchema.field(FieldKinds.optional, phonesSchema),
		sequencePhones: TypedSchema.field(FieldKinds.sequence, stringSchema),
	},
	globalFields: [globalFieldKeySequencePhones],
});

export const mapStringSchema = TypedSchema.tree("Map<String>", {
	extraLocalFields: TypedSchema.field(FieldKinds.optional, stringSchema),
	value: ValueSchema.Serializable,
});

export const personSchema = TypedSchema.tree("Test:Person-1.0.0", {
	local: {
		name: TypedSchema.field(FieldKinds.value, stringSchema),
		age: TypedSchema.field(FieldKinds.optional, int32Schema),
		adult: TypedSchema.field(FieldKinds.optional, boolSchema),
		salary: TypedSchema.field(FieldKinds.optional, float64Schema, int32Schema, stringSchema),
		friends: TypedSchema.field(FieldKinds.optional, mapStringSchema),
		address: TypedSchema.field(FieldKinds.optional, addressSchema),
	},
});

export const optionalChildSchema = TypedSchema.tree("Test:OptionalChild-1.0.0", {
	local: {
		child: TypedSchema.fieldUnrestricted(FieldKinds.optional),
	},
	value: ValueSchema.Serializable,
});

export const arraySchema = TypedSchema.tree("Test:Array-1.0.0", {
	local: {
		[EmptyKey]: TypedSchema.field(FieldKinds.sequence, stringSchema, int32Schema),
	},
});

export const rootPersonSchema = TypedSchema.field(FieldKinds.optional, personSchema);

export const treeSchema = [
	arraySchema,
	optionalChildSchema,
	stringSchema,
	float64Schema,
	int32Schema,
	boolSchema,
	complexPhoneSchema,
	phonesSchema,
	simplePhonesSchema,
	addressSchema,
	mapStringSchema,
	personSchema,
] as const;

export const fullSchemaData = SchemaAware.typedSchemaData(
	[
		[rootFieldKey, rootPersonSchema],
		[globalFieldKeySequencePhones, globalFieldSchemaSequencePhones],
	],
	...treeSchema,
);

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
		[globalFieldKeySequencePhones]: ["115", "116"],
	},
};

export function personJsonableTree(): JsonableTree {
	return jsonableTreeFromCursor(
		cursorFromContextualData(fullSchemaData, TypedSchema.nameSet(personSchema), personData),
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
export function buildTestSchema(rootField: FieldViewSchema = rootPersonSchema): SchemaData {
	return SchemaAware.typedSchemaData(
		[
			...(fullSchemaData.globalFieldSchema.entries() as Iterable<
				[GlobalFieldKey, FieldViewSchema]
			>),
			[rootFieldKey, rootField],
		],
		...treeSchema,
	);
}

export function getReadonlyEditableTreeContext(forest: IEditableForest): EditableTreeContext {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getEditableTreeContext(forest, dummyEditor);
}

export function setupForest(
	schema: SchemaData,
	data: ContextuallyTypedNodeData | undefined,
): IEditableForest {
	const schemaRepo = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
	const forest = buildForest(schemaRepo);
	const root = cursorsFromContextualData(
		schemaRepo,
		lookupGlobalFieldSchema(schemaRepo, rootFieldKey),
		data,
	);
	initializeForest(forest, root);
	return forest;
}

export function buildTestTree(
	data: ContextuallyTypedNodeData | undefined,
	rootField: FieldViewSchema = rootPersonSchema,
): EditableTreeContext {
	const schema: SchemaData = buildTestSchema(rootField);
	const forest = setupForest(schema, data);
	const context = getReadonlyEditableTreeContext(forest);
	return context;
}

export function buildTestPerson(): readonly [SchemaDataAndPolicy, Person] {
	const context = buildTestTree(personData);
	return [context.schema, context.unwrappedRoot as Person];
}
