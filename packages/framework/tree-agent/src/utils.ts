/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ImplicitFieldSchema } from "@fluidframework/tree";
import type {
	InsertableContent,
	TreeNode,
	TreeNodeSchema,
	UnsafeUnknownSchema,
} from "@fluidframework/tree/alpha";
import {
	ArrayNodeSchema,
	MapNodeSchema,
	RecordNodeSchema,
	TreeAlpha,
} from "@fluidframework/tree/alpha";
import { NodeKind, normalizeFieldSchema } from "@fluidframework/tree/internal";

/**
 * Subset of Map interface.
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}

/**
 * TBD
 */
export function fail(message: string): never {
	throw new Error(message);
}

/**
 * Map one iterable to another by transforming each element one at a time
 * @param iterable - the iterable to transform
 * @param map - the transformation function to run on each element of the iterable
 * @returns a new iterable of elements which have been transformed by the `map` function
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export function* mapIterable<T, U>(
	iterable: Iterable<T>,
	map: (t: T) => U,
): IterableIterator<U> {
	for (const t of iterable) {
		yield map(t);
	}
}

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export function getOrCreate<K, V>(
	map: MapGetSet<K, V>,
	key: K,
	defaultValue: (key: K) => V,
): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

/**
 * TODO
 */
export function tryGetSingleton<T>(set: ReadonlySet<T>): T | undefined {
	if (set.size === 1) {
		for (const item of set) {
			return item;
		}
	}
}

/**
 * Does it have at least two elements?
 */
export function hasAtLeastTwo<T>(array: T[]): array is [T, T, ...T[]] {
	return array.length >= 2;
}

/**
 * Include this property in a field's schema metadata to indicate that the field's value should be generated via a provided function rather than by the LLM.
 * @example
 * ```ts
 * class Object extends schemaFactory.object("Object", {
 *     created: sf.required(sf.number, {
 *         custom: {
 *             // The LLM will ignore this field, and instead it will be populated with the result of the function
 *             [llmDefault]: () => Date.now(),
 *         },
 *     }),
 * }) {};
 * ```
 * @alpha
 */
export const llmDefault = Symbol("tree-agent/llmDefault");
// TODO: make this a wrapper function instead, and hide the symbol.
// function llmDefault<T extends FieldSchemaMetadata>(metadata: T): T { ... }

/**
 * Usage fail
 */
export function failUsage(message: string): never {
	throw new UsageError(message);
}

/**
 * Construct an object node from a schema and value.
 */
export function constructNode(schema: TreeNodeSchema, value: InsertableContent): TreeNode {
	const node = TreeAlpha.create<UnsafeUnknownSchema>(schema, value);
	assert(
		node !== undefined && node !== null && typeof node === "object" && !isFluidHandle(node),
		0xc1e /* Expected a constructed node to be an object */,
	);
	return node;
}

/**
 * Returns the unqualified name of a tree value's schema (e.g. a node with schema identifier `"my.scope.MyNode"` returns `"MyNode"`).
 * @remarks If the schema is an inlined array, map, or record type, then it has no name and this function will return a string representation of the type (e.g., `"MyNode[]"` or `"Map<string, MyNode>"`).
 */
export function getFriendlyName(schema: TreeNodeSchema): string {
	if (schema.kind === NodeKind.Leaf || isNamedSchema(schema.identifier)) {
		return unqualifySchema(schema.identifier);
	}

	const childNames = Array.from(schema.childTypes, (t) => getFriendlyName(t));
	if (schema instanceof ArrayNodeSchema) {
		return childNames.length > 1 ? `(${childNames.join(" | ")})[]` : `${childNames[0]}[]`;
	}
	if (schema instanceof MapNodeSchema) {
		return childNames.length > 1
			? `Map<string, (${childNames.join(" | ")})>`
			: `Map<string, ${childNames[0]}>`;
	}
	if (schema instanceof RecordNodeSchema) {
		return childNames.length > 1
			? `Record<string, (${childNames.join(" | ")})>`
			: `Record<string, ${childNames[0]}>`;
	}
	fail("Unexpected node schema");
}

/**
 * Returns true if the schema identifier represents a named schema (object, named array, named map, or named record).
 * @remarks This does not include primitive schemas or inlined array/map/record schemas.
 */
export function isNamedSchema(schemaIdentifier: string): boolean {
	if (
		["string", "number", "boolean", "null", "handle"].includes(
			unqualifySchema(schemaIdentifier),
		)
	) {
		return false;
	}

	return /(?:Array|Map|Record)<\["(.*)"]>/.exec(schemaIdentifier) === null;
}

