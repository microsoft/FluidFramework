/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WithType, type } from "./schemaTypes.js";

/**
 * Type alias to document which values are un-hydrated.
 *
 * Un-hydrated values are nodes produced from schema's create functions that haven't been inserted into a tree yet.
 *
 * Since un-hydrated nodes become hydrated when inserted, strong typing can't be used to distinguish them.
 * This no-op wrapper is used instead.
 * @public
 */
export type Unhydrated<T> = T;

/**
 * A non-leaf SharedTree node. Includes objects, arrays, and maps.
 *
 * @remarks
 * Base type which all nodes implement.
 *
 * This can be used as a type to indicate/document values which should be tree nodes.
 * Runtime use of this class object (for example when used with `instanceof` or subclassed), is not supported:
 * it may be replaced with an interface or union in the future.
 * @privateRemarks
 * Future changes may replace this with a branded interface if the runtime oddities related to this are not cleaned up.
 *
 * Currently not all node implications include this in their prototype chain (some hide it with a proxy), and thus cause `instanceof` to fail.
 * This results in the runtime and compile time behavior of `instanceof` differing.
 * TypeScript 5.3 allows altering the compile time behavior of `instanceof`.
 * The runtime behavior can be changed by implementing `Symbol.hasInstance`.
 * One of those approaches could be used to resolve this inconsistency if TreeNode is kept as a class.
 * @public
 */
export abstract class TreeNode implements WithType {
	/**
	 * This is added to prevent TypeScript from implicitly allowing non-TreeNode types to be used as TreeNodes.
	 * @privateRemarks
	 * This is a JavaScript private field, so is not accessible from outside this class.
	 * This prevents it from having name collisions with object fields.
	 * Since this is private, the type of this field is stripped in the d.ts file.
	 * To get matching type checking within and from outside the package, the least informative type (`unknown`) is used.
	 * To avoid this having any runtime impact, the field is uninitialized.
	 *
	 * Making this field optional results in different type checking within this project than outside of it, since the d.ts file drops the optional aspect of the field.
	 * This is extra confusing since sin ce the tests get in-project typing for intellisense and separate project checking at build time.
	 * To avoid all this mess, this field is required, not optional.
	 *
	 * Another option would be to use a symbol (possibly as a private field).
	 * That approach ran into some strange difficulties causing SchemaFactory to fail to compile, and was not investigated further.
	 *
	 * TODO: This is disabled due to compilation of this project not targeting es2022,
	 * which causes this to polyfill to use of a weak map which has some undesired runtime overhead.
	 * Consider enabling this for stronger typing after targeting es2022.
	 * The [type] symbol here provides a lot of the value this private brand would, but is not all of it:
	 * someone could manually make an object literal with it and pass it off as a node: this private brand would prevent that.
	 * Another option would be to add a protected or private symbol, which would also get the stronger typing.
	 */
	// readonly #brand!: unknown;

	/**
	 * {@inheritdoc "type"}
	 * @privateRemarks
	 * Subclasses provide more specific strings for this to get strong typing of otherwise type compatible nodes.
	 */
	public abstract get [type](): string;
}
