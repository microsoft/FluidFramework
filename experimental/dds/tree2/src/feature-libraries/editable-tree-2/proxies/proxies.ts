/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import {
	AllowedTypes,
	FieldNodeSchema,
	FieldSchema,
	StructSchema,
	TreeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
} from "../../typed-schema";
import { FieldKinds } from "../../default-field-kinds";
import {
	FieldNode,
	OptionalField,
	RequiredField,
	TreeNode,
	TypedField,
	TypedNodeUnion,
} from "../editableTreeTypes";
import { LazySequence } from "../lazyField";
import { FieldKey } from "../../../core";
import { getBoxedField } from "../lazyTree";
import { LazyEntity } from "../lazyEntity";
import { ProxyField, ProxyNode, SharedTreeList, SharedTreeObject } from "./types";

/** Symbol used to store a private/internal reference to the underlying editable tree node. */
const treeNodeSym = Symbol("TreeNode");

/** Helper to retrieve the stored tree node. */
export function getTreeNode(target: object): TreeNode {
	return (target as any)[treeNodeSym] as TreeNode;
}

/** Helper to set the stored tree node. */
export function setTreeNode(target: any, treeNode: TreeNode) {
	Object.defineProperty(target, treeNodeSym, {
		value: treeNode,
		writable: false,
		enumerable: false,
		configurable: false,
	});
}

const proxyCacheSym = Symbol("ProxyCache");

/** Cache the proxy that wraps the given tree node so that the proxy can be re-used in future reads */
function cacheProxy(
	target: TreeNode,
	proxy: SharedTreeList<AllowedTypes> | SharedTreeObject<StructSchema>,
): void {
	Object.defineProperty(target, proxyCacheSym, {
		value: proxy,
		writable: false,
		enumerable: false,
		configurable: false,
	});
}

/** If there has already been a proxy created to wrap the given tree node, return it */
function getCachedProxy(treeNode: TreeNode): ProxyNode<TreeSchema> | undefined {
	return (treeNode as unknown as { [proxyCacheSym]: ProxyNode<TreeSchema> })[proxyCacheSym];
}

/**
 * Checks if the given object is a {@link SharedTreeObject}
 * @alpha
 */
export function is<TSchema extends StructSchema>(
	x: unknown,
	schema: TSchema,
): x is SharedTreeObject<TSchema> {
	// TODO: Do this a better way. Perhaps, should `treeNodeSym` be attached to object proxies via `setTreeNode`?
	return (x as any)[treeNodeSym].schema === schema;
}

/** Retrieve the associated proxy for the given field. */
export function getProxyForField<TSchema extends FieldSchema>(
	field: TypedField<TSchema>,
): ProxyField<TSchema> {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as TypedField<FieldSchema<typeof FieldKinds.required>>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getProxyForNode(asValue.boxedContent) as ProxyField<TSchema>;
		}
		case FieldKinds.optional: {
			const asValue = field as TypedField<FieldSchema<typeof FieldKinds.optional>>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.

			const maybeContent = asValue.boxedContent;

			// Normally, empty fields are unreachable due to the behavior of 'tryGetField'.  However, the
			// root field is a special case where the field is always present (even if empty).
			return (
				maybeContent === undefined ? undefined : getProxyForNode(maybeContent)
			) as ProxyField<TSchema>;
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a list proxy, making
			// this case unreachable as long as users follow the 'list recipe'.
			fail("'sequence' field is unexpected.");
		}
		default:
			fail("invalid field kind");
	}
}

export function getProxyForNode<TSchema extends TreeSchema>(
	treeNode: TreeNode,
): ProxyNode<TSchema> {
	const schema = treeNode.schema;

	if (schemaIsMap(schema)) {
		fail("Map not implemented");
	}
	if (schemaIsLeaf(schema)) {
		return treeNode.value as ProxyNode<TSchema>;
	}
	const isFieldNode = schemaIsFieldNode(schema);
	if (isFieldNode || schemaIsStruct(schema)) {
		const cachedProxy = getCachedProxy(treeNode);
		if (cachedProxy !== undefined) {
			return cachedProxy as ProxyNode<TSchema>;
		}

		const proxy = isFieldNode ? createListProxy(treeNode) : createObjectProxy(treeNode, schema);
		cacheProxy(treeNode, proxy);
		return proxy as ProxyNode<TSchema>;
	}

	fail("unrecognized node kind");
}

