/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line no-restricted-syntax
export * from "./index.js";

// Important: all other exports must be type only exports. In package.json exports,
//  index.js is listed as the runtime file. This is done so that all imports are
//  using the same outer runtime file. (Could be changed if needed.)

// Export set of utility types re-tagged as internal for FF client convenience.
// These types are not intended for direct use by customers and api-extractor will
// flag misuse. If an externally visible version of these types is needed, import
// from via /internal/exposedUtilityTypes rather than /internal.
import type { DeepReadonly as ExposedDeepReadonly } from "./deepReadonly.js";
import type { InternalUtilityTypes as ExposedInternalUtilityTypes } from "./exposedInternalUtilityTypes.js";
import type {
	JsonDeserialized as ExposedJsonDeserialized,
	JsonDeserializedOptions,
} from "./jsonDeserialized.js";
import type {
	JsonSerializable as ExposedJsonSerializable,
	JsonSerializableOptions,
} from "./jsonSerializable.js";
import type {
	JsonTypeWith as ExposedJsonTypeWith,
	ReadonlyNonNullJsonObjectWith as ExposedReadonlyNonNullJsonObjectWith,
} from "./jsonType.js";

// Note: There are no docs for these re-exports. `@inheritdoc` cannot be used as:
//   1. api-extractor does not support renames.
//   2. api-extractor does not support package paths. ("Import paths are not supported")
// Also not useful, at least in VS Code, as substitution is not made in place.

/**
 * @internal
 */
export type DeepReadonly<T> = ExposedDeepReadonly<T>;

/**
 * @internal
 */
export type JsonDeserialized<
	T,
	Options extends JsonDeserializedOptions = {
		AllowExactly: [];
		AllowExtensionOf: never;
	},
> = ExposedJsonDeserialized<T, Options>;

/**
 * @internal
 */
export type JsonSerializable<
	T,
	Options extends JsonSerializableOptions = {
		AllowExactly: [];
		AllowExtensionOf: never;
	},
> = ExposedJsonSerializable<T, Options>;

/**
 * @internal
 */
export type JsonTypeWith<T> = ExposedJsonTypeWith<T>;

/**
 * @internal
 */
export type ReadonlyNonNullJsonObjectWith<T> = ExposedReadonlyNonNullJsonObjectWith<T>;

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/* eslint-disable jsdoc/require-jsdoc */
	export type FlattenIntersection<T extends ExposedInternalUtilityTypes.AnyRecord> =
		ExposedInternalUtilityTypes.FlattenIntersection<T>;
	export type IfSameType<
		X,
		Y,
		IfSame = unknown,
		IfDifferent = never,
	> = ExposedInternalUtilityTypes.IfSameType<X, Y, IfSame, IfDifferent>;
	/* eslint-enable jsdoc/require-jsdoc */
}
