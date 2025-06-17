/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Lazy, fail, debugAssert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { FieldKey, SchemaPolicy } from "../../../core/index.js";
import {
	FieldKinds,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
} from "../../../feature-libraries/index.js";
import type {
	RestrictiveStringRecord,
	FlattenKeys,
	JsonCompatibleReadOnlyObject,
} from "../../../util/index.js";

import {
	type TreeNodeSchema,
	NodeKind,
	type WithType,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	typeSchemaSymbol,
	type InternalTreeNode,
	type TreeNode,
	type Context,
	type UnhydratedFlexTreeNode,
	getOrCreateInnerNode,
} from "../../core/index.js";
import { getUnhydratedContext } from "../../createContext.js";
import { getTreeNodeForField } from "../../getTreeNodeForField.js";
import { prepareForInsertion } from "../../prepareForInsertion.js";
import {
	type ImplicitFieldSchema,
	getStoredKey,
	getExplicitStoredKey,
	type TreeFieldFromImplicitField,
	type InsertableTreeFieldFromImplicitField,
	type FieldSchema,
	normalizeFieldSchema,
	FieldKind,
	type NodeSchemaMetadata,
	type FieldSchemaAlpha,
	ObjectFieldSchema,
	type ImplicitAnnotatedFieldSchema,
	unannotateSchemaRecord,
	type UnannotateSchemaRecord,
	type TreeNodeFromImplicitAllowedTypes,
} from "../../schemaTypes.js";
import type { SimpleObjectFieldSchema } from "../../simpleSchema.js";
import {
	unhydratedFlexTreeFromInsertable,
	type InsertableContent,
} from "../../unhydratedFlexTreeFromInsertable.js";
import { TreeNodeValid, type MostDerivedData } from "../../treeNodeValid.js";

/**
 * A {@link TreeNode} which models a TypeScript {@link record | https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type}.
 *
 * @remarks
 * Record nodes consist of a type which specifies which {@link TreeNodeSchema} may appear as child elements (see {@link TreeNodeApi.schema} and {@link SchemaFactory.record}).
 * @public
 */
export type TreeObjectNode<
	T extends ImplicitAllowedTypes,
> = TreeNode & Record<string, TreeNodeFromImplicitAllowedTypes<T>>;

/**
 * Creates a proxy handler for the given schema.
 *
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * TODO: consider implementing this using `Object.preventExtension` instead.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 */
function createProxyHandler(
	schema: ObjectNodeSchema & ObjectNodeSchemaInternalData,
	allowAdditionalProperties: boolean,
): ProxyHandler<TreeNode> {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const handler: ProxyHandler<TreeNode> = {
		get(target, propertyKey, proxy): unknown {
			const fieldInfo = schema.flexKeyMap.get(propertyKey);
			if (fieldInfo !== undefined) {
				const flexNode = getOrCreateInnerNode(proxy);
				debugAssert(() => !flexNode.context.isDisposed() || "FlexTreeNode is disposed");
				const field = flexNode.tryGetField(fieldInfo.storedKey);
				if (field !== undefined) {
					return getTreeNodeForField(field);
				}

				return undefined;
			}

			// POJO mode objects don't have TreeNode's build in members on their targets, so special case them:
			if (propertyKey === typeSchemaSymbol) {
				return schema;
			}
			// eslint-disable-next-line import/no-deprecated
			if (propertyKey === typeNameSymbol) {
				return schema.identifier;
			}

			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(target, propertyKey, proxy);
		},
		set(target, propertyKey, value: InsertableContent | undefined, proxy) {
			const fieldInfo = schema.flexKeyMap.get(propertyKey);
			if (fieldInfo === undefined) {
				// Pass the proxy as the receiver here, so that setters on the prototype receive `proxy` as `this`.
				return allowAdditionalProperties
					? Reflect.set(target, propertyKey, value, proxy)
					: false;
			}

			setField(
				getOrCreateInnerNode(proxy).getBoxed(fieldInfo.storedKey),
				fieldInfo.schema,
				value,
			);
			return true;
		},
		deleteProperty(target, propertyKey): boolean {
			// TODO: supporting delete when it makes sense (custom local fields, and optional field) could be added as a feature in the future.
			throw new UsageError(
				`Object nodes do not support the delete operator. Optional fields can be assigned to undefined instead.`,
			);
		},
		has: (target, propertyKey) => {
			return (
				schema.flexKeyMap.has(propertyKey) ||
				(allowAdditionalProperties ? Reflect.has(target, propertyKey) : false)
			);
		},
		ownKeys: (target) => {
			return [
				...schema.flexKeyMap.keys(),
				...(allowAdditionalProperties ? Reflect.ownKeys(target) : []),
			];
		},
		getOwnPropertyDescriptor: (target, propertyKey) => {
			const fieldInfo = schema.flexKeyMap.get(propertyKey);

			if (fieldInfo === undefined) {
				return allowAdditionalProperties
					? Reflect.getOwnPropertyDescriptor(target, propertyKey)
					: undefined;
			}

			// For some reason, the getOwnPropertyDescriptor is not passed in the receiver, so use a weak map.
			// If a refactoring is done to associated flex tree data with the target not the proxy, this extra map could be removed,
			// and the design would be more compatible with proxyless nodes.
			const proxy = targetToProxy.get(target) ?? fail(0xadd /* missing proxy */);
			const field = getOrCreateInnerNode(proxy).tryGetField(fieldInfo.storedKey);

			const p: PropertyDescriptor = {
				value: field === undefined ? undefined : getTreeNodeForField(field),
				writable: true,
				// Report empty fields as own properties so they shadow inherited properties (even when empty) to match TypeScript typing.
				// Make empty fields not enumerable so they get skipped when iterating over an object to better align with
				// JSON and deep equals with JSON compatible object (which can't have undefined fields).
				enumerable: field !== undefined,
				configurable: true, // Must be 'configurable' if property is absent from proxy target.
			};

			return p;
		},
	};
	return handler;
}

