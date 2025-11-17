/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	ArrayNodeSchema,
	FieldKind,
	getSimpleSchema,
	MapNodeSchema,
	NodeKind,
	ObjectNodeSchema,
	RecordNodeSchema,
	ValueSchema,
	walkFieldSchema,
} from "@fluidframework/tree/internal";
import type {
	ImplicitFieldSchema,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
	TreeNodeSchema,
} from "@fluidframework/tree/internal";
import { z, type ZodTypeAny } from "zod";

import type { BindableSchema } from "./methodBinding.js";
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
		const allSchemas = new Set<TreeNodeSchema>();
		const objectTypeSchemas = new Set<TreeNodeSchema>();
		walkFieldSchema(rootSchema, {
			node: (n) => {
				allSchemas.add(n);
				if (
					n instanceof ObjectNodeSchema ||
					n instanceof MapNodeSchema ||
					n instanceof ArrayNodeSchema ||
					n instanceof RecordNodeSchema
				) {
					objectTypeSchemas.add(n);
					const exposedMethods = getExposedMethods(n);
					for (const t of exposedMethods.referencedTypes) {
						allSchemas.add(t);
						objectTypeSchemas.add(t);
					}
				}
			},
		});
		const nodeSchemas = [...objectTypeSchemas.values()] as BindableSchema[];
		const bindableSchemas = new Map<string, BindableSchema>(
			nodeSchemas.map((nodeSchema) => [nodeSchema.identifier, nodeSchema]),
		);
		return generateEditTypes(
			[...allSchemas.values()].map((s) => getSimpleSchema(s)),
			new Map(),
			bindableSchemas,
		);
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
	schemas: Iterable<SimpleTreeSchema>,
	objectCache: MapGetSet<SimpleNodeSchema, ZodTypeAny>,
	bindableSchemas: Map<string, BindableSchema>,
): {
	domainTypes: Record<string, ZodTypeAny>;
} {
	const domainTypes: Record<string, ZodTypeAny> = {};
	for (const schema of schemas) {
		for (const name of schema.definitions.keys()) {
			// If this does overwrite anything in domainTypes, it is guaranteed to be overwritten with an identical value due to the getOrCreate
			domainTypes[name] = getOrCreateType(
				schema.definitions,
				name,
				objectCache,
				bindableSchemas,
			);
		}
	}

	return {
		domainTypes,
	};
}

function getBoundMethodsForBindable(bindableSchema: BindableSchema): {
	referencedTypes: Set<TreeNodeSchema>;
	methods: [string, ZodTypeAny][];
} {
	const methodTypes: [string, ZodTypeAny][] = [];
	const methods = getExposedMethods(bindableSchema);
	for (const [name, method] of Object.entries(methods.methods)) {
		const zodFunction = z.instanceof(FunctionWrapper);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		(zodFunction as any).method = method;
		methodTypes.push([name, zodFunction]);
	}
	return { methods: methodTypes, referencedTypes: methods.referencedTypes };
}

function getBoundMethods(
	definition: string,
	bindableSchemas: Map<string, BindableSchema>,
): [string, ZodTypeAny][] {
	const bindableSchema = bindableSchemas.get(definition) ?? fail("Unknown definition");
	return getBoundMethodsForBindable(bindableSchema).methods;
}

function addBindingIntersectionIfNeeded(
	typeString: "array" | "map" | "record",
	zodTypeBound: ZodTypeAny,
	definition: string,
	simpleNodeSchema: SimpleNodeSchema,
	bindableSchemas: Map<string, BindableSchema>,
): ZodTypeAny {
	let zodType = zodTypeBound;
	let description = simpleNodeSchema.metadata?.description ?? "";
	const boundMethods = getBoundMethods(definition, bindableSchemas);
	if (boundMethods.length > 0) {
		const methods: Record<string, z.ZodTypeAny> = {};
		for (const [name, zodFunction] of boundMethods) {
			if (methods[name] !== undefined) {
				throw new UsageError(
					`Method ${name} conflicts with field of the same name in schema ${definition}`,
				);
			}
			methods[name] = zodFunction;
		}
		zodType = z.intersection(zodType, z.object(methods));
		const methodNote = `Note: this ${typeString} has custom user-defined methods directly on it.`;
		description = description === "" ? methodNote : `${description} - ${methodNote}`;
	}
	return zodType.describe(description);
}

