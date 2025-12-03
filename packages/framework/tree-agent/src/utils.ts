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
 * Returns the unqualified name of a schema (e.g. `"my.scope.MyNode"` returns `"MyNode"`).
 * @remarks This works by removing all characters before the last dot in the schema name.
 * If there is a dot in a user's schema name, this might produce unexpected results.
 */
export function unqualifySchema(schemaIdentifier: string): string {
	// Get the unqualified name by removing the scope (everything before the last dot).
	const matches = /[^.]+$/.exec(schemaIdentifier);
	if (matches === null) {
		return schemaIdentifier; // Return the original name if it is unscoped.
	}
	return matches[0];
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
