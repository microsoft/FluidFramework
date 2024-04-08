/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { FieldKey, TreeNodeSchemaIdentifier } from "../core/index.js";
import {
	FlexMapNodeSchema,
	FlexTreeMapNode,
	FlexTreeNode,
	FlexTreeTypedField,
	FlexTreeUnboxField,
	FlexibleFieldContent,
	isFlexTreeNode,
} from "../feature-libraries/index.js";
import {
	InsertableContent,
	getProxyForField,
	markContentType,
	prepareContentForInsert,
} from "./proxies.js";
import { getFlexNode, setFlexNode } from "./proxyBinding.js";
import { getSimpleNodeSchema } from "./schemaCaching.js";
import {
	NodeKind,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	TreeNodeSchemaClass,
	WithType,
	TreeNodeSchema,
	InsertableTypedNode,
	TreeNodeFromImplicitAllowedTypes,
} from "./schemaTypes.js";
import { cursorFromNodeData } from "./toMapTree.js";
import { TreeNode } from "./types.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { RawTreeNode, nodeContent, rawError } from "./rawNode.js";

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 * @public
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
}

// #region Create dispatch map for maps

export const mapStaticDispatchMap: PropertyDescriptorMap = {
	[Symbol.iterator]: {
		value(this: TreeMapNode) {
			return this.entries();
		},
	},
	delete: {
		value(this: TreeMapNode, key: string): void {
			const node = getFlexNode(this);
			node.delete(key);
		},
	},
	entries: {
		*value(this: TreeMapNode): IterableIterator<[string, unknown]> {
			const node = getFlexNode(this);
			for (const key of node.keys()) {
				yield [key, getProxyForField(node.getBoxed(key))];
			}
		},
	},
	get: {
		value(this: TreeMapNode, key: string): unknown {
			const node = getFlexNode(this);
			const field = node.getBoxed(key);
			return getProxyForField(field);
		},
	},
	has: {
		value(this: TreeMapNode, key: string): boolean {
			const node = getFlexNode(this);
			return node.has(key);
		},
	},
	keys: {
		value(this: TreeMapNode): IterableIterator<string> {
			const node = getFlexNode(this);
			return node.keys();
		},
	},
	set: {
		value(
			this: TreeMapNode,
			key: string,
			value: InsertableTypedNode<TreeNodeSchema>,
		): TreeMapNode {
			const node = getFlexNode(this);
			const content = prepareContentForInsert(
				value as InsertableContent,
				node.context.forest,
			);

			const classSchema = getSimpleNodeSchema(node.schema);
			const cursor = cursorFromNodeData(content, classSchema.info as ImplicitAllowedTypes);

			node.set(key, cursor);
			return this;
		},
	},
	size: {
		get(this: TreeMapNode) {
			return getFlexNode(this).size;
		},
	},
	values: {
		*value(this: TreeMapNode): IterableIterator<unknown> {
			for (const [, value] of this.entries()) {
				yield value;
			}
		},
	},
	forEach: {
		value(
			this: TreeMapNode,
			callbackFn: (value: unknown, key: string, map: ReadonlyMap<string, unknown>) => void,
			thisArg?: any,
		): void {
			if (thisArg === undefined) {
				// We can't pass `callbackFn` to `FlexTreeMapNode` directly, or else the third argument ("map") will be a flex node instead of the proxy.
				getFlexNode(this).forEach((v, k, _) => callbackFn(v, k, this), thisArg);
			} else {
				const boundCallbackFn = callbackFn.bind(thisArg);
				getFlexNode(this).forEach((v, k, _) => boundCallbackFn(v, k, this), thisArg);
			}
		},
	},
	// TODO: add `clear` once we have established merge semantics for it.
};

const mapPrototype = Object.create(Object.prototype, mapStaticDispatchMap);

// #endregion

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `new Map()` is used for the target and a separate object created to dispatch map methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide the map functionality from {@link mapPrototype}.
 */
