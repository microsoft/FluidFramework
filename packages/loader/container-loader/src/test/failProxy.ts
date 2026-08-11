/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const failProxy = <T extends object>(): T => {
	const proxy = new Proxy<T>({} as unknown as T, {
		get: (_, p): unknown => {
			if (p === "then") {
				return undefined;
			}
			throw new Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};

export const AbsentProperty = Symbol("AbsentProperty");

// Allow properties to be explicitly absent to make it easier to create
// partial handlers where proxy won't throw for missing properties, but
// still appear `undefined` when accessed.
export type PartialOrAbsent<T> = {
	[P in keyof T]?: T[P] | typeof AbsentProperty;
};

export const failSometimeProxy = <T extends object>(handler: PartialOrAbsent<T>): T => {
	const proxy = new Proxy<T>(handler as T, {
		get: (t, p, r): unknown => {
			if (p === "then") {
				return undefined;
			}
			if (p in handler) {
				const value = Reflect.get(t, p, r);
				if (value === AbsentProperty) {
					return undefined;
				}
				return value;
			}
			throw new Error(`${p.toString()} not implemented`);
		},
		has: (t, p): boolean => {
			if (p in handler) {
				return Reflect.get(t, p) !== AbsentProperty;
			}
			throw new Error(`${p.toString()} not implemented or declared as absent`);
		},
	});
	return proxy;
};
