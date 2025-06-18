/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lazy } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { type JsonCompatibleReadOnlyObject, brand } from "../../../util/index.js";

import {
	type TreeNodeSchema,
	NodeKind,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	typeSchemaSymbol,
	type Context,
	type UnhydratedFlexTreeNode,
	getOrCreateInnerNode,
	getKernel,
	type InternalTreeNode,
} from "../../core/index.js";
import { getUnhydratedContext } from "../../createContext.js";
import { getTreeNodeForField } from "../../getTreeNodeForField.js";
import {
	type NodeSchemaMetadata,
	type TreeNodeFromImplicitAllowedTypes,
	type ImplicitAllowedTypes,
	normalizeAllowedTypes,
	unannotateImplicitAllowedTypes,
	type ImplicitAnnotatedAllowedTypes,
	type UnannotateImplicitAllowedTypes,
	createFieldSchema,
	FieldKind,
} from "../../schemaTypes.js";
import {
	unhydratedFlexTreeFromInsertable,
	type InsertableContent,
} from "../../unhydratedFlexTreeFromInsertable.js";
import { TreeNodeValid, type MostDerivedData } from "../../treeNodeValid.js";
import type {
	RecordNodeCustomizableSchema,
	RecordNodeInsertableData,
	RecordNodePojoEmulationSchema,
	RecordNodeSchema,
	TreeRecordNode,
} from "./recordNodeTypes.js";
import type { FlexTreeNode, FlexTreeOptionalField } from "../../../feature-libraries/index.js";
import { prepareForInsertion } from "../../prepareForInsertion.js";

/**
 * Create a proxy which implements the {@link TreeRecordNode} API.
 * @param proxyTarget - Target object of the proxy. Must provide an own `length` value property
 * (which is not used but must exist for getOwnPropertyDescriptor invariants) and the array functionality from {@link arrayNodePrototype}.
 * Controls the prototype exposed by the produced proxy.
 * @param dispatchTarget - provides the functionally of the node, implementing all fields.
 */