/**
 * Returns the unqualified, sanitized Typescript-safe name of a schema
 * Examples:
 * - `"my.scope.MyNode"` returns `"MyNode"`
 * - `"my.scope.MyNode-2"` returns `"MyNode_2"`
 * - `"my.scope.MyNode!"` returns `"MyNode_"`
 * @remarks
 * - Removes all characters before the last dot in the schema name.
 * - Sanitizes the remainder into a valid Typescript identifier
 * - If there is a dot in a user's schema name, this might produce unexpected results.
 */
export function unqualifySchema(schemaIdentifier: string): string {
	// Get the unqualified name by removing the scope (everything before the last dot).
	const matches = /[^.]+$/.exec(schemaIdentifier);
	const unqualifiedName = matches === null ? schemaIdentifier : matches[0];

	let sanitizedName = unqualifiedName;

	// Replace invalid characters with "_".
	sanitizedName = sanitizedName.replace(/[^\w$]/g, "_");

	// If the first character is a number, prefix it with "_".
	if (!/^[$A-Z_a-z]/.test(sanitizedName)) {
		sanitizedName = `_${sanitizedName}`;
	}
	return sanitizedName;
}

/**
 * Resolves short name collisions by appending counters to colliding short names.
 * @param identifiers - An array of schema identifiers to be converted to unique short names.
 * @returns A map from each identifier to its unique, collision-resolved short name
 *
 * @remarks
 * When multiple identifiers produce the same short name, the colliding identifiers get a counter appended to its name.
 * Non-colliding identifiers keep their original short name.
 * The algorithm ensures collision-resolved names don't conflict with other existing short names.
 * Example:
 * - "scope.Foo" and "scope2.Foo" resolve to "Foo_1" and "Foo_2"
 * - If "scope3.Foo_1" also exists, it stays as "Foo_1" (no collision), but the other "Foo" instances will resolve to "Foo_2" and "Foo_3" to avoid conflicts.
 */
export function resolveShortNameCollisions(identifiers: string[]): Map<string, string> {
	const shortNameToIdentifiers = new Map<string, string[]>();
	const allShortNames = new Set<string>();

	// Populate the map of short names to their corresponding identifiers
	for (const identifier of identifiers) {
		const shortName = unqualifySchema(identifier);
		allShortNames.add(shortName);
		if (shortNameToIdentifiers.has(shortName) === false) {
			shortNameToIdentifiers.set(shortName, []);
		}
		const identifierList = shortNameToIdentifiers.get(shortName);
		if (identifierList !== undefined) {
			identifierList.push(identifier);
		}
	}

	// Append and underscore and counter to colliding short names.
	const result = new Map<string, string>();
	for (const [shortName, identifierList] of shortNameToIdentifiers) {
		if (identifierList.length === 1) {
			// No collision, unchanged short name.
			for (const identifier of identifierList) {
				result.set(identifier, shortName);
			}
		} else {
			// Collision, append counters to conflicting short names
			let counter = 1;
			for (const identifier of identifierList) {
				let candidateName = `${shortName}_${counter}`;
				while (allShortNames.has(candidateName) && candidateName !== shortName) {
					counter += 1;
					candidateName = `${shortName}_${counter}`;
				}
				result.set(identifier, candidateName);
				counter += 1;
			}
		}
	}

	return result;
}

/**
 * Converts a TreeNodeSchema set to an array of their identifiers.
 */
export function schemaSetToIdentifiers(schemas: Set<TreeNodeSchema>): string[] {
	return Array.from(schemas, (s) => s.identifier);
}

/**
 * Adds all (optionally filtered) schemas reachable from the given schema to the given set.
 * @returns The set of schemas added (same as the `schemas` parameter, if supplied).
 */
export function findSchemas(
	schema: ImplicitFieldSchema,
	filter: (schema: TreeNodeSchema) => boolean = () => true,
	schemas = new Set<TreeNodeSchema>(),
): Set<TreeNodeSchema> {
	for (const nodeSchema of normalizeFieldSchema(schema).allowedTypeSet) {
		if (!schemas.has(nodeSchema)) {
			if (filter(nodeSchema)) {
				schemas.add(nodeSchema);
			}
			findSchemas([...nodeSchema.childTypes], filter, schemas);
		}
	}
	return schemas;
}

/**
 * De-capitalize (the first letter of) a string.
 */
export function communize(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Stringify an unknown error value
 */
export function toErrorString(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
