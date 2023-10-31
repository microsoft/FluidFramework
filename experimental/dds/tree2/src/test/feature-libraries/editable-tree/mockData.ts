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
	getEditableTreeContext,
	TreeFieldSchema,
	Any,
	TreeSchema,
	NormalizeField,
	ImplicitFieldSchema,
	SchemaAware,
} from "../../../feature-libraries";
import {
	FieldKey,
	EmptyKey,
	JsonableTree,
	IEditableForest,
	InMemoryStoredSchemaRepository,
	initializeForest,
	TreeStoredSchema,
} from "../../../core";
import { brand, Brand } from "../../../util";
import { SchemaBuilder, leaf } from "../../../domains";

const builder = new SchemaBuilder({ scope: "mock data" });

export const stringSchema = leaf.string;

export const float64Schema = leaf.number;

export const boolSchema = leaf.boolean;

export const simplePhonesSchema = builder.object("Test:SimplePhones-1.0.0", {
	[EmptyKey]: TreeFieldSchema.create(FieldKinds.sequence, [stringSchema]),
});

export const complexPhoneSchema = builder.object("Test:Phone-1.0.0", {
	number: stringSchema,
	prefix: stringSchema,
	extraPhones: TreeFieldSchema.create(FieldKinds.optional, [simplePhonesSchema]),
});

export const phonesSchema = builder.fieldNode(
	"Test:Phones-1.0.0",
	builder.sequence([
		stringSchema,
		leaf.number,
		complexPhoneSchema,
		// array of arrays
		simplePhonesSchema,
	]),
);

export const addressSchema = builder.object("Test:Address-1.0.0", {
	zip: [stringSchema, leaf.number],
	street: TreeFieldSchema.create(FieldKinds.optional, [stringSchema]),
	city: TreeFieldSchema.create(FieldKinds.optional, [stringSchema]),
	country: TreeFieldSchema.create(FieldKinds.optional, [stringSchema]),
	phones: TreeFieldSchema.create(FieldKinds.optional, [phonesSchema]),
	sequencePhones: TreeFieldSchema.create(FieldKinds.sequence, [stringSchema]),
});

export const mapStringSchema = builder.map(
	"Map<String>",
	TreeFieldSchema.create(FieldKinds.optional, [stringSchema]),
);

export const personSchema = builder.object("Test:Person-1.0.0", {
	name: stringSchema,
	age: TreeFieldSchema.create(FieldKinds.optional, [leaf.number]),
	adult: TreeFieldSchema.create(FieldKinds.optional, [boolSchema]),
	salary: TreeFieldSchema.create(FieldKinds.optional, [float64Schema, leaf.number, stringSchema]),
	friends: TreeFieldSchema.create(FieldKinds.optional, [mapStringSchema]),
	address: TreeFieldSchema.create(FieldKinds.optional, [addressSchema]),
});

export const optionalChildSchema = builder.object("Test:OptionalChild-1.0.0", {
	child: SchemaBuilder.optional(Any),
});

export const arraySchema = builder.fieldNode(
	"Test:Array-1.0.0",
	TreeFieldSchema.create(FieldKinds.sequence, [stringSchema, leaf.number]),
);

export const rootPersonSchema = TreeFieldSchema.create(FieldKinds.optional, [personSchema]);

export const personSchemaLibrary = builder.intoLibrary();

export const fullSchemaData = buildTestSchema(rootPersonSchema);

// TODO: derive types like these from those schema, which subset EditableTree

// TODO: provide relaxed types like these based on ContextuallyTyped setters

// TODO: these types don't make sense. Values can't be both primitives and EditableTree, and this isn't how Brand or TreeSchemaIdentifiers are used.
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

export const personData: SchemaAware.TypedField<
	typeof rootPersonSchema,
	SchemaAware.ApiMode.Flexible
> &
	ContextuallyTypedNodeData = {
	name: "Adam",
	age: 35,
	adult: true,
	salary: { [valueSymbol]: 10420.2, [typeNameSymbol]: float64Schema.name },
	friends: {
		Mat: "Mat",
	} as any, // TODO: map node builder type safety
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
		] as any, // TODO: field node builder type safety
		sequencePhones: ["113", "114"],
		city: undefined,
		country: undefined,
	},
} satisfies ContextuallyTypedNodeDataObject;

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
export function buildTestSchema<TSchema extends ImplicitFieldSchema>(
	rootField: TSchema,
): TreeSchema<NormalizeField<TSchema, typeof FieldKinds.required>> {
	return new SchemaBuilder({
		scope: "buildTestSchema",
		libraries: [personSchemaLibrary],
	}).intoSchema(rootField);
}

export function getReadonlyEditableTreeContext(
	forest: IEditableForest,
	schema: TreeStoredSchema,
): EditableTreeContext {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getEditableTreeContext(forest, schema, dummyEditor);
}

export function setupForest<T extends TreeFieldSchema>(
	schema: TreeSchema<T>,
	data: ContextuallyTypedNodeData | undefined,
): IEditableForest {
	const schemaRepo = new InMemoryStoredSchemaRepository(schema);
	const forest = buildForest();
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
	rootField: TreeFieldSchema = rootPersonSchema,
): EditableTreeContext {
	const schema = buildTestSchema(rootField);
	const forest = setupForest(schema, data);
	const context = getReadonlyEditableTreeContext(forest, schema);
	return context;
}

export function buildTestPerson(): readonly [TreeStoredSchema, Person] {
	const context = buildTestTree(personData);
	return [context.schema, context.unwrappedRoot as Person];
}
