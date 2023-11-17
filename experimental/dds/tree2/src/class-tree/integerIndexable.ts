/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail } from "../util";

/**
 * Class which can indexed with integers from 0 to length -1 like arrays.
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

	private isValidIndex(index: number): boolean {
		return index >= 0 && index < this.length;
	}

	private keyToNumber(key: string | symbol): number | undefined {
		if (typeof key !== "string") {
			return undefined;
		}
		const index = Number.parseInt(key, 10);
		if (!Number.isNaN(index)) {
			return index;
		}
		return undefined;
	}

	public constructor(public length: number) {
		const proxyHandler: ProxyHandler<IntegerIndexable<T>> = {
			get: (target, key, receiver): T | unknown => {
				const index = target.keyToNumber(key);
				if (index !== undefined) {
					assert(target.isValidIndex(index), "invalid index");
					return proxy.read(index);
				}

				// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
				return Reflect.get(target, key, receiver);
			},
			getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined => {
				const index = target.keyToNumber(key);
				if (index !== undefined) {
					if (target.isValidIndex(index)) {
						const descriptor: PropertyDescriptor = {
							get() {
								return proxy.read(index);
							},
							set(value: T): void {
								proxy.write(index, value);
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
						return true;
					}
				}
				return Reflect.has(target, key);
			},
			set: (target, key, newValue): boolean => {
				const index = target.keyToNumber(key);
				if (index !== undefined) {
					assert(target.isValidIndex(index), "invalid index");
					return proxy.write(index, newValue);
				}
				return Reflect.set(target, key, newValue);
			},
			ownKeys: (target) => {
				const keys = Reflect.ownKeys(target);
				for (let index = 0; index < target.length; index++) {
					keys.push(index.toString());
				}
				return keys;
			},
		};
		const proxy = new Proxy(this, proxyHandler);
		return proxy;
	}
}

// implements ReadonlyArray<T>
export class ArrayFake<T> extends IntegerIndexable<T> {
	public constructor(
		length: number,
		public value: T,
	) {
		super(length);
	}

	protected read(index: number): T {
		if (index < 0 || index >= this.length) {
			fail("index out of bounds");
		}
		return this.value;
	}
	protected write(index: number, value: T): boolean {
		if (index < 0 || index >= this.length) {
			return false;
		}
		this.value = value;
		return true;
	}
}
