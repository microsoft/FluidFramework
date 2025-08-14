/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Lazy } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { type JsonCompatibleReadOnlyObject, brand } from "../../../util/index.js";

import {
	type TreeNodeSchema,
	NodeKind,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	typeSchemaSymbol,
	type UnhydratedFlexTreeNode,
	getOrCreateInnerNode,
	getKernel,
	type InternalTreeNode,
	type NodeSchemaMetadata,
	type ImplicitAnnotatedAllowedTypes,
	type UnannotateImplicitAllowedTypes,
	type ImplicitAllowedTypes,
	normalizeAllowedTypes,
	unannotateImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	TreeNodeValid,
	type MostDerivedData,
	type TreeNodeSchemaInitializedData,
	type TreeNodeSchemaCorePrivate,
	privateDataSymbol,
	createTreeNodeSchemaPrivateData,
	type FlexContent,
	CompatibilityLevel,
	type TreeNodeSchemaPrivateData,
	convertAllowedTypes,
} from "../../core/index.js";
import { getTreeNodeSchemaInitializedData } from "../../createContext.js";
import { tryGetTreeNodeForField } from "../../getTreeNodeForField.js";
import { createFieldSchema, FieldKind } from "../../fieldSchema.js";
import {
	unhydratedFlexTreeFromInsertable,
	type FactoryContent,
	type InsertableContent,
} from "../../unhydratedFlexTreeFromInsertable.js";
import type {
	RecordNodeCustomizableSchema,
	RecordNodeInsertableData,
	RecordNodePojoEmulationSchema,
	RecordNodeSchema,
	TreeRecordNode,
} from "./recordNodeTypes.js";
import {
	FieldKinds,
	isTreeValue,
	type FlexTreeNode,
	type FlexTreeOptionalField,
} from "../../../feature-libraries/index.js";
import { prepareForInsertion } from "../../prepareForInsertion.js";
import { recordLikeDataToFlexContent } from "../common.js";
import { MapNodeStoredSchema } from "../../../core/index.js";

/**
 * Create a proxy which implements the {@link TreeRecordNode} API.
 * @param proxyTarget - Target object of the proxy.
 * @param customizable - See {@link RecordNodeSchemaOptions.customizable}.
 * @param schema - The schema of the record node.
 */
