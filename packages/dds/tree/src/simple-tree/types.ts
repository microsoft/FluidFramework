/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import {
	NodeKind,
	type TreeNodeSchema,
	type WithType,
	typeNameSymbol,
} from "./schemaTypes.js";
import {
	type FlexTreeNode,
	type MapTreeNode,
	isFlexTreeNode,
	markEager,
} from "../feature-libraries/index.js";
import { tryGetSimpleNodeSchema } from "./schemaCaching.js";
import { isTreeNode } from "./proxies.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { getFlexSchema } from "./toFlexSchema.js";
import { fail } from "../util/index.js";
import { setFlexNode } from "./proxyBinding.js";
import { tryGetSchema } from "./treeNodeApi.js";

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
 * A non-{@link NodeKind.Leaf|leaf} SharedTree node. Includes objects, arrays, and maps.
 *
 * @remarks
 * Base type which all nodes implement.
 *
 * This can be used as a type to indicate/document values which should be tree nodes.
 * Runtime use of this class object (for example when used with `instanceof` or extending it), is not currently supported.
 *
 * Instances of tree nodes must be created by opening an existing document, inserting values into the document,
 * or by using the constructors and create functions of {@link TreeNodeSchema} produced by {@link SchemaFactory}.
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
	 */
	public abstract get [typeNameSymbol](): string;

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
		const schema = tryGetSchema(value);

		if (schema === undefined || schema.kind === NodeKind.Leaf) {
			return false;
		}

		assert("prototype" in schema, 0x98a /* expected class based schema */);
		return inPrototypeChain(schema.prototype, this.prototype);
	}

	protected constructor() {
		if (!inPrototypeChain(Reflect.getPrototypeOf(this), TreeNodeValid.prototype)) {
			throw new UsageError("TreeNodes must extend schema classes created by SchemaFactory");
		}
	}
}

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

/**
 * Class which all {@link TreeNode}s must extend.
 * Since this is not exported, it allows robust detection of attempts to create TreeNodes which do not go through SchemaFactory which is the only place which exposes classes that extend this.
 *
 * This has static members which schema classes can override to provide schema specific functionality.
 * These static members are only intended to be used / overridden by code within this package, and are used by the various node kinds.
 * Access to these static members has to be done via `this.constructor.staticMember` to support the overrides, and thus can only be used in the constructor, after the base constructor has been invoked.
 */
export abstract class TreeNodeValid<TInput> extends TreeNode {
	/**
	 * Schema classes can override this to control what happens at the end of the constructor.
	 * The return value from this is returned from the constructor, allowing substituting a proxy if desired.
	 *
	 * This is not simply done in the derived constructor to enable:
	 * - this class to access the value which is being returned before it's returned from the constructor.
	 * - the derived class to be provided the input `FlexTreeNode` without relying on a field on the node to hold it.
	 */
	protected static prepareInstance<T>(
		this: typeof TreeNodeValid<T>,
		instance: TreeNodeValid<T>,
		input: FlexTreeNode,
	): TreeNodeValid<T> {
		return instance;
	}

	/**
	 * Schema classes must override to provide an implementation of RawTreeNode construction.
	 */
	protected static buildRawNode<T>(
		this: typeof TreeNodeValid<T>,
		instance: TreeNodeValid<T>,
		input: T,
	): MapTreeNode {
		return fail("Schema must override buildRawNode");
	}

	/**
	 * Schema classes can override to provide a callback that is called once when the first node is constructed.
	 * This is a good place to perform extra validation and cache schema derived data needed for the implementation of the node.
	 */
	protected static oneTimeSetup<T>(this: typeof TreeNodeValid<T>): void {}

