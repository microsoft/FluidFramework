/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	InternalUtilityTypes,
	ReadonlySupportedGenerics,
} from "./exposedInternalUtilityTypes.js";
import type { IFluidHandle } from "./handles.js";

/**
 * Default set of generic that {@link ShallowReadonly} will apply shallow immutability
 * to generic types.
 *
 * @privateRemarks
 * WeakRef should be added when lib is updated to ES2021 or later.
 *
 * @system
 */
export type ShallowReadonlySupportedGenericsDefault = Promise<unknown> | IFluidHandle;

/**
 * Options for {@link ShallowReadonly}.
 *
 * @beta
 */
export interface ShallowReadonlyOptions {
	/**
	 * Union of Built-in and IFluidHandle whose generics will also be made shallowly immutable.
	 *
	 * The default value is `IFluidHandle` | `Promise`.
	 */
	DeepenedGenerics?: ReadonlySupportedGenerics;
}

/**
 * Transforms type to a shallowly immutable type.
 *
 * @remarks
 * This utility type is similar to `Readonly<T>`, but also applies immutability to
 * common generic types like `Map` and `Set`.
 *
 * Optionally, immutability can be applied to supported generics types. See
 * {@link ShallowReadonlySupportedGenericsDefault} for generics that have
 * immutability applied to generic type by default.
 *
 * @beta
 */
export type ShallowReadonly<
	T,
	Options extends ShallowReadonlyOptions = {
		DeepenedGenerics: ShallowReadonlySupportedGenericsDefault;
	},
> = InternalUtilityTypes.ShallowReadonlyImpl<
	T,
	Options extends { DeepenedGenerics: unknown }
		? Options["DeepenedGenerics"]
		: ShallowReadonlySupportedGenericsDefault
>;
