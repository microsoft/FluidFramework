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
import { fail, getOrCreate, mapIterable } from "./utils.js";

/**
 * Zod Object type used to represent & validate the ObjectTarget type within a {@link TreeEdit}.
 * @remarks this is used as a component with {@link generateGenericEditTypes} to produce the final zod validation objects.
 */
const objectTarget = z
	.object({
		target: z
			.string()
			.describe(
				`The id of the object (as specified by the object's ${objectIdKey} property) that is being referenced`,
			),
	})
	.describe(
		"A pointer to a specific object node in the tree, identified by the target object's Id.",
	);
/**
 * Zod Object type used to represent & validate the ObjectPlace type within a {@link TreeEdit}.
 * @remarks this is used as a component with {@link generateGenericEditTypes} to produce the final zod validation objects.
 */
const objectPlace = z
	.object({
		type: z.enum(["objectPlace"]),
		target: z
			.string()
			.describe(
				`The id (${objectIdKey}) of the object that the new/moved object should be placed relative to. This must be the id of an object that already existed in the tree content that was originally supplied.`,
			),
		place: z
			.enum(["before", "after"])
			.describe(
				"Where the new/moved object will be relative to the target object - either just before or just after",
			),
	})
	.describe(
		"A pointer to a location either just before or just after an object that is in an array",
	);
/**
 * Zod Object type used to represent & validate the ArrayPlace type within a {@link TreeEdit}.
 * @remarks this is used as a component with {@link generateGenericEditTypes} to produce the final zod validation objects.
 */
const arrayPlace = z
	.object({
		type: z.enum(["arrayPlace"]),
		parentId: z
			.string()
			.describe(
				`The id (${objectIdKey}) of the parent object of the array. This must be the id of an object that already existed in the tree content that was originally supplied.`,
			),
		field: z.string().describe("The key of the array to insert into"),
		location: z
			.enum(["start", "end"])
			.describe("Where to insert into the array - either the start or the end"),
	})
	.describe(
		`either the "start" or "end" of an array, as specified by a "parent" ObjectTarget and a "field" name under which the array is stored (useful for prepending or appending)`,
	);
/**
 * Zod Object type used to represent & validate the Range type within a {@link TreeEdit}.
 * @remarks this is used as a component with {@link generateGenericEditTypes} to produce the final zod validation objects.
 */
const range = z
	.object({
		from: objectPlace,
		to: objectPlace,
	})
	.describe(
		'A range of objects in the same array specified by a "from" and "to" Place. The "to" and "from" objects MUST be in the same array.',
	);
/**
 * Cache used to prevent repeatedly generating the same Zod validation objects for the same {@link SimpleTreeSchema} as generate propts for repeated calls to an LLM
 */
const cache = new WeakMap<SimpleTreeSchema, ReturnType<typeof generateGenericEditTypes>>();

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
				type: z.enum(["setField"]),
				target: objectTarget,
				field: z.enum([...setFieldFieldSet] as [string, ...string[]]), // Modify with appropriate fields
				newValue: generateDomainTypes
					? getType(setFieldTypeSet)
					: z.any().describe("Domain-specific content here"),
			})
			.describe("Sets a field on a specific ObjectTarget.");

		const removeFromArray = z
			.object({
				type: z.literal("removeFromArray"),
				source: z.union([objectTarget, range]),
			})
			.describe("Deletes an object or Range of objects from the tree.");

		const insertIntoArray = z
			.object({
				type: z.literal("insertIntoArray"),
				content: generateDomainTypes
					? getType(insertSet)
					: z.any().describe("Domain-specific content here"),
				destination: z.union([arrayPlace, objectPlace]),
			})
			.describe("Inserts a new object at a specific Place or ArrayPlace.");

		const moveArrayElement = z
			.object({
				type: z.literal("moveArrayElement"),
				source: z.union([objectTarget, range]),
				destination: z.union([arrayPlace, objectPlace]),
			})
			.describe("Moves an object or Range of objects to a new Place or ArrayPlace.");

		const typeRecord: Record<string, Zod.ZodTypeAny> = {
			ObjectTarget: objectTarget,
			SetField: setField,
		};

		if (doesSchemaHaveArray) {
			typeRecord.ObjectPlace = objectPlace;
			typeRecord.ArrayPlace = arrayPlace;
			typeRecord.Range = range;
			typeRecord.InsertIntoArray = insertIntoArray;
			typeRecord.RemoveFromArray = removeFromArray;
			typeRecord.MoveArrayElement = moveArrayElement;
		}

		const editTypes = doesSchemaHaveArray
			? z.union([insertIntoArray, removeFromArray, moveArrayElement, setField] as const)
			: setField;

		const editWrapper = z
			.array(editTypes)
			.describe("The next edit to apply to the tree, or null if the task is complete.");
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

function tryGetSingleton<T>(set: ReadonlySet<T>): T | undefined {
	if (set.size === 1) {
		for (const item of set) {
			return item;
		}
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