export function createMapProxy(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeMapNode {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	const dispatch: object =
		customTargetObject ??
		Object.create(mapPrototype, {
			// Empty - JavaScript Maps do not expose any "own" properties.
		});
	const targetObject: object = customTargetObject ?? new Map<string, TreeNode>();

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy<TreeMapNode>(targetObject as TreeMapNode, {
		get: (target, key, receiver): unknown => {
			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(dispatch, key, proxy);
		},
		getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined => {
			return Reflect.getOwnPropertyDescriptor(dispatch, key);
		},
		has: (target, key) => {
			return Reflect.has(dispatch, key);
		},
		set: (target, key, newValue): boolean => {
			return allowAdditionalProperties ? Reflect.set(dispatch, key, newValue) : false;
		},
		ownKeys: (target) => {
			// All of Map's properties are inherited via its prototype, so there is nothing to return here,
			return [];
		},
	});
	return proxy;
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
 *
 * @param name - Unique identifier for this schema including the factory's scope.
 */
export function mapSchema<
	TName extends string,
	const T extends ImplicitAllowedTypes,
	const ImplicitlyConstructable extends boolean,
>(
	base: TreeNodeSchemaClass<
		TName,
		NodeKind.Map,
		TreeNode & WithType<TName>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		ImplicitlyConstructable,
		T
	>,
	customizable: boolean,
) {
	class schema extends base {
		public constructor(
			input: Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		) {
			super(input);

			const proxyTarget = customizable ? this : undefined;

			const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
			assert(flexSchema instanceof FlexMapNodeSchema, "invalid flex schema");
			const flexNode: FlexTreeNode = isFlexTreeNode(input)
				? input
				: new RawMapNode(
						flexSchema,
						copyContent(flexSchema.name, input) as ReadonlyMap<
							string,
							InsertableContent
						>,
				  );

			const proxy: TreeNode = createMapProxy(customizable, proxyTarget);
			setFlexNode(proxy, flexNode);
			return proxy as unknown as schema;
		}
	}

	// Setup map functionality
	Object.defineProperties(schema.prototype, mapStaticDispatchMap);

	return schema as TreeNodeSchemaClass<
		TName,
		NodeKind.Map,
		TreeMapNode<T> & WithType<TName>,
		Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypes<T>]>,
		ImplicitlyConstructable,
		T
	>;
}

/**
 * The implementation of a map node created by {@link createRawNode}.
 */
export class RawMapNode<TSchema extends FlexMapNodeSchema>
	extends RawTreeNode<TSchema, ReadonlyMap<string, InsertableContent>>
	implements FlexTreeMapNode<TSchema>
{
	public get size(): number {
		return this[nodeContent].size;
	}
	public has(key: string): boolean {
		return this[nodeContent].has(key);
	}
	public get(key: string): FlexTreeUnboxField<TSchema["info"]> {
		return this[nodeContent].get(key) as FlexTreeUnboxField<TSchema["info"]>;
	}
	public keys(): IterableIterator<FieldKey> {
		return this[nodeContent].keys() as IterableIterator<FieldKey>;
	}
	public values(): IterableIterator<FlexTreeUnboxField<TSchema["info"], "notEmpty">> {
		throw rawError("Iterating map values");
	}
	public entries(): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		throw rawError("Iterating map entries");
	}
	public forEach(
		callbackFn: (
			value: FlexTreeUnboxField<TSchema["info"], "notEmpty">,
			key: FieldKey,
			map: FlexTreeMapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void {
		throw rawError("Iterating maps with forEach");
	}
	public set(key: string, value: FlexibleFieldContent<TSchema["info"]> | undefined): void {
		throw rawError("Setting a map entry");
	}
	public delete(key: string): void {
		throw rawError("Deleting a map entry");
	}

	public get asObject(): {
		readonly [P in FieldKey]?: FlexTreeUnboxField<TSchema["info"], "notEmpty">;
	} {
		throw rawError("Converting a map to an object");
	}

	public [Symbol.iterator](): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		return this.entries();
	}

	public override boxedIterator(): IterableIterator<FlexTreeTypedField<TSchema["info"]>> {
		throw rawError("Boxed iteration");
	}
}

function copyContent<T>(
	typeName: TreeNodeSchemaIdentifier,
	content: Iterable<[string, T]>,
): Map<string, T> {
	const copy = new Map(content);
	markContentType(typeName, copy);
	return copy;
}
