/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { arrayLikeMarkerSymbol } from "../contextuallyTyped";
import { FieldProxyTarget } from "./editableField";
import { proxyTargetSymbol } from "./editableTreeTypes";

const properties = [
	{ key: arrayLikeMarkerSymbol, writable: false, enumerable: false, value: true },
	{ key: proxyTargetSymbol, writable: false, enumerable: false },
	{ key: Symbol.iterator, writable: false, enumerable: false },
	{ key: Symbol.isConcatSpreadable, writable: true, enumerable: false },
	{ key: "context", writable: false, enumerable: false },
	{ key: "fieldKey", writable: false, enumerable: false },
	{ key: "fieldSchema", writable: false, enumerable: false },
	{ key: "length", writable: false, enumerable: true },
	{ key: "parent", writable: false, enumerable: false },
];

function createPropMap(props: typeof properties) {
	const map: PropertyDescriptorMap = {};

	for (const { key, writable, enumerable, value } of props) {
		const desc: PropertyDescriptor = (map[key as string] = {
			enumerable,
		});

		if (value !== undefined) {
			assert(!writable, "'value' must be constant.");
			desc.value = value;
			desc.writable = false;
		} else {
			desc.get = function (this: { [proxyTargetSymbol]: FieldProxyTarget }) {
				return Reflect.get(this[proxyTargetSymbol], key) as unknown;
			};

			if (writable) {
				desc.set = function (
					this: { [proxyTargetSymbol]: FieldProxyTarget },
					newValue: unknown,
				) {
					return Reflect.set(this[proxyTargetSymbol], key, newValue) as unknown;
				};
			}
		}
	}

	return map;
}

export const ownPropertiesMap = createPropMap(properties);

/* eslint-disable @typescript-eslint/unbound-method -- Intentionally forwarding proxy instance to unbound Array methods */

const arrayFns = [
	Array.prototype.forEach,
	Array.prototype.concat,
	Array.prototype.every,
	Array.prototype.filter,
	Array.prototype.find,
	Array.prototype.findIndex,
	// Array.prototype.findLast,   				// TODO: Requires newer ES lib
	// Array.prototype.findLastIndex,			// TODO: Requires newer ES lib
	// Array.prototype.flat, 					// TODO: Requires newer ES lib
	// Array.prototype.flatMap, 				// TODO: Requires newer ES lib
	Array.prototype.includes,
	Array.prototype.indexOf,
	Array.prototype.join,
	Array.prototype.keys,
	Array.prototype.lastIndexOf,
	Array.prototype.map,
	Array.prototype.push,
	Array.prototype.slice,
	Array.prototype.reduce,
	Array.prototype.reduceRight,
	Array.prototype.some,
	// Array.prototype.splice,					// TODO: Needs custom implementation (increases length to resize)
	Array.prototype.toLocaleString,
	Array.prototype.toString,
	// Array.prototype.toReversed,				// TODO: Requires newer ES lib
	// Array.prototype.toSorted,				// TODO: Requires newer ES lib
	// Array.prototype.toSpliced,				// TODO: Requires newer ES lib
	// Array.prototype.unshift,					// TODO: Needs custom implementation (sets indices > length)
	Array.prototype.values,
	// Array.prototype.with,					// TODO: Requires newer ES lib
	Array.prototype[Symbol.iterator],
	// Array.prototype[Symbol.unscopables],		// TODO: Requires newer ES lib (used by 'with()')
];

const targetFns = [
	FieldProxyTarget.prototype.deleteNodes,
	FieldProxyTarget.prototype.getNode,
	FieldProxyTarget.prototype.insertNodes,
	FieldProxyTarget.prototype.moveNodes,
	FieldProxyTarget.prototype.replaceNodes,
];

function createFnMap(
	owner: any,
	fns: ((...args2: any[]) => unknown)[],
	dispatch?: (...args1: any[]) => (...args2: any[]) => unknown,
) {
	const map: PropertyDescriptorMap = {};
	const ownerDescs = Object.getOwnPropertyDescriptors(owner);

	for (const fn of fns) {
		const name = fn.name;
		const desc = (map[name] = ownerDescs[name]);

		assert(desc !== undefined, "'fn' must be own member of 'owner'");

		if (dispatch !== undefined) {
			desc.value = dispatch(desc.value);
		}
	}

	return map;
}

export const propertiesMap = Object.assign(
	createFnMap(Array.prototype, arrayFns),
	createFnMap(
		FieldProxyTarget.prototype,
		targetFns,
		/* dispatch: */ (targetFn: (...args: any) => unknown) =>
			function (this: { [proxyTargetSymbol]: FieldProxyTarget }, ...args: any[]) {
				// The 'this' argument is our Proxy.
				// Use '[proxyTargetSymbol]' to get a reference to the underlying FieldProxyTarget.
				return Reflect.apply(targetFn, this[proxyTargetSymbol], args) as unknown;
			},
	),
	ownPropertiesMap,
);
