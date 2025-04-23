/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonlyRecursionLimit,
	InternalUtilityTypes,
	ReadonlySupportedGenerics,
} from "./exposedInternalUtilityTypes.js";

/**
 * Default set of generic that {@link DeepReadonly} will apply deep immutability
 * to generic types.
 *
 * @privateRemarks
 * WeakRef should be added when lib is updated to ES2021 or later.
 *
 * @system
 */
export type DeepReadonlySupportedGenericsDefault =
	| Map<unknown, unknown>
	| Promise<unknown>
	| Set<unknown>
	| WeakMap<object, unknown>
	| WeakSet<object>;

/**
 * Options for {@link DeepReadonly}.
 *
 * @beta
 */
export interface DeepReadonlyOptions {
	/**
	 * Union of Built-in and IFluidHandle whose generics will also be made deeply immutable.
	 *
	 * The default value is `Map` | `Promise` | `Set` | `WeakMap` | `WeakSet`.
	 */
	DeepenedGenerics?: ReadonlySupportedGenerics;

	/**
	 * Limit on processing recursive types.
	 *
	 * The default value is `"NoLimit"`.
	 */
	RecurseLimit?: DeepReadonlyRecursionLimit;
}

/**
 * Transforms type to a fully and deeply immutable type, with limitations.
 *
 * @remarks
 * This utility type is similar to a recursive `Readonly<T>`, but also
 * applies immutability to common generic types like `Map` and `Set`.
 *
 * Optionally, immutability can be applied to supported generics types. See
 * {@link DeepReadonlySupportedGenericsDefault} for generics that have
 * immutability applied to generic type by default.
 *
 * @beta
 */
export type DeepReadonly<
	T,
	Options extends DeepReadonlyOptions = {
		DeepenedGenerics: DeepReadonlySupportedGenericsDefault;
		RecurseLimit: "NoLimit";
	},
> = InternalUtilityTypes.DeepReadonlyImpl<
	T,
	Options extends { DeepenedGenerics: unknown }
		? Options["DeepenedGenerics"]
		: DeepReadonlySupportedGenericsDefault,
	Options extends { RecurseLimit: DeepReadonlyRecursionLimit }
		? Options["RecurseLimit"]
		: "NoLimit"
>;
