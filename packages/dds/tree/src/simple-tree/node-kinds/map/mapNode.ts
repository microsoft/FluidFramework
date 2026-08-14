/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidReadonlyMap } from "@fluidframework/core-interfaces/internal";
import { assert, Lazy } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { MapNodeStoredSchema } from "../../../core/index.js";
import {
	isTreeValue,
	type FlexibleNodeContent,
	type FlexTreeNode,
	type FlexTreeOptionalField,
	type OptionalFieldEditBuilder,
} from "../../../feature-libraries/index.js";
import {
	brand,
	count,
	isReadonlyArray,
	type JsonCompatibleReadOnlyObject,
	type RestrictiveStringRecord,
} from "../../../util/index.js";
import type {
	NodeSchemaOptionsAlpha,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Referenced by TSDoc {@link} in this file.
	RunTransactionParamsAlpha,
} from "../../api/index.js";
import {
	CompatibilityLevel,
	getKernel,
	type InnerNode,
	NodeKind,
	type TreeNodeSchema,
	// eslint-disable-next-line import-x/no-deprecated -- Required to implement the deprecated typeNameSymbol API.
	typeNameSymbol,
	type TreeNode,
	typeSchemaSymbol,
	getInnerNode,
	type InternalTreeNode,
	type UnhydratedFlexTreeNode,
	normalizeAllowedTypes,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeSchemaMetadata,
	type TreeNodeFromImplicitAllowedTypes,
	TreeNodeValid,
	type MostDerivedData,
	type TreeNodeSchemaInitializedData,
	type TreeNodeSchemaCorePrivate,
	privateDataSymbol,
	createTreeNodeSchemaPrivateData,
	type FlexContent,
	type TreeNodeSchemaPrivateData,
	AnnotatedAllowedTypesInternal,
} from "../../core/index.js";
import { getTreeNodeSchemaInitializedData } from "../../createContext.js";
import { createFieldSchema, FieldKind } from "../../fieldSchema.js";
import { tryGetTreeNodeForField } from "../../getTreeNodeForField.js";
import { prepareForInsertion } from "../../prepareForInsertion.js";
import type { SchemaType, SimpleAllowedTypeAttributes } from "../../simpleSchema.js";
import {
	unhydratedFlexTreeFromInsertable,
	type FactoryContent,
	type InsertableContent,
} from "../../unhydratedFlexTreeFromInsertable.js";
import { recordLikeDataToFlexContent } from "../common.js";

import type {
	MapNodeCustomizableSchema,
	MapNodePojoEmulationSchema,
	MapNodeSchema,
} from "./mapNodeTypes.js";

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 * @sealed @public
 */
export interface TreeMapNode<T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>,
		TreeNode {
	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to `undefined` is equivalent to calling {@link TreeMapNode.delete} with that key.
	 */
	set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypes<T> | undefined): void;

	/**
	 * Removes the specified element from this map by its `key`.
	 *
	 * @remarks
	 * Note: unlike JavaScript's Map API, this method does not return a flag indicating whether or not the value was
	 * deleted.
	 *
	 * @privateRemarks
	 * Regarding the choice to not return a boolean: Since this data structure is distributed in nature, it isn't
	 * possible to tell whether or not the item was deleted as a result of this method call. Returning a "best guess"
	 * is more likely to create issues / promote bad usage patterns than offer useful information.
	 *
	 * @param key - The key of the element to remove from the map.
	 */
	delete(key: string): void;

	/**
	 * Returns an iterable of keys in the map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order of the keys returned.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	keys(): IterableIterator<string>;

	/**
	 * Returns an iterable of values in the map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order of the values returned.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	values(): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order of the entries returned.
	 * If your usage scenario depends on consistent ordering, you will need to sort these yourself.
	 */
	entries(): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]>;

	/**
	 * Executes the provided function once per each key/value pair in this map.
	 *
	 * @remarks
	 * Note: no guarantees are made regarding the order in which the function is called with respect to the map's entries.
	 * If your usage scenario depends on consistent ordering, you will need to account for this.
	 */
	forEach(
		callbackfn: (
			value: TreeNodeFromImplicitAllowedTypes<T>,
			key: string,
			map: ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>,
		) => void,
		// Typing inherited from `ReadonlyMap`.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): void;
}

