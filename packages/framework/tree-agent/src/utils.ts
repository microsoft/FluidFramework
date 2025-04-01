/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	Tree,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
} from "@fluidframework/tree";
import type {
	InsertableContent,
	InternalTreeNode,
	TreeNode,
	TreeNodeSchema,
	TreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/alpha";

import { objectIdKey } from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";

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
 * @alpha
 */
export type TreeView<TRoot extends ImplicitFieldSchema> = Pick<
	TreeViewAlpha<TRoot>,
	"root" | "fork" | "merge" | "schema"
>;

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
	// TODO:#34138: Until this bug is fixed, we need to use the constructor kludge.
	// TODO:#34139: Until this bug is fixed, we need to use the constructor kludge.
	// return (
	// 	TreeAlpha.create<UnsafeUnknownSchema>(schema, value) ?? fail("Expected node to be created")
	// );

	return typeof schema === "function"
		? new schema(value as unknown as InternalTreeNode)
		: (schema as { create(data: InsertableContent): TreeNode }).create(value);
}

/**
 * TODO
 */
export function stringifyWithIds(
	root: TreeFieldFromImplicitField<ImplicitFieldSchema>,
	idGenerator: IdGenerator,
): {
	stringified: string;
	objectsWithIds: {
		type: string;
		id: string;
	}[];
} {
	idGenerator.assignIds(root);
	const objectsWithIds: ReturnType<typeof stringifyWithIds>["objectsWithIds"] = [];
	const stringified: string = JSON.stringify(
		root,
		(_, value) => {
			if (typeof value === "object" && !Array.isArray(value) && value !== null) {
				// TODO: SharedTree Team needs to either publish TreeNode as a class to use .instanceof() or a typeguard.
				// Uncomment this assertion back once we have a typeguard ready.
				// assert(isTreeNode(node), "Non-TreeNode value in tree.");
				const id =
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					idGenerator.getId(value) ?? fail("ID of new node should have been assigned.");
				assert(
					!Object.prototype.hasOwnProperty.call(value, objectIdKey),
					0xa7b /* Collision of object id property. */,
				);
				const type =
					getFriendlySchemaName(Tree.schema(value as TreeNode).identifier) ??
					fail("Expected object schema to have a friendly name.");
				objectsWithIds.push({ id, type });
				return {
					[objectIdKey]: id,
					...value,
				} as unknown;
			}
			return value as unknown;
		},
		2,
	);
	return {
		stringified,
		objectsWithIds,
	};
}

/**
 * TODO
 * @remarks Returns undefined if the schema should not be included in the prompt (and therefore should not ever be seen by the LLM).
 */
export function getFriendlySchemaName(schemaName: string): string | undefined {
	// TODO: Kludge
	const arrayTypes = schemaName.match(/Array<\["(.*)"]>/);
	if (arrayTypes?.[1] !== undefined) {
		return undefined;
	}

	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
	}
	return matches[0];
}
