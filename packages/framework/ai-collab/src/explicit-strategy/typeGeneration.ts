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
import { fail, getOrCreate, mapIterable, tryGetSingleton } from "./utils.js";

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

const arrayPosition = z
	.union([
		z.number().describe("Exact index, should be used only for arrays of primitives."),
		z.literal("start").describe("Beginning of array"),
		z.literal("end").describe("End of array"),
		z.object({ after: pointer }).describe("Position after the referenced element"),
		z.object({ before: pointer }).describe("Position before the referenced element"),
	])
	.describe("Describes a location within an array.");

/**
 * Defines a range within an array.
 */
export const arrayRange = z
	.object({
		array: describeProp(pathPointer, "The array containing the range"),
		from: arrayPosition.describe("Start of range (inclusive)"),
		to: arrayPosition.describe("End of range (inclusive)"),
	})
	.describe("Defines a range within an array.");

/**
 * Cache used to prevent repeatedly generating the same Zod validation objects for the same {@link SimpleTreeSchema} as generate propts for repeated calls to an LLM
 */
const cache = new WeakMap<SimpleTreeSchema, ReturnType<typeof generateGenericEditTypes>>();
// /**
//  * A map from field string to all object identifiers that can have a field with that key.
//  */
// const fieldToObjectIdentifier = new Map<string, Set<string>>();

// function something(schema: SimpleTreeSchema, keys: Iterable<string>): Set<string> {
// 	// Find all candidates that have at least one of the given keys
// 	const candidates = new Set<string>();
// 	for (const key of [...keys]) {
// 		const objects = fieldToObjectIdentifier.get(key);
// 		if (objects !== undefined) {
// 			for (const o of objects) {
// 				candidates.add(o);
// 			}
// 		}
// 	}

// 	// Refine to all candidates that have all of the given keys
// 	const candidates2 = new Set<string>();
// 	for (const c of candidates) {
// 		const objectSchema = schema.definitions.get(c);
// 		assert(objectSchema?.kind === NodeKind.Object, "Expected object schema");
// 		let hasAllKeys = true;
// 		for (const key of keys) {
// 			if (objectSchema.fields[key] === undefined) {
// 				hasAllKeys = false;
// 				break;
// 			}
// 		}
// 		if (hasAllKeys) {
// 			candidates2.add(c);
// 		}
// 	}

// 	return candidates2;
// }

/**
 * Generates a set of ZOD validation objects for the various types of data that can be put into the provided {@link SimpleTreeSchema}
 * and then uses those sets to generate an all-encompassing ZOD object for each type of {@link TreeEdit} that can validate any of the types of data that can be put into the tree.
 *
 * @returns a Record of schema names to Zod validation objects, and the name of the root schema used to encompass all of the other schemas.
 *
 * @remarks The return type of this function is designed to work with Typechat's createZodJsonValidator as well as be used as the JSON schema for OpenAi's structured output response format.
 */
