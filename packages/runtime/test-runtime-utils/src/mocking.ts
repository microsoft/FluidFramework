/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isPromiseLike } from "@fluidframework/core-utils/internal";

/**
 * The fulfilled value of a promise, or the original type for a synchronous result.
 * @internal
 */
export type UnPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Produce a replacement property with access to the real object's methods and state.
 * @internal
 */
export type OverrideFactory<T, P extends keyof T> = (T: T) => T[P];

/** Overrides either replace a property or recursively wrap a method's eventual return value. */
type NestedOverrides<T> = {
	[P in keyof T]?: T[P] extends (...args: any) => any
		? NestedOverrides<UnPromise<ReturnType<T[P]>>> | OverrideFactory<T, P>
		: OverrideFactory<T, P>;
};

/**
 * Control the receiver of unoverridden members while sharing the same deep-override mechanism.
 * @internal
 */
export interface IWrapObjectAndOverrideOptions {
	/**
	 * By default, getters and ordinary method calls use the proxy, so sibling calls see overrides.
	 * Opt into "target" to evaluate getters and bind methods to their original owner, including private state.
	 * Nested return-value wrappers inherit this setting; explicitly overridden calls keep their existing behavior.
	 * @defaultValue "proxy"
	 */
	receiver?: "proxy" | "target";
}

/**
 * Wrap an object or deeply nested service call results without changing the original object.
 * Proxy-receiver dispatch is preserved by default so existing fault-injection tests can intercept sibling calls.
 * Observational wrappers may explicitly opt into original-target receivers for driver/private-field fidelity.
 * Used by storage fault-injection tests and inspectable storage upload observers.
 * @internal
 */
export function wrapObjectAndOverride<T extends Record<string, any>>(
	obj: T,
	overrides: NestedOverrides<T>,
	options: IWrapObjectAndOverrideOptions = {},
): T {
	return new Proxy(obj, {
		get: (target: T, property: string, receiver): any => {
			const override: NestedOverrides<T>[keyof T] | undefined = overrides[property as keyof T];
			// check if the current property has an override
			if (override) {
				// check if the override is a function, which means it is factory
				// in which case we called the factory to generate the property
				if (typeof override === "function") {
					return override(target);
				}

				// there is an override, but it is not a function, so
				// it is an object which nests more overrides, so
				// get the property from the passed in object,
				// so we can proxy nested overrides to it
				const real: unknown = target[property as keyof T];
				// if the real property is a function, we'll
				// call it, so whatever it returns can have
				// the nested overrides applied to it
				if (typeof real === "function") {
					return (...args: any): any => {
						const res = real.bind(target)(...args);
						// unwrap promises to keep typing simple
						if (isPromiseLike(res)) {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Nested proxy results retain the original promise's value type.
							return res.then((v: any) => wrapObjectAndOverride(v, override, options));
						}

						return wrapObjectAndOverride(res, override, options);
					};
				}

				// the real property isn't a function, to just wraps its value
				return wrapObjectAndOverride<T[typeof property]>(
					real as T[typeof property],
					override,
					options,
				);
			}
			if (options.receiver === "target") {
				// Opt-in observers retain live private state and bind extracted methods to the original owner.
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			}
			// Preserve the original helper's dispatch: unoverridden members may call overridden siblings.
			return Reflect.get(target, property, receiver);
		},
	});
}