/**
 * {@link TreeMapNode} with FluidReadonlyMap-based iteration.
 *
 * @remarks
 * This is the same as {@link TreeMapNode} except that it extends FluidReadonlyMap
 * instead of the built-in `ReadonlyMap`, insulating against breaking changes
 * in TypeScript's standard library iterator types.
 *
 * @sealed @alpha
 */
export interface TreeMapNodeAlpha<T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends FluidReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>,
		TreeNode,
		Pick<TreeMapNode<T>, "set" | "delete"> {
	/**
	 * Removes all elements from the map.
	 * @remarks
	 * The merge semantics of this operation are loosely specified. Either of the following may occur:
	 *
	 * - `clear` may remove all elements that were in the map when the edit was authored,
	 * even if some of those elements have since been moved elsewhere in the tree
	 * (in which case they are removed from their new location).
	 *
	 * - `clear` may remove all elements that are in the map when the edit is sequenced,
	 * even if some of those elements were not yet in the map when the edit was authored.
	 */
	clear(): void;
	/**
	 * Returns the value at `key`, first inserting `fallbackValue` if this map has no entry for `key`.
	 *
	 * @param key - The key of the element to return or insert at.
	 * @param fallbackValue - The value to insert if `key` has no entry.
	 * @returns The value at `key`, which may be the provided `fallbackValue`
	 * if the map had no previous entry for `key`.
	 *
	 * @remarks
	 * The check for the presence of an existing entry with the given `key` is performed at the time the edit is authored.
	 * This has implications for the merge semantics of this operation:
	 *
	 * - If no entry is present for `key` at authoring time (thus leading to an insert)
	 * while a peer concurrently inserts a value for the same `key`,
	 * then the two inserts will race and the one that is sequenced second will overwrite the value inserted by the one
	 * that is sequenced first.
	 *
	 * - If an entry is present for `key` at authoring time (thus leading to no insert)
	 * while a peer concurrently deletes the entry for `key`,
	 * then the map will end up with no entry for `key` no matter how the two edits are sequenced.
	 *
	 * - If an entry is present for `key` at authoring time (thus leading to no insert)
	 * while a peer concurrently inserts a new entry for `key`,
	 * then the map will end up with the entry set by the peer no matter how the two edits are sequenced.
	 *
	 * These last two points mean that, upon sequencing of an edit made with this API,
	 * there is no guarantee that the entry for the given key will be the current one (if any) or the fallback one.
	 * If such a guarantee is important, then consider using {@link RunTransactionParamsAlpha.preconditions}
	 * to ensure the edit only applies when appropriate.
	 *
	 * This API is **not** equivalent to the following alternative:
	 *
	 * ```typescript
	 * map.set(key, map.get(key) ?? fallbackValue);
	 * ```
	 *
	 * They differ in the following ways:
	 *
	 * - This API treats entries containing `null` values as populated.
	 * By contrast, the above alternative's usage of `??` means that a `null` entry is treated as equivalent to a missing entry.
	 *
	 * - This API only inserts/sets the entry for the given `key` when there is no current one.
	 * By contrast, the above alternative always performs an insert.
	 * That insert will throw an error for non-leaf types (objects, maps, arrays, and records) in cases where the entry
	 * is already populated, because inserting a node that was already inserted is not supported.
	 * It will always succeed for leaf types (number, string, boolean, null, and handle) since a new node is created
	 * from the value.
	 * Note that even in the cases where it does not throw,
	 * the `set` operation has the potential to overwrite entries that are concurrently inserted even when the map had
	 * an entry for `key`, which is not the case with this API.
	 *
	 * Avoid using this API to write a default value into the document when the application could instead return that
	 * default when reading a missing entry, which is much less costly.
	 * A more appropriate use of this API is when the value to be optionally inserted varies with the key.
	 */
	getOrInsert(
		key: string,
		fallbackValue: InsertableTreeNodeFromImplicitAllowedTypes<T>,
	): TreeNodeFromImplicitAllowedTypes<T>;

	/**
	 * Returns the value at `key`, first inserting the value produced by `callback` if this map has no entry for `key`.
	 *
	 * @param key - The key of the element to return or insert at.
	 * @param callback - Invoked with `key` to produce the value to insert if `key` has no entry.
	 * Not invoked if an entry is present.
	 * @returns The value at `key`, which may be the value produced by `callback`
	 * if the map had no previous entry for `key`.
	 *
	 * @remarks
	 * This API is equivalent to {@link TreeMapNodeAlpha.getOrInsert} except that the fallback value is computed lazily:
	 * `callback` is only invoked when the map has no entry for `key`.
	 * Prefer this API over {@link TreeMapNodeAlpha.getOrInsert} when producing the fallback value is expensive.
	 *
	 * The check for the presence of an existing entry with the given `key` is performed at the time the edit is authored.
	 * See {@link TreeMapNodeAlpha.getOrInsert} for the implications this has on the merge semantics of this operation.
	 *
	 * If `callback` throws, no edit is made and the error is propagated to the caller.
	 * If `callback` sets an entry for `key` in this map, that entry is overwritten with the value `callback` returned.
	 */
	getOrInsertComputed(
		key: string,
		callback: (key: string) => InsertableTreeNodeFromImplicitAllowedTypes<T>,
	): TreeNodeFromImplicitAllowedTypes<T>;
}

