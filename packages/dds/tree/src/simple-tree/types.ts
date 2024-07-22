/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import {
	NodeKind,
	type TreeNodeSchema,
	type TreeNodeSchemaClass,
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
import { getFlexNode, createKernel, setFlexNode } from "./proxyBinding.js";
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
 * A collection of events that can be emitted by a {@link TreeNode}.
 *
 * @privateRemarks
 * TODO: add a way to subscribe to a specific field (for nodeChanged and treeChanged).
 * Probably have object node and map node specific APIs for this.
 *
 * TODO: ensure that subscription API for fields aligns with API for subscribing to the root.
 *
 * TODO: add more wider area (avoid needing tons of nodeChanged registration) events for use-cases other than treeChanged.
 * Some ideas:
 *
 * - treeChanged, but with some subtrees/fields/paths excluded
 * - helper to batch several nodeChanged calls to a treeChanged scope
 * - parent change (ex: registration on the parent field for a specific index: maybe allow it for a range. Ex: node event takes optional field and optional index range?)
 * - new content inserted into subtree. Either provide event for this and/or enough info to treeChanged to find and search the new sub-trees.
 * Add separate (non event related) API to efficiently scan tree for given set of types (using low level cursor and schema based filtering)
 * to allow efficiently searching for new content (and initial content) of a given type.
 *
 * @sealed @public
 */
export interface TreeChangeEvents {
	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, if a change affected the node, where a
	 * change is:
	 *
	 * - For an object node, when the value of one of its properties changes (i.e., the property's value is set
	 * to something else, including `undefined`).
	 *
	 * - For an array node, when an element is added, removed, or moved.
	 *
	 * - For a map node, when an entry is added, updated, or removed.
	 *
	 * @remarks
	 * This event is not emitted when:
	 *
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will emit this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 *
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is emitted on the _parent_ node, not the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When it is emitted, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 */
	nodeChanged(): void;

	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, when something changed anywhere in the
	 * subtree rooted at it.
	 *
	 * @remarks
	 * This event is not emitted when the node itself is moved to a different location in the tree or removed from the tree.
	 * In that case it is emitted on the _parent_ node, not the node itself.
	 *
	 * The node itself is part of the subtree, so this event will be emitted even if the only changes are to the properties
	 * of the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When it is emitted, the tree is guaranteed to be in-schema.
	 */
	treeChanged(): void;
}

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
	 * This defaults to "default", which is used to trigger an error if not overridden in the derived class.
	 *
	 * The value of this on TreeNodeValid must only be overridden by base classes and never modified.
	 * Ways to enforce this immutability prevent it from being overridden,
	 * so code modifying constructorCached should be extra careful to avoid accidentally modifying the base/inherited value.
	 */
	protected static constructorCached: MostDerivedData | "default" | undefined = "default";

	/**
	 * Indicate that `this` is the most derived version of a schema, and thus the only one allowed to be used (other than by being subclassed a single time).
	 */
	public static markMostDerived(this: typeof TreeNodeValid & TreeNodeSchema): MostDerivedData {
		assert(this.constructorCached !== "default", 0x95f /* invalid schema class */);

		if (this.constructorCached === undefined) {
			// Set the constructorCached on the layer of the prototype chain that declared it.
			// This is necessary to ensure there is only one subclass of that type used:
			// if constructorCached was simply set on `schema`,
			// then a base classes between `schema` (exclusive) and where `constructorCached` is set (inclusive) and other subclasses of them
			// would not see the stored `constructorCached`, and the validation above against multiple derived classes would not work.

			// This is not just an alias of `this`, but a reference to the item in the prototype chain being walked, which happens to start at `this`.
			// eslint-disable-next-line @typescript-eslint/no-this-alias
			let schemaBase: typeof TreeNodeValid = this;
			while (!Object.prototype.hasOwnProperty.call(schemaBase, "constructorCached")) {
				schemaBase = Reflect.getPrototypeOf(schemaBase) as typeof TreeNodeValid;
			}
			assert(schemaBase.constructorCached === undefined, 0x962 /* overwriting wrong cache */);
			schemaBase.constructorCached = { constructor: this, oneTimeInitialized: false };
			assert(
				this.constructorCached === schemaBase.constructorCached,
				0x9b5 /* Inheritance should work */,
			);
			return this.constructorCached;
		} else if (this.constructorCached.constructor === this) {
			return this.constructorCached;
		}

		throw new UsageError(
			`Two schema classes were used (${this.name} and ${
				this.constructorCached.constructor.name
			}) which derived from the same SchemaFactory generated class (${JSON.stringify(
				this.identifier,
			)}). This is invalid.`,
		);
	}

	public constructor(input: TInput | InternalTreeNode) {
		super();
		const schema = this.constructor as typeof TreeNodeValid & TreeNodeSchema;
		const cache = schema.markMostDerived();
		if (!cache.oneTimeInitialized) {
			const flexSchema = getFlexSchema(schema);
			assert(
				tryGetSimpleNodeSchema(flexSchema) === schema,
				0x961 /* Schema class not properly configured */,
			);
			schema.oneTimeSetup();
			cache.oneTimeInitialized = true;
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
		createKernel(result);
		setFlexNode(result, node);
		return result;
	}
}
// Class objects are functions (callable), so we need a strong way to distinguish between `schema` and `() => schema` when used as a `LazyItem`.
markEager(TreeNodeValid);

/**
 * Data cached about the most derived type in a schema's class hierarchy.
 * @remarks
 * The most derived type is the only one allowed to be referenced by other schema or constructed as a node.
 * It has to be discovered lazily (when a node is constructed or when a {@link TreeViewConfiguration} is made),
 * since JavaScript provides no way to find derived classes, or inject static class initialization time logic into base classes.
 * Additionally since schema can reference other schema through lazy references which might be forward or recursive references,
 * this can not be evaluated for one schema when referenced by another schema.
 *
 * See {@link TreeNodeValid.constructorCached} and {@link TreeNodeValid.markMostDerived}.
 */
export interface MostDerivedData {
	readonly constructor: typeof TreeNodeValid & TreeNodeSchema;
	oneTimeInitialized: boolean;
}

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

// #region NodeJS custom inspect for TreeNodes.

/**
 * Used to customize "inspect" behavior in NodeJS.
 * See https://nodejs.org/api/util.html#utilinspectcustom for details.
 *
 * VS-Code's debugger also uses this to inspect objects,
 * see https://github.com/microsoft/vscode-js-debug/blob/64df2686c92bac402909dee5c3c389bbb7a81f6d/src/adapter/templates/getStringyProps.ts#L11 for details.
 */
const customInspectSymbol = Symbol.for("nodejs.util.inspect.custom");

/**
 * Node inspecting function for use with {@link customInspectSymbol}.
 */
function inspectNodeFunction(
	this: TreeNodeValid<unknown>,
	depth: number,
	options?: unknown,
	inspect?: unknown,
): unknown {
	// TODO: replicated from tryGetSchema to avoid cycle.
	// This case could be optimized, for example by placing the simple schema in a symbol on tree nodes.
	const schema = tryGetSimpleNodeSchema(getFlexNode(this).schema) as TreeNodeSchemaClass;
	const title = `${schema.name}: ${NodeKind[schema.kind]} Node (${schema.identifier})`;

	if (depth < 2) {
		const short = shortContent(this);
		if (short !== undefined) {
			return `${title} ${short}`;
		}
		return title;
	}
	const content = `${title} ${JSON.stringify(this)}`;
	return content;
}

/**
 * If the node has no items, a short JSON string for it.
 */
function shortContent(node: TreeNodeValid<unknown>): string | undefined {
	if (Object.values(node).length === 0) {
		return JSON.stringify(node);
	}
	return undefined;
}

/**
 * Add inherited non-enumerable symbol for NodeJS inspection to all nodes.
 *
 * See {@link customInspectSymbol}.
 */
Object.defineProperty(TreeNodeValid.prototype, customInspectSymbol, {
	value: inspectNodeFunction,
	enumerable: false,
});

// #endregion

// #region Browser custom debug format for TreeNodes

// This section has side-effects, so including it in this file ensures its loaded whenever TreeNodes could exist.
// Supported in at least Chrome and FireFox, more details at https://firefox-source-docs.mozilla.org/devtools-user/custom_formatters/index.html
// For this to work the browser's dev tools generally have to "Enable custom formatters".

// This formatter is inspired by https://github.com/andrewdavey/immutable-devtools/blob/master/src/createFormatters.js which provides a similar formatter for the immutable.js library.

const globals = typeof window === "undefined" ? globalThis : window;
const formatters = ((
	globals as { devtoolsFormatters?: DevtoolsFormatter.DevtoolsFormatter[] }
).devtoolsFormatters ??= []);

const nodeFormatter: DevtoolsFormatter.DevtoolsFormatter = {
	header(object, config) {
		if (isTreeNode(object)) {
			return ["span", `${inspectNodeFunction.call(object, 1)}`];
		}
		return null;
	},
	body(object, config): DevtoolsFormatter.Item {
		const children: DevtoolsFormatter.Item[] = [];
		for (const [key, value] of Object.entries(object as TreeNode)) {
			children.push(["li", ["span", `${key}: `], formattedReference(value)]);
		}

		// TODO:
		// for array nodes, this isn't great since (at least in FireFox) the list items show up with a prefixed number starting from 1.
		// This looks messy when followed by the array index.
		// Find a way to hide the list index.
		// { style: 'list-style-type: none` } did not seem to work.

		return ["ol", ...children];
	},
	hasBody(object, config) {
		return shortContent(object as TreeNodeValid<undefined>) === undefined;
	},
};

function formattedReference(
	object: unknown,
	config?: DevtoolsFormatter.ObjectConfig,
): DevtoolsFormatter.Item {
	if (typeof object === "undefined") {
		return ["span", "undefined"];
	} else if (object === "null") {
		return ["span", "null"];
	}

	return ["object", { object, config }];
}

formatters.push(nodeFormatter);

// #endregion

// These types are based on https://github.com/BenjaminAster/Better-TypeScript/blob/main/types/devtools-formatters.d.ts
// however the original package causes multiple compile errors due to some of its other types it used, so the relevant part has been extracted and adjusted to better match our conventions.
declare namespace DevtoolsFormatter {
	type ObjectConfig = Record<string | symbol, unknown>;

	type ElementTagName = "div" | "span" | "ol" | "li" | "table" | "tr" | "td";

	type ElementTemplate = StyledElementTemplate | UnstyledElementTemplate;

	type StyledElementTemplate = readonly [
		ElementTagName,
		{
			style?: string;
		},
		...Item[],
	];

	type UnstyledElementTemplate = readonly [ElementTagName, ...Item[]];

	type ObjectReference = readonly [
		"object",
		{
			object: unknown;
			config?: ObjectConfig;
		},
	];

	type Item = string | ElementTemplate | ObjectReference;

	interface DevtoolsFormatter {
		header(
			object?: unknown,
			config?: ObjectConfig,
			// eslint-disable-next-line @rushstack/no-new-null
		): Item | null;
		hasBody(object?: unknown, config?: ObjectConfig): boolean;
		body(object?: unknown, config?: ObjectConfig): Item;
	}
}