export function createObjectProxy<TSchema extends StructSchema, TTypes extends AllowedTypes>(
	content: TypedNodeUnion<TTypes>,
	schema: TSchema,
): SharedTreeObject<TSchema> {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// 'null prototype' you would get from on object literal '{}' or 'Object.create(null)'.  This is
	// because 'deepEquals' uses 'Object.getPrototypeOf' as a way to quickly reject objects with different
	// prototype chains.

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	return new Proxy(
		{},
		{
			get(target, key): unknown {
				const field = content.tryGetField(key as FieldKey);
				if (field !== undefined) {
					return getProxyForField(field);
				}
				// TODO: Do this a better way.
				if (key === treeNodeSym) {
					return { schema };
				}
				return undefined;
			},
			set(target, key, value) {
				const fieldSchema = content.schema.structFields.get(key as FieldKey);

				if (fieldSchema === undefined) {
					// TODO: Verify that returning false will throw a TypeError in strict mode.
					return false;
				}

				// TODO: Is it safe to assume 'content' is a LazyEntity?
				const field = getBoxedField(content as LazyEntity, key as FieldKey, fieldSchema);

				switch (field.schema.kind) {
					case FieldKinds.required: {
						(field as RequiredField<AllowedTypes>).content = value;
						break;
					}
					case FieldKinds.optional: {
						(field as OptionalField<AllowedTypes>).content = value;
						break;
					}
					default:
						fail("invalid FieldKind");
				}

				return true;
			},
			has: (target, key) => {
				return schema.structFields.has(key as FieldKey);
			},
			ownKeys: (target) => {
				return [...schema.structFields.keys()];
			},
			getOwnPropertyDescriptor: (target, key) => {
				const field = content.tryGetField(key as FieldKey);

				if (field === undefined) {
					return undefined;
				}

				const p: PropertyDescriptor = {
					value: getProxyForField(field),
					writable: true,
					enumerable: true,
					configurable: true, // Must be 'configurable' if property is absent from proxy target.
				};

				return p;
			},
		},
	) as SharedTreeObject<TSchema>;
}

const getField = <TTypes extends AllowedTypes>(target: object) => {
	const treeNode = getTreeNode(target) as FieldNode<FieldNodeSchema>;
	const field = treeNode.content;
	return field as LazySequence<TTypes>;
};

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

// For brevity, the current implementation dynamically builds a property descriptor map from a list of
// functions we want to re-expose via the proxy.

const staticDispatchMap: PropertyDescriptorMap = {};

// TODO: Historically I've been impressed by V8's ability to inline compositions of functions, but it's
// still worth seeing if manually inlining 'thisContext' can improve performance.

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/unbound-method */

/**
 * Adds a PropertyDescriptor for the given function to the 'staticDispatchMap'.  The 'thisContext' function
 * receives the original 'this' argument (which is the proxy) and returns the desired 'this' context
 * for the function call.  (We use 'thisContext' to redirect calls to the underlying LazySequence.)
 */
function addDescriptor(
	map: PropertyDescriptorMap,
	fn: Function,
	thisContext: (self: object) => object,
) {
	map[fn.name] = {
		get: () =>
			function (this: any, ...args: any[]) {
				return fn.apply(thisContext(this), args) as unknown;
			},
		enumerable: false,
		configurable: false,
	};
}

// For compatibility, we are initially implement 'readonly T[]' by applying the Array.prototype methods
// to the list proxy.  Over time, we should replace these with efficient implementations on LazySequence
// to avoid re-entering the proxy as these methods access 'length' and the indexed properties.
//
// TODO: This assumes 'Function.name' matches the property name on 'Array.prototype', which may be
// dubious across JS engines.
[
	// TODO: Remove cast to any once targeting a more recent ES version.
	(Array.prototype as any).at,

	Array.prototype.concat,
	// Array.prototype.copyWithin,
	Array.prototype.entries,
	Array.prototype.every,
	// Array.prototype.fill,
	Array.prototype.filter,
	Array.prototype.find,
	Array.prototype.findIndex,
	Array.prototype.flat,
	Array.prototype.flatMap,
	Array.prototype.forEach,
	Array.prototype.includes,
	Array.prototype.indexOf,
	Array.prototype.join,
	Array.prototype.keys,
	Array.prototype.lastIndexOf,
	// Array.prototype.length,
	Array.prototype.map,
	// Array.prototype.pop,
	// Array.prototype.push,
	Array.prototype.reduce,
	Array.prototype.reduceRight,
	// Array.prototype.reverse,
	// Array.prototype.shift,
	Array.prototype.slice,
	Array.prototype.some,
	// Array.prototype.sort,
	// Array.prototype.splice,
	Array.prototype.toLocaleString,
	Array.prototype.toString,
	// Array.prototype.unshift,
	Array.prototype.values,
].forEach((fn) => {
	addDescriptor(staticDispatchMap, fn, (proxy) => proxy);
});

