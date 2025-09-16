/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	FieldKind,
	NodeKind,
	ValueSchema,
	walkFieldSchema,
} from "@fluidframework/tree/internal";
import type {
	ImplicitFieldSchema,
	SchemaVisitor,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
	TreeNodeSchema,
} from "@fluidframework/tree/internal";
import { z, type ZodTypeAny } from "zod";

import type { NodeSchema } from "./methodBinding.js";
import { FunctionWrapper, getExposedMethods } from "./methodBinding.js";
import {
	fail,
	getOrCreate,
	hasAtLeastTwo,
	llmDefault,
	mapIterable,
	tryGetSingleton,
	type MapGetSet,
} from "./utils.js";

/**
 *
 * TODO: Add a prompt suggestion API!
 *
 * TODO: Handle rate limit errors.
 *
 * TODO: Pass descriptions from schema metadata to the generated TS types that we put in the prompt
 *
 * TODO make the Ids be "Vector-2" instead of "Vector2" (or else it gets weird when you have a type called "Vector2")
 */

/**
 * Cache used to prevent repeatedly generating the same Zod validation objects for the same {@link SimpleTreeSchema} as generate propts for repeated calls to an LLM
 */
const promptSchemaCache = new WeakMap<
	SimpleTreeSchema,
	ReturnType<typeof generateEditTypes>
>();

/**
 * TODO
 */
export function generateEditTypesForPrompt(
	rootSchema: ImplicitFieldSchema,
	schema: SimpleTreeSchema,
): {
	domainTypes: Record<string, ZodTypeAny>;
} {
	return getOrCreate(promptSchemaCache, schema, () => {
		const treeNodeSchemas = new Set<TreeNodeSchema>();
		walkFieldSchema(rootSchema, {} satisfies SchemaVisitor, treeNodeSchemas);
		const nodeSchemas = [...treeNodeSchemas.values()].filter(
			(treeNodeSchema) => treeNodeSchema.kind === NodeKind.Object,
		) as NodeSchema[];
		const treeNodeSchemaMap = new Map<string, NodeSchema>(
			nodeSchemas.map((nodeSchema) => [nodeSchema.identifier, nodeSchema]),
		);
		return generateEditTypes(schema, new Map(), treeNodeSchemaMap);
	});
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
	objectCache: MapGetSet<SimpleNodeSchema, ZodTypeAny>,
	treeSchemaMap: Map<string, NodeSchema> | undefined,
): {
	domainTypes: Record<string, ZodTypeAny>;
} {
	const domainTypes: Record<string, ZodTypeAny> = {};
	for (const name of schema.definitions.keys()) {
		domainTypes[name] = getOrCreateType(schema.definitions, name, objectCache, treeSchemaMap);
	}

	return {
		domainTypes,
	};
}

function getOrCreateType(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	definition: string,
	objectCache: MapGetSet<SimpleNodeSchema, ZodTypeAny>,
	treeSchemaMap: Map<string, NodeSchema> | undefined,
): ZodTypeAny {
	const simpleNodeSchema = definitionMap.get(definition) ?? fail("Unexpected definition");
	return getOrCreate(objectCache, simpleNodeSchema, () => {
		switch (simpleNodeSchema.kind) {
			case NodeKind.Object: {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const properties: Record<string, z.ZodTypeAny> = Object.fromEntries(
					[...simpleNodeSchema.fields]
						.map(([key, field]) => {
							return [
								key,
								getOrCreateTypeForField(definitionMap, field, objectCache, treeSchemaMap),
							];
						})
						.filter(([, value]) => value !== undefined),
				);
				if (treeSchemaMap) {
					const nodeSchema = treeSchemaMap.get(definition) ?? fail("Unknown definition");
					const methods = getExposedMethods(nodeSchema);
					for (const [name, method] of Object.entries(methods)) {
						if (properties[name] !== undefined) {
							throw new UsageError(
								`Method ${name} conflicts with field of the same name in schema ${definition}`,
							);
						}
						const zodFunction = z.instanceof(FunctionWrapper);
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
						(zodFunction as any).method = method;
						properties[name] = zodFunction;
					}
				}
				return z.object(properties).describe(simpleNodeSchema.metadata?.description ?? "");
			}
			case NodeKind.Map: {
				return z
					.map(
						z.string(),
						getTypeForAllowedTypes(
							definitionMap,
							simpleNodeSchema.allowedTypesIdentifiers,
							objectCache,
							treeSchemaMap,
						),
					)
					.describe(simpleNodeSchema.metadata?.description ?? "");
			}
			case NodeKind.Record: {
				return z
					.record(
						getTypeForAllowedTypes(
							definitionMap,
							simpleNodeSchema.allowedTypesIdentifiers,
							objectCache,
							treeSchemaMap,
						),
					)
					.describe(simpleNodeSchema.metadata?.description ?? "");
			}
			case NodeKind.Array: {
				return z
					.array(
						getTypeForAllowedTypes(
							definitionMap,
							simpleNodeSchema.allowedTypesIdentifiers,
							objectCache,
							treeSchemaMap,
						),
					)
					.describe(simpleNodeSchema.metadata?.description ?? "");
			}
			case NodeKind.Leaf: {
				switch (simpleNodeSchema.leafKind) {
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
						throw new Error(`Unsupported leaf kind ${NodeKind[simpleNodeSchema.leafKind]}.`);
					}
				}
			}
			default: {
				return unreachableCase(simpleNodeSchema, "Unknown node kind");
			}
		}
	});
}

function getOrCreateTypeForField(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	fieldSchema: SimpleFieldSchema,
	objectCache: MapGetSet<SimpleNodeSchema, ZodTypeAny>,
	treeSchemaMap: Map<string, NodeSchema> | undefined,
): ZodTypeAny {
	const customMetadata = fieldSchema.metadata.custom as
		| Record<string | symbol, unknown>
		| undefined;
	const getDefault = customMetadata?.[llmDefault];
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
		fieldSchema.allowedTypesIdentifiers,
		objectCache,
		treeSchemaMap,
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
			return field.optional();
		}
		case FieldKind.Identifier: {
			return field
				.optional()
				.describe(
					"This is an ID automatically generated by the system. Do not supply it when constructing a new object.",
				);
		}
		default: {
			throw new Error(`Unsupported field kind ${NodeKind[fieldSchema.kind]}.`);
		}
	}
}

function getTypeForAllowedTypes(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	allowedTypes: ReadonlySet<string>,
	objectCache: MapGetSet<SimpleNodeSchema, ZodTypeAny>,
	treeSchemaMap: Map<string, NodeSchema> | undefined,
): ZodTypeAny {
	const single = tryGetSingleton(allowedTypes);
	if (single === undefined) {
		const types = [
			...mapIterable(allowedTypes, (name) => {
				return getOrCreateType(definitionMap, name, objectCache, treeSchemaMap);
			}),
		];
		assert(hasAtLeastTwo(types), 0xa7e /* Expected at least two types */);
		return z.union(types);
	} else {
		return getOrCreateType(definitionMap, single, objectCache, treeSchemaMap);
	}
}
