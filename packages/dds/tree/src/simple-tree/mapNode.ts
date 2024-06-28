/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNodeSchemaIdentifier } from "../core/index.js";
import {
	type FlexMapNodeSchema,
	type FlexTreeNode,
	type MapTreeNode,
	cursorForMapTreeNode,
	getOrCreateMapTreeNode,
	getSchemaAndPolicy,
	isMapTreeNode,
} from "../feature-libraries/index.js";
import {
	type InsertableContent,
	getProxyForField,
	markContentType,
	prepareContentForHydration,
} from "./proxies.js";
import { getFlexNode } from "./proxyBinding.js";
import { getSimpleNodeSchema } from "./schemaCaching.js";
import {
	NodeKind,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeSchemaClass,
	type WithType,
	type TreeNodeSchema,
	type TreeNodeFromImplicitAllowedTypes,
	typeNameSymbol,
} from "./schemaTypes.js";
import { mapTreeFromNodeData } from "./toMapTree.js";
import { type TreeNode, TreeNodeValid } from "./types.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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

const handler: ProxyHandler<TreeMapNode> = {
	getPrototypeOf: () => {
		return Map.prototype;
	},
};

abstract class CustomMapNodeBase<const T extends ImplicitAllowedTypes> extends TreeNodeValid<
	Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>
> {
	public static readonly kind = NodeKind.Map;

	public [Symbol.iterator](): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]> {
		return this.entries();
	}
	public delete(key: string): void {
		const node = getFlexNode(this);
		if (isMapTreeNode(node)) {
			throw new UsageError(`A map cannot be mutated before being inserted into the tree`);
		}

		node.delete(key);
	}
	public *entries(): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]> {
		const node = getFlexNode(this);
		for (const key of node.keys()) {
			yield [key, getProxyForField(node.getBoxed(key)) as TreeNodeFromImplicitAllowedTypes<T>];
		}
	}
	public get(key: string): TreeNodeFromImplicitAllowedTypes<T> {
		const node = getFlexNode(this);
		const field = node.getBoxed(key);
		return getProxyForField(field) as TreeNodeFromImplicitAllowedTypes<T>;
	}
	public has(key: string): boolean {
		const node = getFlexNode(this);
		return node.has(key);
	}
	public keys(): IterableIterator<string> {
		const node = getFlexNode(this);
		return node.keys();
	}
	public set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypes<T>): TreeMapNode {
		const node = getFlexNode(this);
		if (isMapTreeNode(node)) {
			throw new UsageError(`A map cannot be mutated before being inserted into the tree`);
		}

		const classSchema = getSimpleNodeSchema(node.schema);
		const mapTree = mapTreeFromNodeData(
			value as InsertableContent,
			classSchema.info as ImplicitAllowedTypes,
			node.context.nodeKeyManager,
			getSchemaAndPolicy(node),
		);

		prepareContentForHydration(mapTree, node.context.checkout.forest);
		const cursor = mapTree !== undefined ? cursorForMapTreeNode(mapTree) : undefined;
		node.set(key, cursor);
		return this;
	}
	public get size(): number {
		return getFlexNode(this).size;
	}
	public *values(): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>> {
		for (const [, value] of this.entries()) {
			yield value;
		}
	}
	public forEach<TThis extends TreeMapNode<T>>(
		this: TThis,
		callbackFn: (value: TreeNodeFromImplicitAllowedTypes<T>, key: string, map: TThis) => void,
		thisArg?: unknown,
	): void {
		for (const field of getFlexNode(this).boxedIterator()) {
			const node = getProxyForField(field) as TreeNodeFromImplicitAllowedTypes<T>;
			callbackFn.call(thisArg, node, field.key, this);
		}
	}
	// TODO: add `clear` once we have established merge semantics for it.
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
 *
 * @param base - base schema type to extend.
 * @param useMapPrototype - should this type emulate a ES6 Map object (by faking its prototype with a proxy).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapSchema<
	TName extends string,
	const T extends ImplicitAllowedTypes,
	const ImplicitlyConstructable extends boolean,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	useMapPrototype: boolean,
) {
	let flexSchema: FlexMapNodeSchema;

	class schema extends CustomMapNodeBase<T> implements TreeMapNode<T> {
		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			if (useMapPrototype) {
				return new Proxy<schema>(instance as schema, handler);
			}
			return instance;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): MapTreeNode {
			return getOrCreateMapTreeNode(
				flexSchema,
				mapTreeFromNodeData(
					copyContent(flexSchema.name, input as Iterable<[string, InsertableContent]>),
					this as unknown as ImplicitAllowedTypes,
				),
			);
		}

		protected static override constructorCached: typeof TreeNodeValid | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): void {
			flexSchema = getFlexSchema(this as unknown as TreeNodeSchema) as FlexMapNodeSchema;
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: ImplicitlyConstructable =
			implicitlyConstructable;

		public get [typeNameSymbol](): TName {
			return identifier;
		}
	}
	const schemaErased: TreeNodeSchemaClass<
		TName,
		NodeKind.Map,
		TreeMapNode<T> & WithType<TName>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		ImplicitlyConstructable,
		T
	> = schema;
	return schemaErased;
}

function copyContent<T>(
	typeName: TreeNodeSchemaIdentifier,
	content: Iterable<[string, T]>,
): Map<string, T> {
	const copy = new Map(content);
	markContentType(typeName, copy);
	return copy;
}
