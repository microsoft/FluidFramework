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

export const failSometimeProxy = <T extends object>(handler: Partial<T>): T => {
	const proxy = new Proxy<T>(handler as T, {
		get: (t, p, r): unknown => {
			if (p === "then") {
				return undefined;
			}
			if (p in handler) {
				return Reflect.get(t, p, r);
			}
			throw new Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};
