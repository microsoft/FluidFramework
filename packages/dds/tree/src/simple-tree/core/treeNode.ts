/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { NodeKind, type TreeNodeSchemaClass } from "./treeNodeSchema.js";
// eslint-disable-next-line import/no-deprecated
import { type WithType, typeNameSymbol, type typeSchemaSymbol } from "./withType.js";
import { tryGetTreeNodeSchema } from "./treeNodeKernel.js";

/**
 * A non-{@link NodeKind.Leaf|leaf} SharedTree node. Includes objects, arrays, and maps.
 *
 * @remarks
 * Base type which all nodes extend.
 *
 * This type can be used as a type to indicate/document values which should be tree nodes.
 * Runtime use of this class object (for example when used with `instanceof` or extending it), is not currently supported.
 *
 * There are three ways to get instances of TreeNode:
 *
 * 1. From a {@link TreeView} loading nodes from an existing document, or creating local copies of nodes inserted by a remote collaborator.
 * This case provides an {@link InternalTreeNode} to the constructor: subclasses must not modify how the constructor handles this case.
 *
 * 2. Explicit construction of {@link Unhydrated} nodes using either {@link TreeNodeSchemaClass} as a constructor or {@link TreeNodeSchemaNonClass|TreeNodeSchemaNonClass.create}.
 * Either way the {@link TreeNodeSchema} produced must be produced using a {@link SchemaFactory}.
 *
 * 3. Implicit construction: Several APIs which logically require an unhydrated TreeNode also allow passing in a value which could be used to explicitly construct the node instead.
 * These APIs internally call the constructor with the provided value, so it's really just a special case of the above option.
 * Note that when constructing nodes, sometimes implicit construction is not allowed
 * (either at runtime due to ambiguous types or at compile time due to TypeScript limitations):
 * in such cases, explicit construction must be used.
 *
 * @privateRemarks
 * This is a class not an interface to enable stricter type checking (see {@link TreeNode.#brand})
 * and some runtime enforcement of schema class policy (see the the validation in the constructor).
 * This class is however only `type` exported not value exported, preventing the class object from being used,
 * similar to how interfaces work.
 *
 * Not all node implementations include this in their prototype chain (some hide it with a proxy),
 * and thus cause the default/built in `instanceof` to return false despite our type checking and all other APIs treating them as TreeNodes.
 * This class provides a custom `Symbol.hasInstance` to fix `instanceof` for this class and all classes extending it.
 * For now the type-only export prevents use of `instanceof` on this class (but allows it in subclasses like schema classes).
 * @sealed @public
 */
export abstract class TreeNode implements WithType {
	/**
	 * This is added to prevent TypeScript from implicitly allowing non-TreeNode types to be used as TreeNodes.
	 * @remarks
	 * This field forces TypeScript to use nominal instead of structural typing,
	 * preventing compiler error messages and tools like "add missing properties"
	 * from adding the [type] field as a solution when using a non-TreeNode object where a TreeNode is required.
	 * Instead TreeNodes must be created through the appropriate APIs, see the documentation on {@link TreeNode} for details.
	 *
	 * @privateRemarks
	 * This is a JavaScript private field, so is not accessible from outside this class.
	 * This prevents it from having name collisions with object fields.
	 * Since this is private, the type of this field is stripped in the d.ts file.
	 * To get matching type checking within and from outside the package, the least informative type (`unknown`) is used.
	 * To avoid this having any runtime impact, the field is uninitialized.
	 *
	 * Making this field optional results in different type checking within this project than outside of it, since the d.ts file drops the optional aspect of the field.
	 * This is extra confusing since since the tests get in-project typing for intellisense and separate project checking at build time.
	 * To avoid all this mess, this field is required, not optional.
	 *
	 * Another option would be to use a symbol (possibly as a private field).
	 * That approach ran into some strange difficulties causing SchemaFactory to fail to compile, and was not investigated further.
	 *
	 * The [type] symbol provides a lot of the value this private brand does, but is not all of it:
	 * someone could manually (or via Intellisense auto-implement completion, or in response to a type error)
	 * make an object literal with the [type] field and pass it off as a node: this private brand prevents that.
	 */
	readonly #brand!: unknown;

	/**
	 * Adds a type symbol for stronger typing.
	 * @privateRemarks
	 * Subclasses provide more specific strings for this to get strong typing of otherwise type compatible nodes.
	 * @deprecated Use {@link typeSchemaSymbol} instead.
	 */
	// eslint-disable-next-line import/no-deprecated
	public abstract get [typeNameSymbol](): string;

	/**
	 * Adds a type symbol for stronger typing.
	 * @privateRemarks
	 * Subclasses provide more specific strings for this to get strong typing of otherwise type compatible nodes.
	 */
	public abstract get [typeSchemaSymbol](): TreeNodeSchemaClass;

	/**
	 * Provides `instanceof` support for testing if a value is a `TreeNode`.
	 * @remarks
	 * For more options, like including leaf values or narrowing to collections of schema, use `is` or `schema` from {@link TreeNodeApi}.
	 * @privateRemarks
	 * Due to type-only export, this functionality is not available outside the package.
	 */
	public static [Symbol.hasInstance](value: unknown): value is TreeNode;

	/**
	 * Provides `instanceof` support for all schema classes with public constructors.
	 * @remarks
	 * For more options, like including leaf values or narrowing to collections of schema, use `is` or `schema` from {@link TreeNodeApi}.
	 * @privateRemarks
	 * Despite type-only export, this functionality is available outside the package since it is inherited by subclasses.
	 */
	public static [Symbol.hasInstance]<
		TSchema extends abstract new (
			...args: any[]
		) => TreeNode,
	>(this: TSchema, value: unknown): value is InstanceType<TSchema>;

	public static [Symbol.hasInstance](this: { prototype: object }, value: unknown): boolean {
		const schema = tryGetTreeNodeSchema(value);

		if (schema === undefined || schema.kind === NodeKind.Leaf) {
			return false;
		}

		assert("prototype" in schema, 0x98a /* expected class based schema */);
		return inPrototypeChain(schema.prototype, this.prototype);
	}

	/**
	 * TreeNodes must extend schema classes created by SchemaFactory, and therefore this constructor should not be invoked directly by code outside this package.
	 * @privateRemarks
	 * `token` must be the {@link privateToken} value, which is not package exported.
	 * This is used to detect invalid subclasses.
	 *
	 * All valid subclass should use {@link TreeNodeValid}, but this code doesn't directly reference it to avoid cyclic dependencies.
	 */
	protected constructor(token: unknown) {
		if (token !== privateToken) {
			throw new UsageError("TreeNodes must extend schema classes created by SchemaFactory");
		}
	}
}

/**
 * `token` to pass to {@link TreeNode}'s constructor used to detect invalid subclasses.
 */
export const privateToken = {};

/**
 * Check if the prototype derived's prototype chain contains `base`.
 * @param derived - prototype to check
 * @param base - prototype to search for
 * @returns true iff `base` is in the prototype chain starting at `derived`.
 */
// eslint-disable-next-line @rushstack/no-new-null
export function inPrototypeChain(derived: object | null, base: object): boolean {
	let checking = derived;
	while (checking !== null) {
		if (base === checking) {
			return true;
		}
		checking = Reflect.getPrototypeOf(checking);
	}
	return false;
}