	/**
	 * The most derived constructor (the one invoked with the `new` operator, not a parent class constructor invoked with as `super`) used to construct an instance of this type.
	 * @remarks
	 * Captured when an instance is constructed.
	 *
	 * Used to ensure that some derived class (which must override this member, defaulting it to `undefined`) is only instantiated with a single "most derived" class (the constructor actually invoked the the user with `new`).
	 *
	 * Typically this is override in the class that statically implements {@link TreeNodeSchema} to enforce that all nodes using that schema use the same class and not different subclasses of it.
	 *
	 * Also used to detect if oneTimeSetup has run.
	 *
	 * @privateRemarks
	 * This defaults to TreeNodeValid, which is used to trigger an error if not overridden in the derived class.
	 *
	 * The value of this on TreeNodeValid must only be overridden by base classes and never modified.
	 * Ways to enforce this immutability prevent it from being overridden,
	 * so code modifying constructorCached should be extra careful to avoid accidentally modifying the base/inherited value.
	 */
	protected static constructorCached: typeof TreeNodeValid | undefined = TreeNodeValid;

	public constructor(input: TInput | InternalTreeNode) {
		super();
		const schema = this.constructor as typeof TreeNodeValid & TreeNodeSchema;
		assert("constructorCached" in schema, 0x95f /* invalid schema class */);
		if (schema.constructorCached !== schema) {
			if (schema.constructorCached !== undefined) {
				assert(
					schema.constructorCached !== TreeNodeValid,
					0x960 /* Schema class schema must override static constructorCached member */,
				);
				throw new UsageError(
					`Two schema classes were instantiated (${schema.name} and ${schema.constructorCached.name}) which derived from the same SchemaFactory generated class. This is invalid`,
				);
			}

			const flexSchema = getFlexSchema(schema);
			assert(
				tryGetSimpleNodeSchema(flexSchema) === schema,
				0x961 /* Schema class not properly configured */,
			);
			schema.oneTimeSetup();
			// Set the constructorCached on the layer of the prototype chain that declared it.
			// This is necessary to ensure there is only one subclass of that type used:
			// if constructorCached was simply set on `schema`,
			// then a base classes between `schema` (exclusive) and where `constructorCached` is set (inclusive) and other subclasses of them
			// would not see the stored `constructorCached`, and the validation above against multiple derived classes would not work.
			{
				let schemaBase: typeof TreeNodeValid = schema;
				while (!Object.prototype.hasOwnProperty.call(schemaBase, "constructorCached")) {
					schemaBase = Reflect.getPrototypeOf(schemaBase) as typeof TreeNodeValid;
				}
				assert(
					schemaBase.constructorCached === undefined,
					0x962 /* overwriting wrong cache */,
				);
				schemaBase.constructorCached = schema;
			}
		}

		if (isTreeNode(input)) {
			// TODO: update this once we have better support for deep-copying and move operations.
			throw new UsageError(
				"Existing nodes may not be used as the constructor parameter for a new node. The existing node may be used directly instead of creating a new one, used as a child of the new node (if it has not yet been inserted into the tree). If the desired result is copying the provided node, it must be deep copied (since any child node would be parented under both the new and old nodes). Currently no API is provided to make deep copies, but it can be done manually with object spreads - for example `new Foo({...oldFoo})` will work if all fields of `oldFoo` are leaf nodes.",
			);
		}

		const node: FlexTreeNode = isFlexTreeNode(input)
			? input
			: schema.buildRawNode(this, input);
		assert(
			tryGetSimpleNodeSchema(node.schema) === schema,
			0x83b /* building node with wrong schema */,
		);

		const result = schema.prepareInstance(this, node);
		setFlexNode(result, node);
		return result;
	}
}
// Class objects are functions (callable), so we need a strong way to distinguish between `schema` and `() => schema` when used as a `LazyItem`.
markEager(TreeNodeValid);

/**
 * A node type internal to `@fluidframework/tree`.
 * @remarks
 * This type is used in the construction of {@link TreeNode} as an implementation detail, but leaks into the public API due to how schema are implemented.
 * @privateRemarks
 * A {@link FlexTreeNode}. Includes {@link RawTreeNode}s.
 * @sealed @public
 */
export interface InternalTreeNode
	extends ErasedType<"@fluidframework/tree.InternalTreeNode"> {}

export function toFlexTreeNode(node: InternalTreeNode): FlexTreeNode {
	assert(isFlexTreeNode(node), 0x963 /* Invalid InternalTreeNode */);
	return node;
}
