/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type TreeNodeSchema,
	NodeKind,
	isTreeNode,
	TreeNodeKernel,
	privateToken,
	TreeNode,
	type InternalTreeNode,
	typeSchemaSymbol,
	type InnerNode,
	type Context,
	type UnhydratedFlexTreeNode,
} from "./core/index.js";
import { type FlexTreeNode, isFlexTreeNode } from "../feature-libraries/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { fail } from "../util/index.js";

import { getSimpleNodeSchemaFromInnerNode } from "./core/index.js";
import { markEager } from "./flexList.js";

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
	): UnhydratedFlexTreeNode {
		return fail(0xae4 /* Schema must override buildRawNode */);
	}

	/**
	 * Schema classes can override to provide a callback that is called once when the first node is constructed.
	 * This is a good place to perform extra validation and cache schema derived data needed for the implementation of the node.
	 */
	protected static oneTimeSetup<T>(this: typeof TreeNodeValid<T>): Context {
		fail(0xae5 /* Missing oneTimeSetup */);
	}

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
			// eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
			let schemaBase: typeof TreeNodeValid = this;
			while (!Object.prototype.hasOwnProperty.call(schemaBase, "constructorCached")) {
				schemaBase = Reflect.getPrototypeOf(schemaBase) as typeof TreeNodeValid;
			}
			assert(schemaBase.constructorCached === undefined, 0x962 /* overwriting wrong cache */);
			schemaBase.constructorCached = { constructor: this, oneTimeInitialized: undefined };
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

	/**
	 * Node creation function for implementing the TreeNodeSchemaNonClass half of TreeNodeSchemaBoth.
	 * @remarks
	 * When used as TreeNodeSchemaNonClass and subclassed,
	 * does not actually have the correct compile time type for the return value due to TypeScript limitations.
	 * This is why this is not exposed as part of TreeNodeSchemaClass where subclassing is allowed.
	 */
	public static create<TInput, TOut, TThis extends new (args: TInput) => TOut>(
		this: TThis,
		input: TInput,
	): TOut {
		return new this(input);
	}

	/**
	 * @see {@link TreeNodeSchemaCore.createFromInsertable}.
	 */
	public static createFromInsertable<TInput, TOut, TThis extends new (args: TInput) => TOut>(
		this: TThis,
		input: TInput,
	): TOut {
		return new this(input);
	}

	public constructor(input: TInput | InternalTreeNode) {
		super(privateToken);
		const schema = this.constructor as typeof TreeNodeValid & TreeNodeSchema;
		const cache = schema.markMostDerived();
		if (cache.oneTimeInitialized === undefined) {
			cache.oneTimeInitialized = schema.oneTimeSetup();
		}

		if (isTreeNode(input)) {
			// TODO: update this once we have better support for deep-copying and move operations.
			throw new UsageError(
				"Existing nodes may not be used as the constructor parameter for a new node. The existing node may be used directly instead of creating a new one, used as a child of the new node (if it has not yet been inserted into the tree). If the desired result is copying the provided node, it must be deep copied (since any child node would be parented under both the new and old nodes). Currently no API is provided to make deep copies, but it can be done manually with object spreads - for example `new Foo({...oldFoo})` will work if all fields of `oldFoo` are leaf nodes.",
			);
		}

		const node: InnerNode = isFlexTreeNode(input) ? input : schema.buildRawNode(this, input);
		assert(
			getSimpleNodeSchemaFromInnerNode(node) === schema,
			0x83b /* building node with wrong schema */,
		);

		const result = schema.prepareInstance(this, node);
		// The TreeNodeKernel associates itself the TreeNode (result here, not node) so it can be looked up later via getKernel.
		// If desired this could be put in a non-enumerable symbol property for lookup instead, but that gets messy going through proxies,
		// so just relying on the WeakMap seems like the cleanest approach.
		new TreeNodeKernel(result, schema, node, cache.oneTimeInitialized);

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
	oneTimeInitialized?: Context;
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
	const schema = this[typeSchemaSymbol];
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
	if (object === undefined) {
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
