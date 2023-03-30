/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	brand,
	TreeSchemaIdentifier,
	FieldSchema,
	Brand,
	EditableField,
	EditableTree,
	LocalFieldKey,
	valueSymbol,
	typeNameSymbol,
	fieldSchema,
	FieldKindSpecifier,
} from "@fluid-internal/tree";

export const personPropertyDDSSchemas = {
	geodesicLocation: {
		typeid: "Test:GeodesicLocation-1.0.0",
		properties: [
			{ id: "lat", typeid: "Float64" },
			{ id: "lon", typeid: "Float64" },
		],
	},
	cartesianLocation: {
		typeid: "Test:CartesianLocation-1.0.0",
		properties: [{ id: "coords", typeid: "Float64", context: "array" }],
	},
	phone: {
		typeid: "Test:Phone-1.0.0",
		inherits: ["Test:FlexPhone-1.0.0"],
		properties: [
			{ id: "number", typeid: "String" },
			{ id: "prefix", typeid: "String", optional: true },
			{
				id: "extraPhones",
				typeid: "String",
				optional: true,
				context: "array",
			},
		],
	},
	flexPhone: {
		typeid: "Test:FlexPhone-1.0.0",
		inherits: ["NodeProperty"],
	},
	address: {
		typeid: "Test:Address-1.0.0",
		inherits: ["NodeProperty", "Test:GeodesicLocation-1.0.0", "Test:CartesianLocation-1.0.0"],
		properties: [
			{ id: "zip", typeid: "String" },
			{ id: "street", typeid: "String", optional: true },
			{ id: "city", typeid: "String", optional: true },
			{ id: "country", typeid: "String", optional: true },
			{ id: "phones", typeid: "Test:FlexPhone-1.0.0", optional: true, context: "array" },
		],
	},
	person: {
		typeid: "Test:Person-1.0.0",
		inherits: ["NodeProperty"],
		properties: [
			{ id: "name", typeid: "String" },
			{ id: "age", typeid: "Int32", optional: true },
			{ id: "adult", typeid: "Bool", optional: true },
			{ id: "salary", typeid: "Float64", optional: true },
			{ id: "address", typeid: "Test:Address-1.0.0", optional: true },
			{ id: "friends", typeid: "String", context: "map", optional: true },
		],
	},
};

export const booleanSchemaName: TreeSchemaIdentifier = brand("Bool");
export const int32SchemaName: TreeSchemaIdentifier = brand("Int32");
export const stringSchemaName: TreeSchemaIdentifier = brand("String");
export const float64SchemaName: TreeSchemaIdentifier = brand("Float64");
export const addressSchemaName: TreeSchemaIdentifier = brand("Test:Address-1.0.0");
export const mapStringSchemaName: TreeSchemaIdentifier = brand("map<string>");
export const personSchemaName: TreeSchemaIdentifier = brand("Test:Person-1.0.0");
export const complexPhoneSchemaName: TreeSchemaIdentifier = brand("Test:Phone-1.0.0");

export function getRootFieldSchema(
	fieldKind: FieldKindSpecifier,
	...fieldTypes: readonly TreeSchemaIdentifier[]
): FieldSchema {
	return fieldSchema(fieldKind, new Set(fieldTypes));
}

export type Float64 = Brand<number, "editable-tree-inspector-demo.Float64"> & EditableTree;
export type Int32 = Brand<number, "editable-tree-inspector-demo.Int32"> & EditableTree;
export type Bool = Brand<boolean, "editable-tree-inspector-demo.Bool"> & EditableTree;

export type ComplexPhone = EditableTree &
	Brand<
		{
			number: string;
			prefix?: string;
			extraPhones?: SimplePhones;
		},
		"editable-tree-inspector-demo.Test:Phone-1.0.0"
	>;

export type SimplePhones = EditableField &
	Brand<string[], "editable-tree-inspector-demo.Test:SimplePhones-1.0.0">;

export type Phones = EditableField &
	Brand<ComplexPhone[], "editable-tree-inspector-demo.Test:Phones-1.0.0">;

export type Address = EditableTree &
	Brand<
		{
			zip: string;
			street?: string;
			city?: string;
			country?: string;
			phones?: Phones;
		},
		"editable-tree-inspector-demo.Test:Address-1.0.0"
	>;

export type Friends = EditableTree &
	Brand<Record<LocalFieldKey, string>, "editable-tree-inspector-demo.Map<string>">;

export type Person = EditableTree &
	Brand<
		{
			name: string;
			age?: Int32;
			adult?: Bool;
			salary?: Float64;
			friends?: Friends;
			address?: Address;
		},
		"editable-tree-inspector-demo.Test:Person-1.0.0"
	>;

export function getPerson(): Person {
	const age: Int32 = brand(35);
	return {
		// typed with built-in primitive type
		name: "Adam",
		// explicitly contextually typed
		age,
		// inline contextually typed
		adult: brand<Bool>(true),
		// explicitly typed
		salary: {
			[valueSymbol]: 10420.2,
			[typeNameSymbol]: float64SchemaName,
		},
		friends: {
			Mat: "Mat",
		},
		address: {
			zip: "99999",
			street: "treeStreet",
			phones: [
				{
					[typeNameSymbol]: complexPhoneSchemaName,
					prefix: "0123",
					number: "012345",
					extraPhones: ["91919191"],
				},
			],
		},
	} as unknown as Person; // TODO: fix up these strong types to reflect unwrapping
}