function createRecordNodeProxy(
	proxyTarget: object,
	customizable: boolean,
	schema: RecordNodeSchema,
): TreeRecordNode {
	const proxy: TreeRecordNode = new Proxy<TreeRecordNode>(proxyTarget as TreeRecordNode, {
		get: (target, key, receiver): unknown => {
			if (typeof key === "symbol") {
				switch (key) {
					// POJO mode records don't have TreeNode's build in members on their targets, so special case them:
					case typeSchemaSymbol: {
						return schema;
					}
					// eslint-disable-next-line import/no-deprecated
					case typeNameSymbol: {
						return schema.identifier;
					}
					case Symbol.iterator: {
						return () => recordIterator(proxy);
					}
					case Symbol.toPrimitive: {
						// Handle string interpolation and coercion to string
						return () => Object.prototype.toString.call(proxy);
					}
					case Symbol.toStringTag: {
						// In order to satisfy deep equality checks in POJO (non-customizable) mode,
						// we cannot override the behavior of this.
						if (customizable) {
							// Generates nicer toString behavior for customizable records.
							// E.g. `[object My.Record]` instead of `[object Object]`.
							return schema.identifier;
						}
						break;
					}
					default: {
						// No-op
					}
				}
			}

			if (typeof key === "string") {
				const innerNode = getOrCreateInnerNode(receiver);
				const field = innerNode.tryGetField(brand(key));
				if (field !== undefined) {
					return tryGetTreeNodeForField(field);
				}
			}

			return undefined;
		},
		set: (target, key, value: InsertableContent | undefined, receiver): boolean => {
			if (typeof key === "symbol") {
				return false;
			}

			const innerNode = getOrCreateInnerNode(receiver);
			const field = innerNode.getBoxed(brand(key)) as FlexTreeOptionalField;
			const kernel = getKernel(receiver);
			const innerSchema = innerNode.context.schema.nodeSchema.get(brand(schema.identifier));
			assert(innerSchema instanceof MapNodeStoredSchema, "Expected MapNodeStoredSchema");

			const mapTree = prepareForInsertion(
				value,
				createFieldSchema(FieldKind.Optional, kernel.schema.info as ImplicitAllowedTypes),
				innerNode.context,
				innerSchema.mapFields,
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

			if (field === undefined) {
				return undefined;
			}

			return {
				value: tryGetTreeNodeForField(field),
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
	const TAllowedTypes extends ImplicitAllowedTypes,
> extends TreeNodeValid<RecordNodeInsertableData<TAllowedTypes>> {
	public static readonly kind = NodeKind.Record;

	public constructor(
		input?: InternalTreeNode | RecordNodeInsertableData<TAllowedTypes> | undefined,
	) {
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

	readonly customizable: boolean;

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

	const {
		identifier,
		info,
		customizable,
		implicitlyConstructable,
		metadata,
		persistedMetadata,
	} = options;

	const lazyChildTypes = new Lazy(() =>
		normalizeAllowedTypes(unannotateImplicitAllowedTypes(info)),
	);
	const lazyAllowedTypesIdentifiers = new Lazy(
		() => new Set([...lazyChildTypes.value].map((type) => type.identifier)),
	);

	let privateData: TreeNodeSchemaPrivateData | undefined;

	class Schema
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
			// Differentiate between the following cases:
			//
			// Case 1: Direct construction (POJO emulation)
			//
			//     const Foo = schemaFactory.record("Foo", schemaFactory.number);
			//
			//     assert.deepEqual(new Foo({ bar: 42 }), { bar: 42 },
			//		   "Prototype chain equivalent to POJO.");
			//
			// Case 2: Subclass construction (Customizable Record)
			//
			// 	   class Foo extends schemaFactory.record("Foo", schemaFactory.number) {}
			//
			// 	   assert.notDeepEqual(new Foo({ bar: 42 }), { bar: 42 },
			// 	       "Subclass prototype chain differs from POJO.");
			//
			// In Case 1 (POJO emulation), the prototype chain match '{}' (proxyTarget = undefined)
			// In Case 2 (Customizable Object), the prototype chain include the user's subclass (proxyTarget = this)
			const proxyTarget = customizable ? instance : {};
			return createRecordNodeProxy(
				proxyTarget,
				customizable,
				this as unknown as RecordNodeSchema,
			) as unknown as Schema;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): UnhydratedFlexTreeNode {
			return unhydratedFlexTreeFromInsertable(input as object, this as typeof Schema);
		}

		protected static override oneTimeSetup(): TreeNodeSchemaInitializedData {
			// First run, do extra validation.
			// TODO: provide a way for TreeConfiguration to trigger this same validation to ensure it gets run early.
			// Scan for shadowing inherited members which won't work, but stop scan early to allow shadowing built in (which seems to work ok).
			{
				let prototype: object = this.prototype;
				// There isn't a clear cleaner way to author this loop.
				while (prototype !== Schema.prototype) {
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

			const schema = this as RecordNodeSchema;
			return getTreeNodeSchemaInitializedData(this, {
				shallowCompatibilityTest,
				toFlexContent: (data: FactoryContent): FlexContent =>
					recordToFlexContent(data, schema),
			});
		}

		public static get allowedTypesIdentifiers(): ReadonlySet<string> {
			return lazyAllowedTypesIdentifiers.value;
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

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
			return Schema.constructorCached?.constructor as unknown as Output;
		}

		public [Symbol.iterator](): IterableIterator<
			[string, TreeNodeFromImplicitAllowedTypes<TUnannotatedAllowedTypes>]
		> {
			return recordIterator(this);
		}
		public get [Symbol.toStringTag](): string {
			return identifier;
		}

		public static get [privateDataSymbol](): TreeNodeSchemaPrivateData {
			return (privateData ??= createTreeNodeSchemaPrivateData(
				this,
				[info],
				(storedOptions) =>
					new MapNodeStoredSchema(
						{
							kind: FieldKinds.optional.identifier,
							types: convertAllowedTypes(info, storedOptions),
							persistedMetadata,
						},
						persistedMetadata,
					),
			));
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
		> &
		TreeNodeSchemaCorePrivate;

	const output: Output = Schema;
	return output;
}

function* recordIterator<TAllowedTypes extends ImplicitAllowedTypes>(
	record: TreeRecordNode<TAllowedTypes>,
): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<TAllowedTypes>]> {
	for (const [key, value] of Object.entries(record)) {
		yield [key, value];
	}
}

/**
 * {@link TreeNodeSchemaInitializedData.shallowCompatibilityTest} for Record nodes.
 */
function shallowCompatibilityTest(data: FactoryContent): CompatibilityLevel {
	if (isTreeValue(data)) {
		return CompatibilityLevel.None;
	}

	if (Symbol.iterator in data) {
		return CompatibilityLevel.None;
	}

	return CompatibilityLevel.Normal;
}

/**
 * {@link TreeNodeSchemaInitializedData.toFlexContent} for Record nodes.
 *
 * Transforms data under a Record schema.
 * @param data - The tree data to be transformed. Must be a Record-like object.
 * @param schema - The schema to comply with.
 */
function recordToFlexContent(data: FactoryContent, schema: RecordNodeSchema): FlexContent {
	if (!(typeof data === "object" && data !== null)) {
		throw new UsageError(`Input data is incompatible with Record schema: ${data}`);
	}

	const fieldsIterator: Iterable<readonly [string, InsertableContent]> = Object.entries(data);
	return recordLikeDataToFlexContent(fieldsIterator, schema);
}
