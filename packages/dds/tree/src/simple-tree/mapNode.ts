/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lazy } from "@fluidframework/core-utils/internal";
import {
	type FlexTreeNode,
	type FlexTreeOptionalField,
	type OptionalFieldEditBuilder,
	getSchemaAndPolicy,
} from "../feature-libraries/index.js";
import { getTreeNodeForField, prepareContentForHydration } from "./proxies.js";
import {
	createFieldSchema,
	FieldKind,
	normalizeAllowedTypes,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeSchemaMetadata,
	type TreeNodeFromImplicitAllowedTypes,
} from "./schemaTypes.js";
import {
	getKernel,
	type InnerNode,
	NodeKind,
	type TreeNodeSchemaBoth,
	type TreeNodeSchema,
	type WithType,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	type TreeNode,
	typeSchemaSymbol,
	type Context,
	UnhydratedFlexTreeNode,
	getOrCreateInnerNode,
	type InternalTreeNode,
} from "./core/index.js";
import {
	mapTreeFromNodeData,
	type FactoryContent,
	type InsertableContent,
} from "./toMapTree.js";
import { brand, count, type RestrictiveStringRecord } from "../util/index.js";
import { TreeNodeValid, type MostDerivedData } from "./treeNodeValid.js";
import type { ExclusiveMapTree } from "../core/index.js";
import { getUnhydratedContext } from "./createContext.js";

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

// TreeMapNode is invariant over schema type, so for this handler to work with all schema, the only possible type for the schema is `any`.
// This is not ideal, but no alternatives are possible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler: ProxyHandler<TreeMapNode<any>> = {
	getPrototypeOf: () => {
		return Map.prototype;
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
		return getOrCreateInnerNode(this);
	}

	private editor(key: string): OptionalFieldEditBuilder<ExclusiveMapTree> {
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
				getTreeNodeForField(node.getBoxed(key)) as TreeNodeFromImplicitAllowedTypes<T>,
			];
		}
	}
	public get(key: string): TreeNodeFromImplicitAllowedTypes<T> {
		const node = this.innerNode;
		const field = node.getBoxed(brand(key));
		return getTreeNodeForField(field) as TreeNodeFromImplicitAllowedTypes<T>;
	}
	public has(key: string): boolean {
		return this.innerNode.tryGetField(brand(key)) !== undefined;
	}
	public keys(): IterableIterator<string> {
		const node = this.innerNode;
		return node.keys();
	}
	public set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypes<T>): this {
		const kernel = getKernel(this);
		const node = this.innerNode;
		const mapTree = mapTreeFromNodeData(
			value as InsertableContent | undefined,
			createFieldSchema(FieldKind.Optional, kernel.schema.info as ImplicitAllowedTypes),
			node.context.isHydrated() ? node.context.nodeKeyManager : undefined,
			getSchemaAndPolicy(node),
		);

		const field = node.getBoxed(brand(key));
		if (node.context.isHydrated()) {
			prepareContentForHydration(mapTree, node.context.checkout.forest);
		}

		this.editor(key).set(mapTree, field.length === 0);
		return this;
	}
	public get size(): number {
		return count(this.innerNode.keys());
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
		for (const field of getOrCreateInnerNode(this).boxedIterator()) {
			const node = getTreeNodeForField(field) as TreeNodeFromImplicitAllowedTypes<T>;
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
	const TCustomMetadata = unknown,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	useMapPrototype: boolean,
	metadata?: NodeSchemaMetadata<TCustomMetadata>,
) {
	const lazyChildTypes = new Lazy(() => normalizeAllowedTypes(info));

	let unhydratedContext: Context;

	class Schema extends CustomMapNodeBase<T> implements TreeMapNode<T> {
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
			return UnhydratedFlexTreeNode.getOrCreate(
				unhydratedContext,
				mapTreeFromNodeData(input as FactoryContent, this as unknown as ImplicitAllowedTypes),
			);
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
			const schema = this as unknown as TreeNodeSchema;
			unhydratedContext = getUnhydratedContext(schema);
			return unhydratedContext;
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: ImplicitlyConstructable =
			implicitlyConstructable;
		public static get childTypes(): ReadonlySet<TreeNodeSchema> {
			return lazyChildTypes.value;
		}
		public static readonly metadata: NodeSchemaMetadata<TCustomMetadata> | undefined =
			metadata;

		// eslint-disable-next-line import/no-deprecated
		public get [typeNameSymbol](): TName {
			return identifier;
		}
		public get [typeSchemaSymbol](): typeof schemaErased {
			return Schema.constructorCached?.constructor as unknown as typeof schemaErased;
		}
	}
	const schemaErased: TreeNodeSchemaBoth<
		TName,
		NodeKind.Map,
		TreeMapNode<T> & WithType<TName, NodeKind.Map>,
		MapNodeInsertableData<T>,
		ImplicitlyConstructable,
		T,
		undefined,
		TCustomMetadata
	> = Schema;
	return schemaErased;
}

/**
 * Content which can be used to construct a Map node, explicitly or implicitly.
 * @system @public
 */
export type MapNodeInsertableData<T extends ImplicitAllowedTypes> =
	| Iterable<readonly [string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>
	| RestrictiveStringRecord<InsertableTreeNodeFromImplicitAllowedTypes<T>>;