// These are methods implemented by LazySequence that we expose through the proxy.
[
	LazySequence.prototype.insertAt,
	LazySequence.prototype.removeAt,
	LazySequence.prototype.insertAtStart,
	LazySequence.prototype.insertAtEnd,
	LazySequence.prototype.removeRange,
	LazySequence.prototype.moveToStart,
	LazySequence.prototype.moveToEnd,
	LazySequence.prototype.moveToIndex,
].forEach((fn) => {
	addDescriptor(staticDispatchMap, fn, getField);
});

// [Symbol.iterator] is an alias for 'Array.prototype.values', as 'Function.name' returns 'values'.
staticDispatchMap[Symbol.iterator] = {
	value: Array.prototype[Symbol.iterator],
	writable: false,
	enumerable: false,
	configurable: false,
};

/* eslint-enable @typescript-eslint/unbound-method */
/* eslint-enable @typescript-eslint/ban-types */

const prototype = Object.create(null, staticDispatchMap);

/**
 * Helper to coerce property keys to integer indexes (or undefined if not an in-range integer).
 */
function asIndex(key: string | symbol, length: number) {
	if (typeof key === "string") {
		// TODO: It may be worth a '0' <= ch <= '9' check before calling 'Number' to quickly
		// reject 'length' as an index, or even parsing integers ourselves.
		const asNumber = Number(key);

		// TODO: See 'matrix/range.ts' for fast integer coercing + range check.
		if (Number.isInteger(asNumber)) {
			return 0 <= asNumber && asNumber < length ? asNumber : undefined;
		}
	}
}

export function createListProxy<TTypes extends AllowedTypes>(
	treeNode: TreeNode,
): SharedTreeList<TTypes> {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	// Own properties on the dispatch object are surfaced as own properties of the proxy.
	// (e.g., 'length', which is defined below).
	//
	// Properties normally inherited from 'Array.prototype' are surfaced via the prototype chain.
	const dispatch = Object.create(prototype, {
		length: {
			get(this: object) {
				return getField(this).length;
			},
			set() {},
			enumerable: false,
			configurable: false,
		},
	});

	setTreeNode(dispatch, treeNode);

	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	return new Proxy<SharedTreeList<TTypes>>([] as any, {
		get: (target, key) => {
			const field = getField(dispatch);
			const maybeIndex = asIndex(key, field.length);

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return maybeIndex !== undefined
				? getProxyForNode(field.boxedAt(maybeIndex))
				: (Reflect.get(dispatch, key) as unknown);
		},
		set: (target, key, newValue, receiver) => {
			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue);
			}

			// For MVP, we otherwise disallow setting properties (mutation is only available via the list mutation APIs).
			return false;
		},
		has: (target, key) => {
			const field = getField(dispatch);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatch, key);
		},
		ownKeys: (target) => {
			const field = getField(dispatch);

			// TODO: Would a lazy iterator to produce the indexes work / be more efficient?
			// TODO: Need to surface 'Symbol.isConcatSpreadable' as an own key.
			return Array.from({ length: field.length }, (_, index) => `${index}`).concat("length");
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getField(dispatch);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for indexed properties must
				// be a simple value property (as opposed to using getter) and declared writable/enumerable/configurable.
				return {
					// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
					//       as simple as calling '.at' since this skips the node and returns the FieldNode's
					//       inner field.
					value: getProxyForNode(field.boxedAt(maybeIndex)),
					writable: true, // For MVP, disallow setting indexed properties.
					enumerable: true,
					configurable: true,
				};
			} else if (key === "length") {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for 'length' must be a simple
				// value property (as opposed to using getter) and be declared writable / non-configurable.
				return {
					value: getField(dispatch).length,
					writable: true,
					enumerable: false,
					configurable: false,
				};
			}
			return Reflect.getOwnPropertyDescriptor(dispatch, key);
		},
	});
}
