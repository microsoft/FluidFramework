/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonDeserialized } from "./jsonDeserialized.js";
import type { JsonSerializable, JsonSerializableOptions } from "./jsonSerializable.js";
import type { OpaqueJsonDeserialized, OpaqueJsonSerializable } from "./opaqueJson.js";

/**
 * Helper to return an Opaque Json type version of Json type
 *
 * @remarks
 * To use this helper create a helper function that filters type `T` through at
 * least {@link JsonSerializable} and optionally {@link JsonDeserialized}. Then
 * cast value through `unknown as JsonTypeToOpaqueJson<T, Options>`, where
 * `Options` reflects the serialization capabilities of that area.
 *
 * @example
 * ```ts
 * function castToOpaqueJson<T>(value: JsonSerializable<T>): JsonTypeToOpaqueJson<T> {
 *     return value as unknown as JsonTypeToOpaqueJson<T>;
 * }
 * ```
 *
 * @internal
 */
export type JsonTypeToOpaqueJson<
	T,
	Options extends JsonSerializableOptions = {
		AllowExactly: [];
		AllowExtensionOf: never;
	},
> = T extends JsonSerializable<T, Options> & JsonDeserialized<T, Options>
	? OpaqueJsonSerializable<
			T,
			Options extends { AllowExactly: unknown[] } ? Options["AllowExactly"] : [],
			Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never
		> &
			OpaqueJsonDeserialized<
				T,
				Options extends { AllowExactly: unknown[] } ? Options["AllowExactly"] : [],
				Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never
			>
	: T extends JsonDeserialized<T, Options>
		? OpaqueJsonDeserialized<
				T,
				Options extends { AllowExactly: unknown[] } ? Options["AllowExactly"] : [],
				Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never
			>
		: T extends JsonSerializable<T, Options>
			? OpaqueJsonSerializable<
					T,
					Options extends { AllowExactly: unknown[] } ? Options["AllowExactly"] : [],
					Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never
				>
			: never;

/**
 * Helper to extract Json type from an Opaque Json type
 *
 * @remarks
 * This type only works with basic serialization capabilities (options).
 * Attempts to make `Options` generic resulted in infinite recursion
 * in TypeScript compiler that was not understood, so this type only
 * supports TJson (value type) variance.
 *
 * To use this helper, create a helper function that accepts
 * `OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>`.
 *
 * @example
 * ```ts
 * function exposeFromOpaqueJson<TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>>(
 *	 opaque: TOpaque,
 * ): OpaqueJsonToJsonType<TOpaque> {
 *     return opaque as unknown as OpaqueJsonToJsonType<TOpaque>;
 * }
 * ```
 *
 * @internal
 */
export type OpaqueJsonToJsonType<
	TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>,
> = TOpaque extends OpaqueJsonSerializable<infer TJson> & OpaqueJsonDeserialized<infer TJson>
	? JsonSerializable<TJson> & JsonDeserialized<TJson>
	: TOpaque extends OpaqueJsonDeserialized<infer TJson>
		? JsonDeserialized<TJson>
		: TOpaque extends OpaqueJsonSerializable<infer TJson>
			? JsonSerializable<TJson>
			: never;
