/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import type { FieldSchemaMetadataAlpha } from "@fluidframework/tree/alpha";
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

import { objectIdKey, typeField } from "./agentEditTypes.js";
import { getFriendlySchemaName } from "./promptGeneration.js";
import { fail, getOrCreate, mapIterable, tryGetSingleton, type MapGetSet } from "./utils.js";

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

/**
 * TODO
 */
export function generateEditTypesForPrompt(schema: SimpleTreeSchema): {
	editTypes: Record<string, Zod.ZodTypeAny>;
	editRoot: string;
	domainTypes: Record<string, Zod.ZodTypeAny>;
	domainRoot: string;
} {
	return getOrCreate(promptSchemaCache, schema, () => generateEditTypes(schema, false));
}

/**
 * TODO
 */
export function generateEditTypesForInsertion(
	schema: SimpleTreeSchema,
): Zod.ZodArray<Zod.ZodTypeAny> {
	const { editTypes, editRoot } = getOrCreate(insertionSchemaCache, schema, () =>
		generateEditTypes(schema, true),
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
): {
	editTypes: Record<string, Zod.ZodTypeAny>;
	editRoot: string;
	domainTypes: Record<string, Zod.ZodTypeAny>;
	domainRoot: string;
} {
	const objectSchemaCache = new Map<SimpleNodeSchema, Zod.ZodTypeAny>();
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
			objectSchemaCache,
		);
	}
	function getType(allowedTypes: ReadonlySet<string>): Zod.ZodTypeAny {
		switch (allowedTypes.size) {
			case 0: {
				return z.never();
			}
			case 1: {
				return (
					objectSchemaCache.get(
						schema.definitions.get(
							tryGetSingleton(allowedTypes) ?? fail("Expected singleton"),
						) ?? fail("Unknown type"),
					) ?? fail("Unknown type")
				);
			}
			default: {
				const types = Array.from(
					allowedTypes,
					(name) =>
						objectSchemaCache.get(schema.definitions.get(name) ?? fail("Expected type")) ??
						fail("Unknown type"),
				);
				assert(hasAtLeastTwo(types), 0xa7d /* Expected at least two types */);
				return z.union(types);
			}
		}
	}

	const doesSchemaHaveArray = insertSet.size > 0;

	const setField = z
		.object({
			type: z.literal("setField"),
			object: describeProp(objectPointer, "The parent object"),
			field: z.string().describe("The field name to set"),
			value: transformForParsing
				? getType(setFieldTypeSet)
				: z
						.any()
						.describe(
							"New content to set the field to. Must adhere to domain-specific schema.",
						),
		})
		.describe(
			"Set a field on an object to a specified value. Can be used set optional fields to undefined.",
		);

	const insertValue = transformForParsing ? getType(insertSet) : z.any();

	const insertIntoArray = z
		.object({
			type: z.literal("insertIntoArray"),
			position: arrayElementPointer.describe("Where to add the element(s)"),
			value: insertValue
				.optional()
				.describe(
					"New content to insert. The domain-specific schema must allow this type in the array.",
				),
			values: z
				.array(insertValue)
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
	const domainRootTypes = Array.from(schema.allowedTypes, (t) => {
		domainRoot = t;
		return getOrCreateType(
			schema.definitions,
			insertSet,
			setFieldFieldSet,
			setFieldTypeSet,
			t,
			transformForParsing,
			objectSchemaCache,
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

function getOrCreateType(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	definition: string,
	transformForParsing: boolean,
	cache: MapGetSet<SimpleNodeSchema, Zod.ZodTypeAny>,
): Zod.ZodTypeAny {
	const nodeSchema = definitionMap.get(definition) ?? fail("Unexpected definition");
	return getOrCreate(cache, nodeSchema, () => {
		switch (nodeSchema.kind) {
			case NodeKind.Object: {
				for (const [key, field] of Object.entries(nodeSchema.fields)) {
					// TODO: Remove when AI better
					// if (
					// 	Array.from(
					// 		field.allowedTypes,
					// 		(n) => definitionMap.get(n) ?? fail("Unknown definition"),
					// 	).some((n) => n.kind === NodeKind.Array)
					// ) {
					// 	continue;
					// }
					modifyFieldSet.add(key);
					for (const type of field.allowedTypes) {
						modifyTypeSet.add(type);
					}
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const properties = Object.fromEntries(
					Object.entries(nodeSchema.fields)
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
									cache,
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
				properties[objectIdKey] = z
					.string()
					.optional()
					.describe(
						`The id of the object (when creating a new tree, only supply if the object must be referred to later in the same task)`,
					);

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
					nodeSchema.allowedTypes,
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
						nodeSchema.allowedTypes,
						transformForParsing,
						cache,
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
	cache: MapGetSet<SimpleNodeSchema, Zod.ZodTypeAny>,
): Zod.ZodTypeAny | undefined {
	const getDefault = (fieldSchema.metadata as FieldSchemaMetadataAlpha)?.llmDefault;

	switch (fieldSchema.kind) {
		case FieldKind.Required: {
			return getTypeForAllowedTypes(
				definitionMap,
				insertSet,
				modifyFieldSet,
				modifyTypeSet,
				fieldSchema.allowedTypes,
				transformForParsing,
				cache,
			).describe(fieldSchema.metadata?.description ?? "");
		}
		case FieldKind.Optional: {
			const opt = getTypeForAllowedTypes(
				definitionMap,
				insertSet,
				modifyFieldSet,
				modifyTypeSet,
				fieldSchema.allowedTypes,
				transformForParsing,
				cache,
			)
				.optional()
				.describe(
					getDefault === undefined
						? (fieldSchema.metadata?.description ?? "")
						: "Do not populate this field. It will be automatically supplied by the system after insertion.",
				);
			return transformForParsing ? opt.default(getDefault ?? undefined) : opt;
		}
		case FieldKind.Identifier: {
			return undefined;
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

function hasAtLeastTwo<T>(array: T[]): array is [T, T, ...T[]] {
	return array.length >= 2;
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
