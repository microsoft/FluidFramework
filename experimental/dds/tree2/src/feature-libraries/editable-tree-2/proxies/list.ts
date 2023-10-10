/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/unbound-method */
import { EmptyKey } from "../../../core";
import { AllowedTypes } from "../../typed-schema";
import { TreeNode } from "../editableTreeTypes";
import { LazySequence } from "../lazyField";
import { getProxyForNode, getTreeNode, setTreeNode } from "./node";
import { List } from "./types";

const getField = <TTypes extends AllowedTypes>(target: object) => {
	const treeNode = getTreeNode(target);
	const field = treeNode.getField(EmptyKey);
	return field as LazySequence<TTypes>;
};

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

// For brevity, the current implementation dynamically builds a property descriptor map from a list of
// functions we want to re-expose via the proxy.
const staticDispatchMap: PropertyDescriptorMap = {};

// TODO: Historically I've been impressed by V8's ability to inline compositions of functions, but it's
// still worth seeing if manually inlining 'thisContext' can improve performance.

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

staticDispatchMap[Symbol.iterator] = {
	value: Array.prototype[Symbol.iterator],
	writable: false,
	enumerable: false,
	configurable: false,
};

const prototype = Object.create(null, staticDispatchMap);

function asIndex(key: string | symbol, length: number) {
	if (typeof key === "string") {
		const asNumber = Number(key);

		if (Number.isInteger(asNumber)) {
			return 0 <= asNumber && asNumber < length ? asNumber : undefined;
		}
	}
}

export function createListProxy<TTypes extends AllowedTypes>(treeNode: TreeNode): List<TTypes> {
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
	return new Proxy<List<TTypes>>([] as any, {
		get: (target, key) => {
			const field = getField(dispatch);
			const maybeIndex = asIndex(key, field.length);

			// TODO: The only reason for using 'boxedAt' is to prevent FieldNode/LazySequence from
			//       collapsing to 'undefined'.  Otherwise, we could avoid the overhead of allocating
			//       boxes for leaves.
			return maybeIndex !== undefined
				? getProxyForNode(field.boxedAt(maybeIndex))
				: (Reflect.get(dispatch, key) as unknown);
		},
		set: (target, key, newValue, receiver) => {
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue);
			}
			// For MVP, we disallow set.
			return false;
		},
		has: (target, key) => {
			const field = getField(dispatch);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatch, key);
		},
		ownKeys: (target) => {
			const field = getField(dispatch);
			return Array.from({ length: field.length }, (_, index) => `${index}`).concat("length");
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getField(dispatch);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				return {
					value: field.at(maybeIndex),
					writable: false, // For MVP, disallow setting indexed properties.
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
