/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A special key used to store the original function in a {@link Mockable | mockable} function.
 * @remarks Use {@link mockify | `mockify.key`} as a convenient way to access this key.
 */
export const mockifyMockKey = Symbol("`mockify` mock function key");

/**
 * A function that can be mocked after being decorated by {@link mockify | mockify()}.
 */
export interface Mockable<T extends (...args: any[]) => unknown> {
	(...args: Parameters<T>): ReturnType<T>;
	[mockifyMockKey]: T;
}

/**
 * Decorates a function to allow it to be mocked.
 * @param fn - The function that will become mockable.
 * @returns A function with a {@link mockifyMockKey | special property } that can be overwritten to mock the original function.
 * By default, this property is set to the original function.
 * If overwritten with a new function, the new function will be called instead of the original.
 * @example
 * ```typescript
 * const original = () => console.log("original");
 * const mockable = mockify(original);
 * mockable(); // logs "original"
 * mockable[mockify.key] = () => console.log("mocked");
 * mockable(); // logs "mocked"
 * mockable[mockify.key] = original;
 * mockable(); // logs "original"
 * ```
 *
 * This pattern is useful for mocking top-level exported functions in a module.
 * For example,
 * ```typescript
 * export function fn() { /* ... * / }
 * ```
 * becomes
 * ```typescript
 * import { mockify } from "./mockify.js";
 * export const fn = mockify(() => { /* ... * / });
 * ```
 * and can now be mocked by another module that imports it.
 * ```typescript
 * import * as sinon from "sinon";
 * import { mockify } from "./mockify.js";
 * import { fn } from "./module.js";
 * sinon.stub(fn, mockify.key).callsFake(() => {
 *   // ... mock function implementation ...
 * });
 * // ...
 * sinon.restore();
 * ```
 */
export function mockify<T extends (...args: any[]) => unknown>(fn: T): Mockable<T> {
	const mockable = (...args: Parameters<T>): ReturnType<T> => {
		return mockable[mockifyMockKey](...args) as ReturnType<T>;
	};
	mockable[mockifyMockKey] = fn;
	return mockable;
}

mockify.key = mockifyMockKey;
