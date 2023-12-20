/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueManager } from "./independentDirectory";

/**
 * Brand to ensure independent values are given without revealing their internal details
 * (or maybe internal?)
 * @alpha
 */
declare class IndependentValueBrand<T> {
	private readonly IndependentValue: IndependentValue<T>;
}

/**
 * (or maybe internal?)
 * @alpha
 */
export type IndependentValue<T> = T & IndependentValueBrand<T>;

/**
 * @internal
 */
export function brandIVM<T, M extends ValueManager<T>>(value: M) {
	return value as unknown as IndependentValue<T>;
}

/**
 * @internal
 */
export function unbrandIVM<T>(branded: IndependentValue<T>): ValueManager<T> {
	return branded as unknown as ValueManager<T>;
}
