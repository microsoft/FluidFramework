/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lazy } from "@fluidframework/core-utils/internal";

import type {
	FlexibleNodeContent,
	FlexTreeNode,
	FlexTreeOptionalField,
	OptionalFieldEditBuilder,
} from "../../../feature-libraries/index.js";
import {
	normalizeAllowedTypes,
	unannotateImplicitAllowedTypes,
	type ImplicitAllowedTypes,
	type ImplicitAnnotatedAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeSchemaMetadata,
	type TreeNodeFromImplicitAllowedTypes,
	type UnannotateImplicitAllowedTypes,
} from "../../schemaTypes.js";
import {
	type InnerNode,
	NodeKind,
	type TreeNodeSchema,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	type TreeNode,
	typeSchemaSymbol,
	type Context,
	type UnhydratedFlexTreeNode,
	getOrCreateInnerNode,
	type InternalTreeNode,
} from "../../core/index.js";
import {
	mapTreeFromNodeData,
	type FactoryContent,
	type InsertableContent,
} from "../../toMapTree.js";
import { brand, type RestrictiveStringRecord } from "../../../util/index.js";
import { TreeNodeValid, type MostDerivedData } from "../../treeNodeValid.js";
import { getUnhydratedContext } from "../../createContext.js";
import type {
	RecordNodeCustomizableSchema,
	RecordNodePojoEmulationSchema,
} from "./recordNodeTypes.js";
import { getTreeNodeForField } from "../../getTreeNodeForField.js";

/**
 * A record of string keys to tree objects.
 *
 * @sealed @alpha
 */
export interface TreeRecordNode<_T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeNode {
	// RestrictiveStringRecord<TreeNodeFromImplicitAllowedTypes<T>>
	// TODO
}

// TODO: don't allow shadowing of properties - just methods?

/**
 * Create a proxy which implements the {@link TreeRecordNode} API.
 * @param proxyTarget - Target object of the proxy. Must provide an own `length` value property
 * (which is not used but must exist for getOwnPropertyDescriptor invariants) and the array functionality from {@link arrayNodePrototype}.
 * Controls the prototype exposed by the produced proxy.
 * @param dispatchTarget - provides the functionally of the node, implementing all fields.
 */
function createRecordNodeProxy(proxyTarget: object, dispatchTarget: object): TreeRecordNode {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeRecordNode = new Proxy<TreeRecordNode>(proxyTarget as TreeRecordNode, {
		get: (target, key, receiver) => {
			// TODO: is this right?
			if (typeof key === "symbol") {
				return false;
			}

			const innerNode = getOrCreateInnerNode(receiver);
			const field = innerNode.tryGetField(brand(key));
			if (field === undefined) {
				return false;
			}

			// TODO: handle customizable
			return getTreeNodeForField(field);
		},
		set: (target, key, value: InsertableContent | undefined, receiver) => {
			// TODO: is this right?
			if (typeof key === "symbol") {
				return false;
			}

			const innerNode = getOrCreateInnerNode(receiver);
			const childField = innerNode.tryGetField(brand(key));

			// TODO: handle customizable
			if (childField === undefined) {
				return false;
			}

			// TODO: set data on node
			throw new Error("TODO");
		},
		has: (target, key) => {
			// TODO: is this right?
			if (typeof key === "symbol") {
				return false;
			}
			const innerNode = getOrCreateInnerNode(proxy);
			const childField = innerNode.tryGetField(brand(key));

			// TODO: handle customizable
			return childField !== undefined;
		},
		ownKeys: (target) => {
			const innerNode = getOrCreateInnerNode(proxy);
			// TODO: anything else we need to include here?
			return [...innerNode.keys()];
		},
		getOwnPropertyDescriptor: (target, key) => {
			// TODO: is this right?
			if (typeof key === "symbol") {
				return undefined;
			}
			const innerNode = getOrCreateInnerNode(proxy);
			const field = innerNode.tryGetField(brand(key));

			// TODO: handle customizable
			if (field === undefined) {
				return undefined;
			}

			return {
				value: getTreeNodeForField(field),
				writable: true,
				// Report empty fields as own properties so they shadow inherited properties (even when empty) to match TypeScript typing.
				// Make empty fields not enumerable so they get skipped when iterating over an object to better align with
				// JSON and deep equals with JSON compatible object (which can't have undefined fields).
				enumerable: field !== undefined,
				configurable: true, // Must be 'configurable' if property is absent from proxy target.
			};
		},
		defineProperty(target, key, attributes) {
			// TODO: prevent shadowing of properties?
			return Reflect.defineProperty(dispatchTarget, key, attributes);
		},
	});
	return proxy;
}

