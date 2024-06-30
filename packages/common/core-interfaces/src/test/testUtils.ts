/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IfSameType } from "../exposedUtilityTypes.js";

/**
 * Use to compile-time assert types of two variables are identical.
 */
export function assertIdenticalTypes<T, U>(
	_actual: T & IfSameType<T, U>,
	_expected: U & IfSameType<T, U>,
): IfSameType<T, U> {
	return undefined as IfSameType<T, U>;
}
/**
 * Creates a non-viable (`undefined`) instance of type T to be used for type checking.
 */
export function createInstanceOf<T>(): T {
	return undefined as T;
}