// TreeMapNode is invariant over schema type, so for this handler to work with all schema, the only possible type for the schema is `any`.
// This is not ideal, but no alternatives are possible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler: ProxyHandler<TreeMapNodeAlpha<any>> = {
	getPrototypeOf: () => {
		return Map.prototype;
	},
	get: (target, key, receiver) => {
		const value = Reflect.get(target, key, receiver) as unknown;
		if (value !== undefined) {
			return value;
		}
		// If the property is a function on Map.prototype but not on the target,
		// return a function that throws a descriptive TypeError when called.
		if (
			typeof key === "string" &&
			!(key in target) &&
			key in Map.prototype &&
			typeof (Map.prototype as unknown as Record<string, unknown>)[key] === "function"
		) {
			return () => {
				throw new TypeError(
					`MapNode does not support '${key}'. Use the MapNode API (e.g., set, get, delete, keys, values, entries).`,
				);
			};
		}
		return value;
	},
};

abstract class CustomMapNodeBase<const T extends ImplicitAllowedTypes> extends TreeNodeValid<
	MapNodeInsertableData<T>
> {
	public static readonly kind = NodeKind.Map;

	public constructor(input?: InternalTreeNode | MapNodeInsertableData<T> | undefined) {
		super(input ?? []);
	}

	public [Symbol.iterator](): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]> {
		return this.entries();
	}

	private get innerNode(): InnerNode {
		return getInnerNode(this);
	}

	private editor(key: string): OptionalFieldEditBuilder<FlexibleNodeContent> {
		const field = this.innerNode.getBoxed(brand(key)) as FlexTreeOptionalField;
		return field.editor;
	}

	public delete(key: string): void {
		const field = this.innerNode.getBoxed(brand(key));
		this.editor(key).set(undefined, field.length === 0);
	}
	public *entries(): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]> {
		const node = this.innerNode;
		for (const key of node.keys()) {
			yield [
				key,
				tryGetTreeNodeForField(node.getBoxed(key)) as TreeNodeFromImplicitAllowedTypes<T>,
			];
		}
	}
	public get(key: string): TreeNodeFromImplicitAllowedTypes<T> {
		const node = this.innerNode;
		const field = node.getBoxed(brand(key));
		return tryGetTreeNodeForField(field) as TreeNodeFromImplicitAllowedTypes<T>;
	}
	public has(key: string): boolean {
		return this.innerNode.tryGetField(brand(key)) !== undefined;
	}
	public *keys(): IterableIterator<string> {
		const node = this.innerNode;
		yield* node.keys();
	}
	public set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypes<T>): this {
		const kernel = getKernel(this);
		const node = this.innerNode;
		const innerSchema = this.innerNode.context.schema.nodeSchema.get(
			brand(kernel.schema.identifier),
		);
		assert(
			innerSchema instanceof MapNodeStoredSchema,
			0xc17 /* Expected MapNodeStoredSchema */,
		);

		const mapTree = prepareForInsertion(
			value as InsertableContent | undefined,
			createFieldSchema(FieldKind.Optional, kernel.schema.info as ImplicitAllowedTypes),
			node.context,
			innerSchema.mapFields,
		);

		const field = node.getBoxed(brand(key));

		this.editor(key).set(mapTree, field.length === 0);
		return this;
	}
	public getOrInsert(
		key: string,
		fallbackValue: InsertableTreeNodeFromImplicitAllowedTypes<T>,
	): TreeNodeFromImplicitAllowedTypes<T> {
		const existing = this.get(key);
		if (existing !== undefined) {
			return existing;
		}
		this.set(key, fallbackValue);
		return this.get(key);
	}
	public getOrInsertComputed(
		key: string,
		callback: (key: string) => InsertableTreeNodeFromImplicitAllowedTypes<T>,
	): TreeNodeFromImplicitAllowedTypes<T> {
		const existing = this.get(key);
		if (existing !== undefined) {
			return existing;
		}
		this.set(key, callback(key));
		return this.get(key);
	}
	public get size(): number {
		return count(this.innerNode.keys());
	}
	public *values(): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>> {
		for (const [, value] of this.entries()) {
			yield value;
		}
	}
	public forEach<TThis extends TreeMapNodeAlpha<T>>(
		this: TThis,
		callbackFn: (value: TreeNodeFromImplicitAllowedTypes<T>, key: string, map: TThis) => void,
		thisArg?: unknown,
	): void {
		for (const field of getInnerNode(this)) {
			const node = tryGetTreeNodeForField(field) as TreeNodeFromImplicitAllowedTypes<T>;
			callbackFn.call(thisArg, node, field.key, this);
		}
	}
	public clear(): void {
		const node = this.innerNode;
		const transaction = node.isHydrated() ? node.context.checkout.transaction : undefined;
		transaction?.start();
		for (const key of [...node.keys()]) {
			this.delete(key);
		}
		transaction?.commit();
	}
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
 *
 * @param base - base schema type to extend.
 * @param useMapPrototype - should this type emulate a ES6 Map object (by faking its prototype with a proxy).
 * @param persistedMetadata - Optional persisted metadata for the object node schema.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapSchema<
	TName extends string,
	const T extends ImplicitAllowedTypes,
	const ImplicitlyConstructable extends boolean,
	const TCustomMetadata = unknown,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	useMapPrototype: boolean,
	nodeOptions: NodeSchemaOptionsAlpha<TCustomMetadata> = {},
) {
	const normalizedTypes = normalizeAllowedTypes(info);
	const lazyAllowedTypesIdentifiers = new Lazy(
		() => new Set(normalizedTypes.evaluate().map((type) => type.identifier)),
	);
	const lazySimpleAllowedTypes = new Lazy(() => {
		return AnnotatedAllowedTypesInternal.evaluateSimpleAllowedTypes(normalizedTypes);
	});

	let privateData: TreeNodeSchemaPrivateData | undefined;
	const persistedMetadata = nodeOptions.persistedMetadata;

	class Schema extends CustomMapNodeBase<T> implements TreeMapNodeAlpha<T> {
		public readonly [Symbol.toStringTag] = "TreeMapNodeSchema";
		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			if (useMapPrototype) {
				return new Proxy<Schema>(instance as Schema, handler as ProxyHandler<Schema>);
			}
			return instance;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): UnhydratedFlexTreeNode {
			return unhydratedFlexTreeFromInsertable(input as FactoryContent, this as typeof Schema);
		}

		public static get allowedTypesIdentifiers(): ReadonlySet<string> {
			return lazyAllowedTypesIdentifiers.value;
		}

		public static get simpleAllowedTypes(): ReadonlyMap<
			string,
			SimpleAllowedTypeAttributes<SchemaType.View>
		> {
			return lazySimpleAllowedTypes.value;
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

		protected static override oneTimeSetup(): TreeNodeSchemaInitializedData {
			const schema = this as MapNodeSchema;
			return getTreeNodeSchemaInitializedData(this, {
				shallowCompatibilityTest,
				toFlexContent: (data: FactoryContent): FlexContent => mapToFlexContent(data, schema),
			});
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: ImplicitlyConstructable =
			implicitlyConstructable;
		public static get childTypes(): ReadonlySet<TreeNodeSchema> {
			return normalizedTypes.evaluateSet();
		}
		public static readonly metadata: NodeSchemaMetadata<TCustomMetadata> =
			nodeOptions.metadata ?? {};
		public static readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined =
			persistedMetadata;

		// eslint-disable-next-line import-x/no-deprecated -- Required to implement the deprecated typeNameSymbol API.
		public get [typeNameSymbol](): TName {
			return identifier;
		}
		public get [typeSchemaSymbol](): typeof schemaErased {
			return Schema.constructorCached?.constructor as unknown as typeof schemaErased;
		}

		public static get [privateDataSymbol](): TreeNodeSchemaPrivateData {
			return (privateData ??= createTreeNodeSchemaPrivateData(this, [normalizedTypes]));
		}
	}
	const schemaErased: MapNodeCustomizableSchema<
		TName,
		T,
		ImplicitlyConstructable,
		TCustomMetadata
	> &
		MapNodePojoEmulationSchema<TName, T, ImplicitlyConstructable, TCustomMetadata> &
		TreeNodeSchemaCorePrivate = Schema;
	return schemaErased;
}

/**
 * Content which can be used to construct a Map node, explicitly or implicitly.
 * @system @public
 */
export type MapNodeInsertableData<T extends ImplicitAllowedTypes> =
	| Iterable<readonly [string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>
	| RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypes<T>>;

/**
 * {@link TreeNodeSchemaInitializedData.shallowCompatibilityTest} for Map nodes.
 */
function shallowCompatibilityTest(data: FactoryContent): CompatibilityLevel {
	if (isTreeValue(data)) {
		return CompatibilityLevel.None;
	}

	if (isReadonlyArray(data)) {
		// Arrays are iterable, so type checking does allow constructing a MapNode from an array if the array's type is key values pairs for the map.
		return CompatibilityLevel.Low;
	}

	if (Symbol.iterator in data) {
		return CompatibilityLevel.Normal;
	}

	// When not unioned with an ObjectNode, allow objects to be used to create maps.
	return CompatibilityLevel.Low;
}

/**
 * {@link TreeNodeSchemaInitializedData.toFlexContent} for Map nodes.
 *
 * Transforms data under a Map schema.
 * @param data - The tree data to be transformed. Must be an iterable or Record like object.
 * @param schema - The schema to comply with.
 */
function mapToFlexContent(data: FactoryContent, schema: MapNodeSchema): FlexContent {
	if (!(typeof data === "object" && data !== null)) {
		throw new UsageError(`Input data is incompatible with Map schema: ${data}`);
	}

	const fieldsIterator = (
		Symbol.iterator in data
			? // Support iterables of key value pairs (including Map objects)
				data
			: // Support record objects for JSON style Map data
				Object.entries(data)
	) as Iterable<readonly [string, InsertableContent]>;

	return recordLikeDataToFlexContent(fieldsIterator, schema);
}