export function generateGenericEditTypes(
	schema: SimpleTreeSchema,
	generateDomainTypes: boolean,
): [Record<string, Zod.ZodTypeAny>, root: string] {
	return getOrCreate(cache, schema, () => {
		const insertSet = new Set<string>();
		const setFieldFieldSet = new Set<string>();
		const setFieldTypeSet = new Set<string>();
		const typeMap = new Map<string, Zod.ZodTypeAny>();

		for (const name of schema.definitions.keys()) {
			getOrCreateType(
				schema.definitions,
				typeMap,
				insertSet,
				setFieldFieldSet,
				setFieldTypeSet,
				name,
			);
		}
		function getType(allowedTypes: ReadonlySet<string>): Zod.ZodTypeAny {
			switch (allowedTypes.size) {
				case 0: {
					return z.never();
				}
				case 1: {
					return (
						typeMap.get(tryGetSingleton(allowedTypes) ?? fail("Expected singleton")) ??
						fail("Unknown type")
					);
				}
				default: {
					const types = Array.from(
						allowedTypes,
						(name) => typeMap.get(name) ?? fail("Unknown type"),
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
				value: generateDomainTypes
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

		const insertValue = generateDomainTypes ? getType(insertSet) : z.any();

		const insertIntoArray = z
			.object({
				type: z.literal("insertIntoArray"),
				array: describeProp(pathPointer, "The parent array"),
				position: arrayPosition.describe("Where to add the element(s)"),
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
				destination: z
					.object({
						target: describeProp(pathPointer, "The target array"),
						position: arrayPosition.describe("Where to place the element(s) in the array"),
					})
					.describe("Destination must be an array position"),
			})
			.describe("Move a value from one location to another array");

		const typeRecord: Record<string, Zod.ZodTypeAny> = {
			ObjectPointer: objectPointer,
			SetField: setField,
		};

		if (doesSchemaHaveArray) {
			typeRecord.PathPointer = pathPointer;
			typeRecord.Pointer = pointer;
			typeRecord.ArrayPosition = arrayPosition;
			typeRecord.ArrayRange = arrayRange;
			typeRecord.InsertIntoArray = insertIntoArray;
			typeRecord.RemoveFromArray = removeFromArray;
			typeRecord.MoveArrayElement = moveArrayElement;
		}

		const editTypes = doesSchemaHaveArray
			? z.union([insertIntoArray, removeFromArray, moveArrayElement, setField] as const)
			: setField;

		const editWrapper = z
			.array(editTypes)
			.describe("The set of edits to apply to the JSON tree.");
		typeRecord.EditArray = editWrapper;

		return [typeRecord, "EditArray"];
	});
}

function getOrCreateType(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	typeMap: Map<string, Zod.ZodTypeAny>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	definition: string,
): Zod.ZodTypeAny {
	return getOrCreate(typeMap, definition, () => {
		const nodeSchema = definitionMap.get(definition) ?? fail("Unexpected definition");
		switch (nodeSchema.kind) {
			case NodeKind.Object: {
				for (const [key, field] of Object.entries(nodeSchema.fields)) {
					// getOrCreate(fieldToObjectIdentifier, key, () => new Set()).add(definition);
					// TODO: Remove when AI better
					if (
						Array.from(
							field.allowedTypes,
							(n) => definitionMap.get(n) ?? fail("Unknown definition"),
						).some((n) => n.kind === NodeKind.Array)
					) {
						continue;
					}
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
									typeMap,
									insertSet,
									modifyFieldSet,
									modifyTypeSet,
									field,
								),
							];
						})
						.filter(([, value]) => value !== undefined),
				);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				properties[typeField] = z.enum([definition]);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				properties[objectIdKey] = z.union([
					z.null(),
					z
						.string()
						.describe(
							`The id (${objectIdKey}) of the object (only necessary if the object must be referred to later in the same task - if not, set to null)`,
						),
				]);
				return z.object(properties);
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
				return z.array(
					getTypeForAllowedTypes(
						definitionMap,
						typeMap,
						insertSet,
						modifyFieldSet,
						modifyTypeSet,
						nodeSchema.allowedTypes,
					),
				);
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
	typeMap: Map<string, Zod.ZodTypeAny>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	fieldSchema: SimpleFieldSchema,
): Zod.ZodTypeAny | undefined {
	if ((fieldSchema.metadata as FieldSchemaMetadataAlpha)?.llmDefault !== undefined) {
		return undefined;
	}

	switch (fieldSchema.kind) {
		case FieldKind.Required: {
			return getTypeForAllowedTypes(
				definitionMap,
				typeMap,
				insertSet,
				modifyFieldSet,
				modifyTypeSet,
				fieldSchema.allowedTypes,
			);
		}
		case FieldKind.Optional: {
			return z.union([
				z.null(),
				getTypeForAllowedTypes(
					definitionMap,
					typeMap,
					insertSet,
					modifyFieldSet,
					modifyTypeSet,
					fieldSchema.allowedTypes,
				),
			]);
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
	typeMap: Map<string, Zod.ZodTypeAny>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	allowedTypes: ReadonlySet<string>,
): Zod.ZodTypeAny {
	const single = tryGetSingleton(allowedTypes);
	if (single === undefined) {
		const types = [
			...mapIterable(allowedTypes, (name) => {
				return getOrCreateType(
					definitionMap,
					typeMap,
					insertSet,
					modifyFieldSet,
					modifyTypeSet,
					name,
				);
			}),
		];
		assert(hasAtLeastTwo(types), 0xa7e /* Expected at least two types */);
		return z.union(types);
	} else {
		return getOrCreateType(
			definitionMap,
			typeMap,
			insertSet,
			modifyFieldSet,
			modifyTypeSet,
			single,
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
