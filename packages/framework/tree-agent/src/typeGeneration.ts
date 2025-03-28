/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	FieldKind,
	getSimpleSchema,
	NodeKind,
	Tree,
	ValueSchema,
} from "@fluidframework/tree/internal";
import type {
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
	TreeNode,
} from "@fluidframework/tree/internal";
import { z } from "zod";

import { objectIdKey, objectIdType, typeField } from "./agentEditTypes.js";
import { getFriendlySchemaName } from "./promptGeneration.js";
import {
	fail,
	getOrCreate,
	hasAtLeastTwo,
	llmDefault,
	mapIterable,
	tryGetSingleton,
	type MapGetSet,
} from "./utils.js";

const objectId = z.string().describe(`A unique identifier for this object in the tree.`);

const objectPointer = z
	.string()
	.describe(
		"Points to an object in the tree via its ID. ObjectPointer should always be preferred to point to an object, though PathPointer allows pointing to an array or primitive when needed.",
	);

const pathPointer = z
	.tuple([z.union([z.null(), objectPointer])])
	.rest(z.union([z.string(), z.number()]))
	.describe(
		"Points to an object in the tree via a path. The path starts either at an object (via ID) or the root of the tree (via null). When possible, paths should always be relative to an object ID.",
	);

const pointer = z
	.union([objectPointer, pathPointer])
	.describe(
		"Represents a location in the JSON object tree. Either a pointer to an object via ID or a path to an element (can be object, array, or primitive) via path.",
	);

const arrayElementPointer = z
	.union([
		z.object({
			array: describeProp(pathPointer, "The array containing the element"),
			index: z
				.union([z.number(), z.literal("end")])
				.describe(
					`The index in the array, or "end" to mean the end of the array. Indices should be used only for arrays of primitives - use "end" or ObjectPointer for arrays of objects.`,
				),
		}),
		z.object({ after: objectPointer }).describe("Position after the referenced object"),
		z.object({ before: objectPointer }).describe("Position before the referenced object"),
	])
	.describe("Describes a location within an array.");

/**
 * Defines a range within an array.
 */
export const arrayRange = z
	.object({
		from: arrayElementPointer.describe("Start of range (inclusive)"),
		to: arrayElementPointer.describe("End of range (inclusive)"),
	})
	.describe("Defines a range within an array.");

/**
 * Cache used to prevent repeatedly generating the same Zod validation objects for the same {@link SimpleTreeSchema} as generate propts for repeated calls to an LLM
 */
const promptSchemaCache = new WeakMap<
	SimpleTreeSchema,
	ReturnType<typeof generateEditTypes>
>();
const insertionSchemaCache = new WeakMap<
	SimpleTreeSchema,
	ReturnType<typeof generateEditTypes>
>();
const insertionObjectCache = new WeakMap<SimpleNodeSchema, Zod.ZodTypeAny>();

/**
 * TODO
 */
export function generateEditTypesForPrompt(schema: SimpleTreeSchema): {
	editTypes: Record<string, Zod.ZodTypeAny>;
	editRoot: string;
	domainTypes: Record<string, Zod.ZodTypeAny>;
	domainRoot: string;
} {
	return getOrCreate(promptSchemaCache, schema, () =>
		generateEditTypes(schema, false, new Map()),
	);
}

/**
 * TODO
 */
export function generateEditTypesForInsertion(
	schema: SimpleTreeSchema,
): Zod.ZodArray<Zod.ZodTypeAny> {
	const { editTypes, editRoot } = getOrCreate(insertionSchemaCache, schema, () =>
		generateEditTypes(schema, true, insertionObjectCache),
	);
	return editTypes[editRoot] as Zod.ZodArray<Zod.ZodTypeAny>;
}