export function setField(
	field: FlexTreeField,
	simpleFieldSchema: FieldSchema,
	value: InsertableContent | undefined,
): void {
	const mapTree = prepareForInsertion(value, simpleFieldSchema, field.context);

	switch (field.schema) {
		case FieldKinds.required.identifier: {
			assert(mapTree !== undefined, 0xa04 /* Cannot set a required field to undefined */);
			const typedField = field as FlexTreeRequiredField;
			typedField.editor.set(mapTree);
			break;
		}
		case FieldKinds.optional.identifier: {
			const typedField = field as FlexTreeOptionalField;
			typedField.editor.set(mapTree, typedField.length === 0);
			break;
		}

		default:
			fail(0xade /* invalid FieldKind */);
	}
}

abstract class CustomObjectNodeBase<
	const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
> extends TreeNodeValid<InsertableObjectFromSchemaRecord<T>> {
	public static readonly kind = NodeKind.Object;
}

/**
 * Define a {@link TreeNodeSchema} for a {@link TreeObjectNode}.
 *
 * @param name - Unique identifier for this schema within this factory's scope.
 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
 * @param persistedMetadata - Optional persisted metadata for the object node schema.
 */
export function objectSchema<
	TName extends string,
	const T extends RestrictiveStringRecord<ImplicitAnnotatedFieldSchema>,
	const ImplicitlyConstructable extends boolean,
	const TCustomMetadata = unknown,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	allowUnknownOptionalFields: boolean,
	metadata?: NodeSchemaMetadata<TCustomMetadata>,
	persistedMetadata?: JsonCompatibleReadOnlyObject | undefined,
): ObjectNodeSchema<TName, T, ImplicitlyConstructable, TCustomMetadata> &
	ObjectNodeSchemaInternalData {
	// Field set can't be modified after this since derived data is stored in maps.
	Object.freeze(info);

	const unannotatedInfo = unannotateSchemaRecord(info);

	// Ensure no collisions between final set of property keys, and final set of stored keys (including those
	// implicitly derived from property keys)
	assertUniqueKeys(identifier, unannotatedInfo);

	// Performance optimization: cache property key => stored key and schema.
	const flexKeyMap: SimpleKeyMap = createFlexKeyMapping(unannotatedInfo);

	const identifierFieldKeys: FieldKey[] = [];
	for (const item of flexKeyMap.values()) {
		if (item.schema.kind === FieldKind.Identifier) {
			identifierFieldKeys.push(item.storedKey);
		}
	}

	const lazyChildTypes = new Lazy(
		() => new Set(Array.from(flexKeyMap.values(), (f) => [...f.schema.allowedTypeSet]).flat()),
	);

	let handler: ProxyHandler<object>;
	let customizable: boolean;
	let unhydratedContext: Context;

	class CustomObjectNode extends CustomObjectNodeBase<UnannotateSchemaRecord<T>> {
		public static readonly fields: ReadonlyMap<
			string,
			FieldSchemaAlpha & SimpleObjectFieldSchema
		> = new Map(
			Array.from(flexKeyMap, ([key, value]) => [
				key as string,
				new ObjectFieldSchema(
					value.schema.kind,
					value.schema.allowedTypes,
					(value.schema as FieldSchemaAlpha).annotatedAllowedTypes,
					{
						...value.schema.props,
						key: getStoredKey(key as string, value.schema),
					},
				),
			]),
		);
		public static readonly flexKeyMap: SimpleKeyMap = flexKeyMap;
		public static readonly storedKeyToPropertyKey: ReadonlyMap<FieldKey, string> = new Map<
			FieldKey,
			string
		>(
			Array.from(flexKeyMap, ([key, value]): [FieldKey, string] => [
				value.storedKey,
				key as string,
			]),
		);
		public static readonly identifierFieldKeys: readonly FieldKey[] = identifierFieldKeys;
		public static readonly allowUnknownOptionalFields: boolean = allowUnknownOptionalFields;

		public static override prepareInstance<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			flexNode: FlexTreeNode,
		): TreeNodeValid<T2> {
			// Differentiate between the following cases:
			//
			// Case 1: Direct construction (POJO emulation)
			//
			//     const Foo = schemaFactory.object("Foo", {bar: schemaFactory.number});
			//
			//     assert.deepEqual(new Foo({ bar: 42 }), { bar: 42 },
			//		   "Prototype chain equivalent to POJO.");
			//
			// Case 2: Subclass construction (Customizable Object)
			//
			// 	   class Foo extends schemaFactory.object("Foo", {bar: schemaFactory.number}) {}
			//
			// 	   assert.notDeepEqual(new Foo({ bar: 42 }), { bar: 42 },
			// 	       "Subclass prototype chain differs from POJO.");
			//
			// In Case 1 (POJO emulation), the prototype chain match '{}' (proxyTarget = undefined)
			// In Case 2 (Customizable Object), the prototype chain include the user's subclass (proxyTarget = this)

			const proxyTarget = customizable ? instance : {};
			const proxy = new Proxy(proxyTarget, handler) as CustomObjectNode;
			targetToProxy.set(proxyTarget, proxy);
			return proxy;
		}

		public static override buildRawNode<T2>(
			this: typeof TreeNodeValid<T2>,
			instance: TreeNodeValid<T2>,
			input: T2,
		): UnhydratedFlexTreeNode {
			return unhydratedFlexTreeFromInsertable(input as object, this as Output);
		}

		protected static override constructorCached: MostDerivedData | undefined = undefined;

		protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
			// One time initialization that required knowing the most derived type (from this.constructor) and thus has to be lazy.
			customizable = (this as unknown) !== CustomObjectNode;
			const schema = this as unknown as ObjectNodeSchema & ObjectNodeSchemaInternalData;
			handler = createProxyHandler(schema, customizable);
			unhydratedContext = getUnhydratedContext(schema);

			// First run, do extra validation.
			// TODO: provide a way for TreeConfiguration to trigger this same validation to ensure it gets run early.
			// Scan for shadowing inherited members which won't work, but stop scan early to allow shadowing built in (which seems to work ok).
			{
				let prototype: object = this.prototype;
				// There isn't a clear cleaner way to author this loop.
				while (prototype !== CustomObjectNode.prototype) {
					for (const [key] of flexKeyMap) {
						if (
							// constructor is a special case, since one is built in on the derived type, and shadowing it works fine since we only use it before fields are applied.
							key !== "constructor" &&
							Reflect.getOwnPropertyDescriptor(prototype, key) !== undefined
						) {
							throw new UsageError(
								`Schema ${identifier} defines an inherited property "${key.toString()}" which shadows a field. Since fields are exposed as own properties, this shadowing will not work, and is an error.`,
							);
						}
					}
					// Since this stops at CustomObjectNode, it should never see a null prototype, so this case is safe.
					// Additionally, if the prototype chain is ever messed up such that CustomObjectNode is not in it,
					// the null that would show up here does at least ensure this code throws instead of hanging.
					prototype = Reflect.getPrototypeOf(prototype) as object;
				}
			}

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
		public static readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined =
			persistedMetadata;

		// eslint-disable-next-line import/no-deprecated
		public get [typeNameSymbol](): TName {
			return identifier;
		}
		public get [typeSchemaSymbol](): Output {
			return CustomObjectNode.constructorCached?.constructor as unknown as Output;
		}
	}
	type Output = typeof CustomObjectNode &
		(new (
			input: InsertableObjectFromAnnotatedSchemaRecord<T> | InternalTreeNode,
		) => TreeObjectNode<UnannotateSchemaRecord<T>, TName>);
	return CustomObjectNode as Output;
}

const targetToProxy: WeakMap<object, TreeNode> = new WeakMap();
