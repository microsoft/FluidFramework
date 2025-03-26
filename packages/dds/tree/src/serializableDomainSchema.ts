/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	SchemaFactory,
	type FixRecursiveArraySchema,
	type TreeNodeFromImplicitAllowedTypes,
	type ValidateRecursiveSchema,
} from "./simple-tree/index.js";
import type { JsonCompatible } from "./util/index.js";

const sf = new SchemaFactory("com.fluidframework.serializable");

/**
 * Utilities for storing {@link FluidSerializableAsTree.Data|Fluid Serializable data} in {@link TreeNode}s.
 *
 * Same as {@link JsonAsTree} except allows {@link @fluidframework/core-interfaces#(IFluidHandle:interface)}s.
 * @remarks
 * Schema which replicate the Fluid Serializable data model with {@link TreeNode}s.
 *
 * Fluid Serializable data can be imported from the {@link FluidSerializableAsTree.Data|Fluid Serializable format} into this format using {@link TreeAlpha.importConcise} with the {@link FluidSerializableAsTree.(Tree:variable)} schema.
 * @internal
 */
export namespace FluidSerializableAsTree {
	/**
	 * Data which can be serialized by Fluid.
	 * @remarks
	 * Can be encoded as a {@link FluidSerializableAsTree.(Tree:type)} using {@link TreeAlpha.importConcise}.
	 * @internal
	 */
	export type Data = JsonCompatible<IFluidHandle>;

	/**
	 * {@link AllowedTypes} for any content allowed in the {@link FluidSerializableAsTree} domain.
	 * @example
	 * ```typescript
	 * const tree = TreeAlpha.importConcise(FluidSerializableAsTree.Tree, { example: { nested: true }, value: 5 });
	 * ```
	 * @internal
	 */
	export const Tree = [
		() => FluidSerializableObject,
		() => Array,
		...SchemaFactory.leaves,
	] as const;

	/**
	 * @internal
	 */
	export type Tree = TreeNodeFromImplicitAllowedTypes<typeof Tree>;

	/**
	 * Do not use. Exists only as a workaround for {@link https://github.com/microsoft/TypeScript/issues/59550} and {@link https://github.com/microsoft/rushstack/issues/4429}.
	 * @system @internal
	 */
	export const _APIExtractorWorkaroundObjectBase = sf.mapRecursive("object", Tree);

	/**
	 * Arbitrary Fluid Serializable object as a {@link TreeNode}.
	 * @remarks
	 * API of the tree node is more aligned with an es6 map than a JS object using its properties like a map.
	 * @example
	 * ```typescript
	 * // Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
	 * const fromArray = new JsonAsTreeObject([["a", 0]]);
	 * // Using `importConcise` can work better for Fluid Serializable data:
	 * const imported = TreeAlpha.importConcise(FluidSerializableAsTree.Object, { a: 0 });
	 * // Node API is like a Map:
	 * const value = imported.get("a");
	 * ```
	 * @privateRemarks
	 * Due to https://github.com/microsoft/TypeScript/issues/61270 this can't be named `Object`.
	 * @sealed @internal
	 */
	export class FluidSerializableObject extends _APIExtractorWorkaroundObjectBase {}
	{
		type _check = ValidateRecursiveSchema<typeof FluidSerializableObject>;
	}

	/**
	 * D.ts bug workaround, see {@link FixRecursiveArraySchema}.
	 * @privateRemarks
	 * In the past this this had to reference the base type (_APIExtractorWorkaroundArrayBase).
	 * Testing for this in examples/utils/import-testing now shows it has to reference FluidSerializableAsTree.Array instead.
	 * @system @internal
	 */
	export declare type _RecursiveArrayWorkaroundJsonArray = FixRecursiveArraySchema<
		typeof Array
	>;

	/**
	 * Do not use. Exists only as a workaround for {@link https://github.com/microsoft/TypeScript/issues/59550} and {@link https://github.com/microsoft/rushstack/issues/4429}.
	 * @system @internal
	 */
	export const _APIExtractorWorkaroundArrayBase = sf.arrayRecursive("array", Tree);

	/**
	 * Arbitrary Fluid Serializable array as a {@link TreeNode}.
	 * @remarks
	 * This can be imported using {@link TreeAlpha.importConcise}.
	 * @example
	 * ```typescript
	 * // Due to TypeScript restrictions on recursive types, the constructor can be somewhat limiting.
	 * const usingConstructor = new FluidSerializableAsTree.Array(["a", 0, new FluidSerializableAsTree.Array([1])]);
	 * // Using `importConcise` can work better for Fluid Serializable data:
	 * const imported = TreeAlpha.importConcise(FluidSerializableAsTree.Array, ["a", 0, [1]]);
	 * // Node API is like an Array:
	 * const inner: FluidSerializableAsTree.Tree = imported[2];
	 * assert(Tree.is(inner, FluidSerializableAsTree.Array));
	 * const leaf = inner[0];
	 * ```
	 * @sealed @internal
	 */
	export class Array extends _APIExtractorWorkaroundArrayBase {}
	{
		type _check = ValidateRecursiveSchema<typeof Array>;
	}
}
