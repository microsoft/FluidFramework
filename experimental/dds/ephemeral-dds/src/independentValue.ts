/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueManager } from "./independentDirectory";

/**
 * Brand to ensure independent values internal type safety without revealing
 * internals that are subject to change.
 *
 * @alpha
 */
declare class IndependentValueBrand<T> {
	private readonly IndependentValue: IndependentValue<T>;
}

/**
 * This type provides no additional functionality over the type it wraps.
 * It is used to ensure type safety within package.
 * Users may find it convenient to just use the type it wraps directly.
 *
 * @privateRemarks
 * Checkout filtering omitting unknown from T (`Omit<T,unknown> &`).
 *
 * @alpha
 */
export type IndependentValue<T> = T & IndependentValueBrand<T>;

/**
 * @internal
 */
export function brandIVM<TManagerInterface, TValue>(
	manager: TManagerInterface & ValueManager<TValue>,
): IndependentValue<TManagerInterface> {
	return manager as TManagerInterface as IndependentValue<TManagerInterface>;
}

/**
 * @internal
 */
export function unbrandIVM<TManagerInterface, TValue>(
	branded: IndependentValue<TManagerInterface>,
): ValueManager<TValue> {
	return branded as unknown as ValueManager<TValue>;
}