function createRecordNodeProxy(proxyTarget: object, schema: RecordNodeSchema): TreeRecordNode {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeRecordNode = new Proxy<TreeRecordNode>(proxyTarget as TreeRecordNode, {
		get: (target, key, receiver): unknown => {
			if (typeof key === "symbol") {
				// POJO mode records don't have TreeNode's build in members on their targets, so special case them:
				if (key === typeSchemaSymbol) {
					return schema;
				}
				// eslint-disable-next-line import/no-deprecated
				if (key === typeNameSymbol) {
					return schema.identifier;
				}

				return false;
			}

			const innerNode = getOrCreateInnerNode(receiver);
			const field = innerNode.tryGetField(brand(key));
			if (field === undefined) {
				return undefined;
			}

			// TODO: handle customizable?
			return getTreeNodeForField(field);
		},
		set: (target, key, value: InsertableContent | undefined, receiver): boolean => {
			if (typeof key === "symbol") {
				return false;
			}

			const innerNode = getOrCreateInnerNode(receiver);
			const field = innerNode.getBoxed(brand(key)) as FlexTreeOptionalField;
			const kernel = getKernel(receiver);

			const mapTree = prepareForInsertion(
				value,
				createFieldSchema(FieldKind.Optional, kernel.schema.info as ImplicitAllowedTypes),
				innerNode.context,
			);

			field.editor.set(mapTree, field.length === 0);
			return true;
		},
		has: (target, key): boolean => {
			if (typeof key === "symbol") {
				return false;
			}

			const innerNode = getOrCreateInnerNode(proxy);
			const childField = innerNode.tryGetField(brand(key));

			// TODO: handle customizable?
			return childField !== undefined;
		},
		ownKeys: (target) => {
			const innerNode = getOrCreateInnerNode(proxy);
			return [...innerNode.keys()];
		},
		getOwnPropertyDescriptor: (target, key) => {
			if (typeof key === "symbol") {
				return undefined;
			}
			const innerNode = getOrCreateInnerNode(proxy);
			const field = innerNode.tryGetField(brand(key));

			// TODO: handle customizable?
			if (field === undefined) {
				return undefined;
			}

			return {
				value: getTreeNodeForField(field),
				writable: true,
				enumerable: true,
				configurable: true, // Must be 'configurable' if property is absent from proxy target.
			};
		},
		defineProperty(target, key, attributes) {
			throw new UsageError("Shadowing properties of record nodes is not permitted.");
		},
		deleteProperty(target, key) {
			if (typeof key === "symbol") {
				return false;
			}

			const innerNode = getOrCreateInnerNode(proxy);
			const field = innerNode.tryGetField(brand(key)) as FlexTreeOptionalField | undefined;
			if (field === undefined) {
				return false;
			}

			field.editor.set(undefined, field.length === 0);
			return true;
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
}

/**
 * {@link recordSchema} options.
 * @input
 */
export interface RecordSchemaOptions<
	TName extends string,
	TAllowedTypes extends ImplicitAnnotatedAllowedTypes,
	TImplicitlyConstructable extends boolean,
	TCustomMetadata = unknown,
> {
	/**
	 * Unique identifier for this schema within this factory's scope.
	 */
	readonly identifier: TName;

	/**
	 * The kinds of nodes that are allowed as children of this record.
	 */
	readonly info: TAllowedTypes;

	readonly implicitlyConstructable: TImplicitlyConstructable;

	/**
	 * Optional ephemeral metadata for the object node schema.
	 */
	readonly metadata?: NodeSchemaMetadata<TCustomMetadata>;

	/**
	 * Optional persisted metadata for the object node schema.
	 */
	readonly persistedMetadata?: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * Define a {@link TreeNodeSchema} for a {@link TreeRecordNode}.
 *
 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
 * @param persistedMetadata -
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function recordSchema<
	TName extends string,
	const TAllowedTypes extends ImplicitAnnotatedAllowedTypes,
	const TImplicitlyConstructable extends boolean,
	const TCustomMetadata = unknown,
>(
	options: RecordSchemaOptions<
		TName,
		TAllowedTypes,
		TImplicitlyConstructable,
		TCustomMetadata
	>,
) {
	type TUnannotatedAllowedTypes = UnannotateImplicitAllowedTypes<TAllowedTypes>;

	const { identifier, info, implicitlyConstructable, metadata, persistedMetadata } = options;

	// Field set can't be modified after this since derived data is stored in maps.
	Object.freeze(info);

	const lazyChildTypes = new Lazy(() =>
		normalizeAllowedTypes(unannotateImplicitAllowedTypes(info)),
	);
	const lazyAllowedTypesIdentifiers = new Lazy(
		() => new Set([...lazyChildTypes.value].map((type) => type.identifier)),
	);

	let customizable: boolean; // TODO: is this needed?
	let unhydratedContext: Context; // TODO: is this needed?

	class CustomRecordNode
		extends CustomRecordNodeBase<TUnannotatedAllowedTypes>
		implements TreeRecordNode<TUnannotatedAllowedTypes>
	{
		/**
		 * Record-like index signature for the node.
		 */
		[key: string]: TreeNodeFromImplicitAllowedTypes<TUnannotatedAllowedTypes>;

		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			const proxyTarget = customizable ? instance : {};
			return createRecordNodeProxy(
				proxyTarget,
				this as unknown as RecordNodeSchema,
			) as unknown as CustomRecordNode;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): UnhydratedFlexTreeNode {
			return unhydratedFlexTreeFromInsertable(
				input as object,
				this as typeof CustomRecordNode,
			);
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
			customizable = (this as unknown) !== CustomRecordNode;
			const schema = this as unknown as RecordNodeSchema;
			unhydratedContext = getUnhydratedContext(schema);

			// First run, do extra validation.
			// TODO: provide a way for TreeConfiguration to trigger this same validation to ensure it gets run early.
			// Scan for shadowing inherited members which won't work, but stop scan early to allow shadowing built in (which seems to work ok).
			{
				let prototype: object = this.prototype;
				// There isn't a clear cleaner way to author this loop.
				while (prototype !== CustomRecordNode.prototype) {
					for (const key of Object.getOwnPropertyNames(prototype)) {
						if (
							// constructor is a special case, since one is built in on the derived type, and shadowing it works fine since we only use it before fields are applied.
							key !== "constructor" &&
							Reflect.getOwnPropertyDescriptor(prototype, key) !== undefined
						) {
							throw new UsageError(
								`Schema ${identifier} defines an inherited property "${key.toString()}" which could shadow a legal entry. Since child fields are exposed as own properties, shadowing properties of record nodes is not permitted.`,
							);
						}
					}
					// Since this stops at CustomRecordNode, it should never see a null prototype, so this case is safe.
					// Additionally, if the prototype chain is ever messed up such that CustomRecordNode is not in it,
					// the null that would show up here does at least ensure this code throws instead of hanging.
					prototype = Reflect.getPrototypeOf(prototype) as object;
				}
			}

			return unhydratedContext;
		}

		public static get allowedTypesIdentifiers(): ReadonlySet<string> {
			return lazyAllowedTypesIdentifiers.value;
		}

		public static readonly identifier = identifier;
		public static readonly info = info;
		public static readonly implicitlyConstructable: TImplicitlyConstructable =
			implicitlyConstructable;
		public static get childTypes(): ReadonlySet<TreeNodeSchema> {
			return lazyChildTypes.value;
		}
		public static readonly metadata: NodeSchemaMetadata<TCustomMetadata> = metadata ?? {};
		public static readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined =
			persistedMetadata;

		// eslint-disable-next-line import/no-deprecated
		public get [typeNameSymbol](): TName {
			return identifier;
		}
		public get [typeSchemaSymbol](): Output {
			return CustomRecordNode.constructorCached?.constructor as unknown as Output;
		}
	}

	type Output = RecordNodeCustomizableSchema<
		TName,
		TAllowedTypes,
		TImplicitlyConstructable,
		TCustomMetadata
	> &
		RecordNodePojoEmulationSchema<
			TName,
			TAllowedTypes,
			TImplicitlyConstructable,
			TCustomMetadata
		>;

	const output: Output = CustomRecordNode;
	return output;
}
