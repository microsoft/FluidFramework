/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	type AllowedTypes,
	type FixRecursiveArraySchema,
	type TreeNodeFromImplicitAllowedTypes,
	type ValidateRecursiveSchema,
} from "./simple-tree/index.js";

const sf = new SchemaFactory("com.fluidframework.json");

/**
 * {@link AllowedTypes} for primitives types allowed in JSON.
 * @internal
 */
export const JsonPrimitive = [
	sf.null,
	sf.boolean,
	sf.number,
	sf.string,
] as const satisfies AllowedTypes;

/**
 * @internal
 */
export type JsonPrimitive = TreeNodeFromImplicitAllowedTypes<typeof JsonPrimitive>;

/**
 * {@link AllowedTypes} for any content allowed in the JSON domain.
 * @example
 * ```typescript
 * const tree = TreeAlpha.importConcise(JsonUnion, { example: { nested: true }, value: 5 });
 * ```
 * @internal
 */
export const JsonUnion = [() => JsonObject, () => JsonArray, ...JsonPrimitive] as const;

/**
 * @internal
 */
export type JsonUnion = TreeNodeFromImplicitAllowedTypes<typeof JsonUnion>;

/**
 * Do not use. Exists only as a workaround for {@link https://github.com/microsoft/TypeScript/issues/59550} and {@link https://github.com/microsoft/rushstack/issues/4429}.
 * @system @internal
 */
export const _APIExtractorWorkaroundJsonObjectBase = sf.mapRecursive("object", JsonUnion);

/**
 * Arbitrary JSON object as a {@link TreeNode}.
 * @remarks
 * API of the tree node is more aligned with an es6 map than a JS object using its properties like a map.
 * @example
 * ```typescript
 * // Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
 * const fromArray = new JsonObject([["a", 0]]);
 * // Using `importConcise` can work better for JSON data:
 * const imported = TreeAlpha.importConcise(JsonObject, { a: 0 });
 * // Node API is like a Map:
 * const value = imported.get("a");
 * ```
 * @sealed @internal
 */
export class JsonObject extends _APIExtractorWorkaroundJsonObjectBase {}
{
	type _check = ValidateRecursiveSchema<typeof JsonObject>;
}

/**
 * D.ts bug workaround, see {@link FixRecursiveArraySchema}.
 * @privateRemarks
 * In the past this this had to reference the base type (_APIExtractorWorkaroundJsonArrayBase).
 * Testing for this in examples/utils/import-testing now shows it has to reference JsonArray instead.
 * @system @internal
 */
export declare type _RecursiveArrayWorkaroundJsonArray = FixRecursiveArraySchema<
	typeof JsonArray
>;

/**
 * Do not use. Exists only as a workaround for {@link https://github.com/microsoft/TypeScript/issues/59550} and {@link https://github.com/microsoft/rushstack/issues/4429}.
 * @system @internal
 */
export const _APIExtractorWorkaroundJsonArrayBase = sf.arrayRecursive("array", JsonUnion);

/**
 * Arbitrary JSON object as a {@link TreeNode}.
 * @remarks
 * This can be worked around by using {@link TreeAlpha.importConcise}.
 * @example
 * ```typescript
 * // Due to TypeScript restrictions on recursive types, the constructor can be somewhat limiting.
 * const usingConstructor = new JsonArray(["a", 0, new JsonArray([1])]);
 * // Using `importConcise` can work better for JSON data:
 * const imported = TreeAlpha.importConcise(JsonArray, ["a", 0, [1]]);
 * // Node API is like an Array:
 * const outer: JsonUnion = imported[0];
 * assert(Tree.is(outer, JsonArray));
 * const inner = outer[0];
 * ```
 * @sealed @internal
 */
export class JsonArray extends _APIExtractorWorkaroundJsonArrayBase {}
{
	type _check = ValidateRecursiveSchema<typeof JsonArray>;
}
