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
 * Utilities for using storing JSON data in {@link TreeNode}s.
 * @remarks
 * Schema which replicate the JSON data model with {@link TreeNode}s.
 *
 * This allows JSON to be losslessly round-tripped through a tree with the following limitations:
 *
 * 1. Only information that would be preserved by JSON.parse is preserved. This means (among other things) that numbers are limited to JavasScript's numeric precision.
 * 2. The order of fields on an object is not preserved. The resulting order is arbitrary.
 *
 * JSON data can be imported into this format using `JSON.parse` then {@link TreeAlpha.importConcise} with the {@link JsonAsTree.(Tree:variable)} schema.
 *
 * @alpha
 */
export namespace JsonAsTree {
	/**
	 * {@link AllowedTypes} for primitives types allowed in JSON.
	 * @alpha
	 */
	export const Primitive = [
		sf.null,
		sf.boolean,
		sf.number,
		sf.string,
	] as const satisfies AllowedTypes;

	/**
	 * @alpha
	 */
	export type Primitive = TreeNodeFromImplicitAllowedTypes<typeof Primitive>;

	/**
	 * {@link AllowedTypes} for any content allowed in the {@link JsonAsTree} domain.
	 * @example
	 * ```typescript
	 * const tree = TreeAlpha.importConcise(JsonAsTree.Union, { example: { nested: true }, value: 5 });
	 * ```
	 * @alpha
	 */
	export const Tree = [() => JsonObject, () => Array, ...Primitive] as const;

	/**
	 * @alpha
	 */
	export type Tree = TreeNodeFromImplicitAllowedTypes<typeof Tree>;

	/**
	 * Do not use. Exists only as a workaround for {@link https://github.com/microsoft/TypeScript/issues/59550} and {@link https://github.com/microsoft/rushstack/issues/4429}.
	 * @system @alpha
	 */
	export const _APIExtractorWorkaroundJsonObjectBase = sf.mapRecursive("object", Tree);

	/**
	 * Arbitrary JSON object as a {@link TreeNode}.
	 * @remarks
	 * API of the tree node is more aligned with an es6 map than a JS object using its properties like a map.
	 * @example
	 * ```typescript
	 * // Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
	 * const fromArray = new JsonAsTreeObject([["a", 0]]);
	 * // Using `importConcise` can work better for JSON data:
	 * const imported = TreeAlpha.importConcise(JsonAsTree.Object, { a: 0 });
	 * // Node API is like a Map:
	 * const value = imported.get("a");
	 * ```
	 * @privateRemarks
	 * Due to https://github.com/microsoft/TypeScript/issues/61270 this can't be named `Object`.
	 * @sealed @alpha
	 */
	export class JsonObject extends _APIExtractorWorkaroundJsonObjectBase {}
	{
		type _check = ValidateRecursiveSchema<typeof JsonObject>;
	}

	/**
	 * D.ts bug workaround, see {@link FixRecursiveArraySchema}.
	 * @privateRemarks
	 * In the past this this had to reference the base type (_APIExtractorWorkaroundJsonArrayBase).
	 * Testing for this in examples/utils/import-testing now shows it has to reference JsonAsTree.Array instead.
	 * @system @alpha
	 */
	export declare type _RecursiveArrayWorkaroundJsonArray = FixRecursiveArraySchema<
		typeof Array
	>;

	/**
	 * Do not use. Exists only as a workaround for {@link https://github.com/microsoft/TypeScript/issues/59550} and {@link https://github.com/microsoft/rushstack/issues/4429}.
	 * @system @alpha
	 */
	export const _APIExtractorWorkaroundJsonArrayBase = sf.arrayRecursive("array", Tree);

	/**
	 * Arbitrary JSON object as a {@link TreeNode}.
	 * @remarks
	 * This can be worked around by using {@link TreeAlpha.importConcise}.
	 * @example
	 * ```typescript
	 * // Due to TypeScript restrictions on recursive types, the constructor can be somewhat limiting.
	 * const usingConstructor = new JsonAsTree.Array(["a", 0, new JsonAsTree.Array([1])]);
	 * // Using `importConcise` can work better for JSON data:
	 * const imported = TreeAlpha.importConcise(JsonAsTree.Array, ["a", 0, [1]]);
	 * // Node API is like an Array:
	 * const outer: JsonUnion = imported[0];
	 * assert(Tree.is(outer, JsonAsTree.Array));
	 * const inner = outer[0];
	 * ```
	 * @sealed @alpha
	 */
	export class Array extends _APIExtractorWorkaroundJsonArrayBase {}
	{
		type _check = ValidateRecursiveSchema<typeof Array>;
	}
}