abstract class CustomRecordNodeBase<
	const T extends ImplicitAllowedTypes,
> extends TreeNodeValid<RecordNodeInsertableData<T>> {
	public static readonly kind = NodeKind.Record;

	public constructor(input?: InternalTreeNode | RecordNodeInsertableData<T> | undefined) {
		super(input ?? {});
	}

	public [Symbol.iterator](): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]> {
		throw new Error("TODO");
	}

	private get innerNode(): InnerNode {
		return getOrCreateInnerNode(this);
	}

	private editor(key: string): OptionalFieldEditBuilder<FlexibleNodeContent> {
		const field = this.innerNode.getBoxed(brand(key)) as FlexTreeOptionalField;
		return field.editor;
	}

	// TODO
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeRecordNode:interface)}.
 *
 * @param base - base schema type to extend.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function recordSchema<
	TName extends string,
	const T extends ImplicitAnnotatedAllowedTypes,
	const ImplicitlyConstructable extends boolean,
	const TCustomMetadata = unknown,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	metadata?: NodeSchemaMetadata<TCustomMetadata>,
) {
	// Field set can't be modified after this since derived data is stored in maps.
	Object.freeze(info);

	const lazyChildTypes = new Lazy(() =>
		normalizeAllowedTypes(unannotateImplicitAllowedTypes(info)),
	);
	const lazyAllowedTypesIdentifiers = new Lazy(
		() => new Set([...lazyChildTypes.value].map((type) => type.identifier)),
	);

	let unhydratedContext: Context;

	class CustomRecordNode
		extends CustomRecordNodeBase<UnannotateImplicitAllowedTypes<T>>
		implements TreeRecordNode<UnannotateImplicitAllowedTypes<T>>
	{
		/**
		 * Differentiate between the following cases:
		 *
		 * Case 1: Direct construction (POJO emulation)
		 *
		 * ```typescript
		 * const Foo = schemaFactory.record("Foo", schemaFactory.number);
		 * assert.deepEqual(new Foo({ bar: 42 }), { bar: 42 }, "Prototype chain equivalent to POJO.");
		 * ```
		 *
		 * Case 2: Subclass construction (Customizable Object)
		 *
		 * ```typescript
		 * class Foo extends schemaFactory.object("Foo", schemaFactory.number) {}
		 * assert.notDeepEqual(new Foo({ bar: 42 }), { bar: 42 }, "Subclass prototype chain differs from POJO.");
		 * ```
		 *
		 * In Case 1 (POJO emulation), the prototype chain match '\{\}' (proxyTarget = undefined)
		 * In Case 2 (Customizable Object), the prototype chain include the user's subclass (proxyTarget = this)
		 */
		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			const proxyTarget = {};
			// TODO: customizable support
			return createRecordNodeProxy(proxyTarget, instance) as unknown as CustomRecordNode;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): UnhydratedFlexTreeNode {
			return mapTreeFromNodeData(
				input as FactoryContent,
				this as unknown as ImplicitAllowedTypes,
			);
		}

		public static get allowedTypesIdentifiers(): ReadonlySet<string> {
			return lazyAllowedTypesIdentifiers.value;
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
			const schema = this as unknown as TreeNodeSchema;
			unhydratedContext = getUnhydratedContext(schema);

			// TODO: any input validation needed?

			return unhydratedContext;
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: ImplicitlyConstructable =
			implicitlyConstructable;
		public static get childTypes(): ReadonlySet<TreeNodeSchema> {
			return lazyChildTypes.value;
		}
		public static readonly metadata: NodeSchemaMetadata<TCustomMetadata> = metadata ?? {};

		// eslint-disable-next-line import/no-deprecated
		public get [typeNameSymbol](): TName {
			return identifier;
		}
		public get [typeSchemaSymbol](): typeof schemaErased {
			return CustomRecordNode.constructorCached?.constructor as unknown as typeof schemaErased;
		}
	}
	const schemaErased: RecordNodeCustomizableSchema<
		TName,
		T,
		ImplicitlyConstructable,
		TCustomMetadata
	> &
		RecordNodePojoEmulationSchema<TName, T, ImplicitlyConstructable, TCustomMetadata> =
		CustomRecordNode;
	return schemaErased;
}

/**
 * Content which can be used to construct a Record node, explicitly or implicitly.
 * @system @alpha
 */
export type RecordNodeInsertableData<T extends ImplicitAllowedTypes> = RestrictiveStringRecord<
	InsertableTreeNodeFromImplicitAllowedTypes<T>
>;
