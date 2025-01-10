/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isPromiseLike } from "@fluidframework/core-utils/internal";

export type UnPromise<T> = T extends Promise<infer U> ? U : T;

export type OverrideFactory<T, P extends keyof T> = (T: T) => T[P];

type NestedOverrides<T> = {
	[P in keyof T]?: T[P] extends (...args: any) => any
		? NestedOverrides<UnPromise<ReturnType<T[P]>>> | OverrideFactory<T, P>
		: OverrideFactory<T, P>;
};

export function wrapObjectAndOverride<T extends Record<string, any>>(
	obj: T,
	overrides: NestedOverrides<T>,
): T {
	return new Proxy(obj, {
		get: (target: T, property: string, r) => {
			const override = overrides?.[property as keyof T];
			// check if the current property has an override
			if (override) {
				// check if the override is a function, which means it is factory
				// in which case we called the factory to generate the property
				if (typeof override === "function") {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return override(target);
				}

				// there is an override, but it is not a function, so
				// it is an object which nests more overrides, so
				// get the property from the passed in object,
				// so we can proxy nested overrides to it
				const real = target?.[property as keyof T];
				// if the real property is a function, we'll
				// call it, so whatever it returns can have
				// the nested overrides applied to it
				if (typeof real === "function") {
					return (...args: any) => {
						const res = real.bind(target)(...args);
						// unwrap promises to keep typing simple
						if (isPromiseLike(res)) {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-return
							return res.then((v: any) => wrapObjectAndOverride(v, override));
						}

						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return wrapObjectAndOverride(res, override);
					};
				}

				// the real property isn't a function, to just wraps its value
				return wrapObjectAndOverride<T[typeof property]>(real as any, override);
			}
			// there isn't an override, so just get the property from the target
			return Reflect.get(target, property, r);
		},
	});
}