function getOrCreateType(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	definition: string,
	objectCache: MapGetSet<SimpleNodeSchema, ZodTypeAny>,
	bindableSchemas: Map<string, BindableSchema>,
): ZodTypeAny {
	const simpleNodeSchema = definitionMap.get(definition) ?? fail("Unexpected definition");
	return getOrCreate(objectCache, simpleNodeSchema, () => {
		// Handle recursive types: temporarily create a zod "lazy" type that can be referenced by a recursive call to getOrCreateType.
		let type: ZodTypeAny | undefined;
		objectCache.set(
			simpleNodeSchema,
			z.lazy(() => type ?? fail("Recursive type used before creation")),
		);
		switch (simpleNodeSchema.kind) {
			case NodeKind.Object: {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const properties: Record<string, z.ZodTypeAny> = Object.fromEntries(
					[...simpleNodeSchema.fields]
						.map(([key, field]) => {
							return [
								key,
								getOrCreateTypeForField(definitionMap, field, objectCache, bindableSchemas),
							];
						})
						.filter(([, value]) => value !== undefined),
				);

				// Unlike arrays/maps/records, object nodes include methods directly on them rather than using an intersection
				for (const [name, zodFunction] of getBoundMethods(definition, bindableSchemas)) {
					if (properties[name] !== undefined) {
						throw new UsageError(
							`Method ${name} conflicts with field of the same name in schema ${definition}`,
						);
					}
					properties[name] = zodFunction;
				}

				return (type = z
					.object(properties)
					.describe(simpleNodeSchema.metadata?.description ?? ""));
			}
			case NodeKind.Map: {
				const zodType = z.map(
					z.string(),
					getTypeForAllowedTypes(
						definitionMap,
						new Set(simpleNodeSchema.simpleAllowedTypes.keys()),
						objectCache,
						bindableSchemas,
					),
				);
				return (type = addBindingIntersectionIfNeeded(
					"map",
					zodType,
					definition,
					simpleNodeSchema,
					bindableSchemas,
				));
			}
			case NodeKind.Record: {
				const zodType = z.record(
					getTypeForAllowedTypes(
						definitionMap,
						new Set(simpleNodeSchema.simpleAllowedTypes.keys()),
						objectCache,
						bindableSchemas,
					),
				);
				return (type = addBindingIntersectionIfNeeded(
					"record",
					zodType,
					definition,
					simpleNodeSchema,
					bindableSchemas,
				));
			}
			case NodeKind.Array: {
				const zodType = z.array(
					getTypeForAllowedTypes(
						definitionMap,
						new Set(simpleNodeSchema.simpleAllowedTypes.keys()),
						objectCache,
						bindableSchemas,
					),
				);
				return (type = addBindingIntersectionIfNeeded(
					"array",
					zodType,
					definition,
					simpleNodeSchema,
					bindableSchemas,
				));
			}
			case NodeKind.Leaf: {
				switch (simpleNodeSchema.leafKind) {
					case ValueSchema.Boolean: {
						return (type = z.boolean());
					}
					case ValueSchema.Number: {
						return (type = z.number());
					}
					case ValueSchema.String: {
						return (type = z.string());
					}
					case ValueSchema.Null: {
						return (type = z.null());
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
	bindableSchemas: Map<string, BindableSchema>,
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
		new Set(fieldSchema.simpleAllowedTypes.keys()),
		objectCache,
		bindableSchemas,
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
	bindableSchemas: Map<string, BindableSchema>,
): ZodTypeAny {
	const single = tryGetSingleton(allowedTypes);
	if (single === undefined) {
		const types = [
			...mapIterable(allowedTypes, (name) => {
				return getOrCreateType(definitionMap, name, objectCache, bindableSchemas);
			}),
		];
		assert(hasAtLeastTwo(types), 0xa7e /* Expected at least two types */);
		return z.union(types);
	} else {
		return getOrCreateType(definitionMap, single, objectCache, bindableSchemas);
	}
}