/**
 * Generates a set of ZOD validation objects for the various types of data that can be put into the provided {@link SimpleTreeSchema}
 * and then uses those sets to generate an all-encompassing ZOD object for each type of {@link TreeEdit} that can validate any of the types of data that can be put into the tree.
 *
 * @returns a Record of schema names to Zod validation objects, and the name of the root schema used to encompass all of the other schemas.
 *
 * @remarks The return type of this function is designed to work with Typechat's createZodJsonValidator as well as be used as the JSON schema for OpenAi's structured output response format.
 */
function generateEditTypes(
	schema: SimpleTreeSchema,
	transformForParsing: boolean,
	objectCache: MapGetSet<SimpleNodeSchema, Zod.ZodTypeAny>,
): {
	editTypes: Record<string, Zod.ZodTypeAny>;
	editRoot: string;
	domainTypes: Record<string, Zod.ZodTypeAny>;
	domainRoot: string;
} {
	const insertSet = new Set<string>();
	const setFieldFieldSet = new Set<string>();
	const setFieldTypeSet = new Set<string>();

	const domainTypeRecord: Record<string, Zod.ZodTypeAny> = {};
	for (const name of schema.definitions.keys()) {
		domainTypeRecord[name] = getOrCreateType(
			schema.definitions,
			insertSet,
			setFieldFieldSet,
			setFieldTypeSet,
			name,
			transformForParsing,
			objectCache,
		);
	}

	const doesSchemaHaveArray = insertSet.size > 0;

	const setField = z
		.object({
			type: z.literal("setField"),
			object: describeProp(objectPointer, "The parent object"),
			field: z.string().describe("The field name to set"),
			value: z
				.unknown()
				.optional()
				.describe(
					"New content to set the property to. Must adhere to domain-specific schema. Omit to indicate that the property should be removed.",
				),
		})
		.describe(
			"Set a field on an object to a specified value. Can be used to remove optional properties.",
		);

	const insertIntoArray = z
		.object({
			type: z.literal("insertIntoArray"),
			position: arrayElementPointer.describe("Where to add the element(s)"),
			value: z
				.unknown()
				.optional()
				.describe(
					"New content to insert. The domain-specific schema must allow this type in the array.",
				),
			values: z
				.array(z.unknown())
				.optional()
				.describe(
					"Array of values to add. The domain-specific schema must allow these types in the array.",
				),
		})
		.describe(
			"Add new element(s) to an array. Only one of `value` or `values` should be set.",
		);

	const removeFromArray = z
		.object({
			type: z.literal("removeFromArray"),
			element: pointer.optional().describe("The element to remove"),
			range: arrayRange.optional().describe("For removing a range"),
		})
		.describe(
			"Remove element(s) from an array. Supports removing a single element or a range. Only one of `element` or `range` should be set.",
		);

	const moveArrayElement = z
		.object({
			type: z.literal("moveArrayElement"),
			source: z
				.union([objectPointer, arrayRange])
				.describe("Source can be a single element or a range"),
			destination: describeProp(
				arrayElementPointer,
				"Where to place the element(s) in the array",
			),
		})
		.describe("Move a value from one location to another array");

	const editTypeRecord: Record<string, Zod.ZodTypeAny> = {
		[objectIdType]: objectId,
		ObjectPointer: objectPointer,
		SetField: setField,
	};

	if (doesSchemaHaveArray) {
		editTypeRecord.PathPointer = pathPointer;
		editTypeRecord.Pointer = pointer;
		editTypeRecord.ArrayPosition = arrayElementPointer;
		editTypeRecord.ArrayRange = arrayRange;
		editTypeRecord.InsertIntoArray = insertIntoArray;
		editTypeRecord.RemoveFromArray = removeFromArray;
		editTypeRecord.MoveArrayElement = moveArrayElement;
	}

	const editTypes = doesSchemaHaveArray
		? z.union([insertIntoArray, removeFromArray, moveArrayElement, setField] as const)
		: setField;

	const editWrapper = z
		.array(editTypes)
		.describe("The set of edits to apply to the JSON tree.");
	editTypeRecord.EditArray = editWrapper;

	let domainRoot: string | undefined;
	const domainRootTypes = Array.from(schema.allowedTypesIdentifiers, (t) => {
		domainRoot = t;
		return getOrCreateType(
			schema.definitions,
			insertSet,
			setFieldFieldSet,
			setFieldTypeSet,
			t,
			transformForParsing,
			objectCache,
		);
	});

	if (hasAtLeastTwo(domainRootTypes)) {
		domainTypeRecord.RootOfTree = z.union(domainRootTypes);
		domainRoot = "RootOfTree";
	}

	return {
		editTypes: editTypeRecord,
		editRoot: "EditArray",
		domainTypes: domainTypeRecord,
		domainRoot: domainRoot ?? fail("Expected at least one allowed type in tree"),
	};
}

