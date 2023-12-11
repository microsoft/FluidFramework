/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";

// Note:
// Currently this file is unused, though it could serve as the implementation of indexing for Lists when class and simple trees are merged.

/**
 * Info integerIndexable needs to work.
 */
export interface IndexLookup<T> {
	read(index: number): T;
	write(index: number, value: T): boolean;
	readonly length: number;
}

/**
 * Class which can be indexed with integers from 0 to length -1 like arrays.
 * Unlike with arrays, this class asserts for out of bounds indexing on both read and write.
 *
 * @privateRemarks
 * This class works by returning a proxy from its constructor which
 * causes the derived class to get the proxy as its "this" object.
 */
export abstract class IntegerIndexable<in out T> {
	[x: number]: T;

	protected abstract read(index: number): T;
	protected abstract write(index: number, value: T): boolean;

	public constructor(public length: number) {
		return integerIndexable(this, this as unknown as IndexLookup<T>);
	}
}

export function integerIndexable<T, TTarget extends object>(
	outerTarget: TTarget,
	provider: IndexLookup<T>,
): {
	[x: number]: T;
} & TTarget {
	function isValidIndex(index: number): boolean {
		return index >= 0 && index < provider.length;
	}

	function keyToNumber(key: string | symbol): number | undefined {
		if (typeof key !== "string") {
			return undefined;
		}
		const index = Number.parseInt(key, 10);
		return Number.isNaN(index) ? undefined : index;
	}

	const proxyHandler: ProxyHandler<TTarget> = {
		get: (target, key, receiver): T | unknown => {
			const index = keyToNumber(key);
			if (index !== undefined) {
				assert(isValidIndex(index), 0x839 /* invalid index */);
				return provider.read(index);
			}

			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(target, key, receiver);
		},
		getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined => {
			const index = keyToNumber(key);
			if (index !== undefined) {
				if (isValidIndex(index)) {
					const descriptor: PropertyDescriptor = {
						get() {
							return provider.read(index);
						},
						set(value: T): void {
							provider.write(index, value);
						},
						writable: true,
						enumerable: true,
						configurable: true, // Must be 'configurable' if property is absent from proxy target.
					};
					return descriptor;
				} else {
					return undefined;
				}
			}

			return Reflect.getOwnPropertyDescriptor(target, key);
		},
		has: (target, key) => {
			if (typeof key === "string") {
				const numericKey = Number.parseInt(key, 10);
				if (!Number.isNaN(numericKey)) {
					return isValidIndex(numericKey);
				}
			}
			return Reflect.has(target, key);
		},
		set: (target, key, newValue): boolean => {
			const index = keyToNumber(key);
			if (index !== undefined) {
				assert(isValidIndex(index), 0x83a /* invalid index */);
				return provider.write(index, newValue);
			}
			return Reflect.set(target, key, newValue);
		},
		ownKeys: (target) => {
			const keys = Reflect.ownKeys(target);
			for (let index = 0; index < provider.length; index++) {
				keys.push(index.toString());
			}
			return keys;
		},
	};
	const proxy = new Proxy(outerTarget, proxyHandler);
	return proxy as unknown as {
		[x: number]: T;
	} & TTarget;
}
