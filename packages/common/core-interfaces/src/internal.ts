/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line no-restricted-syntax
export * from "./index.js";

// Important: all other exports must be type only exports. In package.json exports,
//  index.js is listed as the runtime file. This is done so that all imports are
//  using the same outer runtime file. (Could be changed if needed.)

// Export set of utility type re-tagged as internal for FF client convenience
import type { InternalUtilityTypes as ExposedInternalUtilityTypes } from "./exposedInternalUtilityTypes.js";
import type { JsonDeserialized as ExposedJsonDeserialized } from "./jsonDeserialized.js";
import type { JsonSerializable as ExposedJsonSerializable } from "./jsonSerializable.js";

// Note: There are no docs for these re-exports. `@inheritdoc` cannot be used as:
//   1. api-extractor does not support renames.
//   2. api-extractor does not support package paths. ("Import paths are not supported")
// Also not useful, at least in VS Code, as substitution is not made in place.

/**
 * @internal
 */
export type JsonDeserialized<T> = ExposedJsonDeserialized<T>;

/**
 * @internal
 */
export type JsonSerializable<T> = ExposedJsonSerializable<T>;

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/* eslint-disable jsdoc/require-jsdoc */
	export type IfSameType<
		X,
		Y,
		IfSame = unknown,
		IfDifferent = never,
	> = ExposedInternalUtilityTypes.IfSameType<X, Y, IfSame, IfDifferent>;
	/* eslint-enable jsdoc/require-jsdoc */
}