/**
 * Creates a Zod type for the provided definition.
 */
export function getOrCreateTypeForInsertion(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	definition: string,
): Zod.ZodTypeAny {
	return getOrCreateType(
		definitionMap,
		new Set<string>(),
		new Set<string>(),
		new Set<string>(),
		definition,
		true,
		insertionObjectCache,
	);
}
function getOrCreateType(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	definition: string,
	transformForParsing: boolean,
	objectCache: MapGetSet<SimpleNodeSchema, Zod.ZodTypeAny>,
): Zod.ZodTypeAny {
	const nodeSchema = definitionMap.get(definition) ?? fail("Unexpected definition");
	return getOrCreate(objectCache, nodeSchema, () => {
		switch (nodeSchema.kind) {
			case NodeKind.Object: {
				for (const [key, field] of nodeSchema.fields) {
					modifyFieldSet.add(key);
					for (const type of field.allowedTypesIdentifiers) {
						modifyTypeSet.add(type);
					}
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const properties = Object.fromEntries(
					[...nodeSchema.fields]
						.map(([key, field]) => {
							return [
								key,
								getOrCreateTypeForField(
									definitionMap,
									insertSet,
									modifyFieldSet,
									modifyTypeSet,
									field,
									transformForParsing,
									objectCache,
								),
							];
						})
						.filter(([, value]) => value !== undefined),
				);
				if (transformForParsing) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					properties[typeField] = z.literal(getFriendlySchemaName(definition)).optional();
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				properties[objectIdKey] = z.optional(objectId);
				const obj = z.object(properties).describe(nodeSchema.metadata?.description ?? "");
				return transformForParsing
					? obj.transform((value) => {
							return {
								...value,
								[typeField]: definition,
							};
						})
					: obj;
			}
			case NodeKind.Array: {
				for (const [name] of Array.from(
					nodeSchema.allowedTypesIdentifiers,
					(n): [string, SimpleNodeSchema] => [
						n,
						definitionMap.get(n) ?? fail("Unknown definition"),
					],
				).filter(
					([_, schema]) => schema.kind === NodeKind.Object || schema.kind === NodeKind.Leaf,
				)) {
					insertSet.add(name);
				}

				const arr = z.array(
					getTypeForAllowedTypes(
						definitionMap,
						insertSet,
						modifyFieldSet,
						modifyTypeSet,
						nodeSchema.allowedTypesIdentifiers,
						transformForParsing,
						objectCache,
					),
				);
				return transformForParsing
					? arr.transform((value: unknown[]) => [definition, ...value])
					: arr;
			}
			case NodeKind.Leaf: {
				switch (nodeSchema.leafKind) {
					case ValueSchema.Boolean: {
						return z.boolean();
					}
					case ValueSchema.Number: {
						return z.number();
					}
					case ValueSchema.String: {
						return z.string();
					}
					case ValueSchema.Null: {
						return z.null();
					}
					default: {
						throw new Error(`Unsupported leaf kind ${NodeKind[nodeSchema.leafKind]}.`);
					}
				}
			}
			default: {
				throw new Error(`Unsupported node kind ${NodeKind[nodeSchema.kind]}.`);
			}
		}
	});
}

function getOrCreateTypeForField(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	fieldSchema: SimpleFieldSchema,
	transformForParsing: boolean,
	objectCache: MapGetSet<SimpleNodeSchema, Zod.ZodTypeAny>,
): Zod.ZodTypeAny | undefined {
	const getDefault: unknown = fieldSchema.metadata?.custom?.[llmDefault];
	if (getDefault !== undefined) {
		if (typeof getDefault !== "function") {
			throw new UsageError(
				`Expected value of ${llmDefault.description} property to be a function, but got ${typeof getDefault}`,
			);
		}

		if (fieldSchema.kind !== FieldKind.Optional) {
			throw new UsageError(
				`The ${llmDefault.description} property is only permitted on optional fields.`,
			);
		}
	}

	const field = getTypeForAllowedTypes(
		definitionMap,
		insertSet,
		modifyFieldSet,
		modifyTypeSet,
		fieldSchema.allowedTypesIdentifiers,
		transformForParsing,
		objectCache,
	).describe(
		getDefault === undefined
			? (fieldSchema.metadata?.description ?? "")
			: "Do not populate this field. It will be automatically supplied by the system after insertion.",
	);

	switch (fieldSchema.kind) {
		case FieldKind.Required: {
			return field;
		}
		case FieldKind.Optional: {
			return transformForParsing
				? field.optional().default(getDefault ?? undefined)
				: field.optional();
		}
		case FieldKind.Identifier: {
			return transformForParsing
				? undefined
				: field
						.optional()
						.describe(
							"This is an ID automatically generated by the system. Do not set supply it when constructing a new object.",
						);
		}
		default: {
			throw new Error(`Unsupported field kind ${NodeKind[fieldSchema.kind]}.`);
		}
	}
}

function getTypeForAllowedTypes(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	allowedTypes: ReadonlySet<string>,
	transformForParsing: boolean,
	cache: MapGetSet<SimpleNodeSchema, Zod.ZodTypeAny>,
): Zod.ZodTypeAny {
	const single = tryGetSingleton(allowedTypes);
	if (single === undefined) {
		const types = [
			...mapIterable(allowedTypes, (name) => {
				return getOrCreateType(
					definitionMap,
					insertSet,
					modifyFieldSet,
					modifyTypeSet,
					name,
					transformForParsing,
					cache,
				);
			}),
		];
		assert(hasAtLeastTwo(types), 0xa7e /* Expected at least two types */);
		return z.union(types);
	} else {
		return getOrCreateType(
			definitionMap,
			insertSet,
			modifyFieldSet,
			modifyTypeSet,
			single,
			transformForParsing,
			cache,
		);
	}
}

/**
 * Determines if the provided {@link TreeNode} contains an array schema.
 */
export function doesNodeContainArraySchema(node: TreeNode): boolean {
	const schema = Tree.schema(node);
	const simpleSchema = getSimpleSchema(schema);
	for (const [, nodeSchema] of simpleSchema.definitions) {
		if (nodeSchema.kind === NodeKind.Array) {
			return true;
		}
	}

	return false;
}

function describeProp<T extends z.ZodTypeAny>(type: T, description: string): z.ZodUnion<[T]> {
	// This is a hack to get around the fact that Zod doesn't allow unions of a single type.
	// However, we need to use such unions in some cases.
	// Sometimes, when a type is used for a property and we want to describe the property, appending a `.describe(...)` to the type causes TypeChat to inline the contents of the type instead of using the type name for that property.
	// This doesn't seem to happen consistently, but if we wrap the type in a union of one, it seems to do the correct thing.
	return z.union([type] as unknown as [T, T]).describe(description) as unknown as z.ZodUnion<
		[T]
	>;
}
