/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, debugAssert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	ObjectNodeStoredSchema,
	type FieldKey,
	type TreeFieldStoredSchema,
} from "../../../core/index.js";
import {
	FieldKinds,
	isTreeValue,
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
import { brand } from "../../../util/index.js";
import type { ObjectSchemaOptionsAlpha } from "../../api/index.js";
import {
	CompatibilityLevel,
	type TreeNodeSchema,
	NodeKind,
	type WithType,
	schemaIdentifierBrand,
	typeSchemaSymbol,
	type InternalTreeNode,
	type TreeNode,
	type UnhydratedFlexTreeNode,
	getInnerNode,
	type NodeSchemaMetadata,
	type ImplicitAllowedTypes,
	TreeNodeValid,
	type MostDerivedData,
	type TreeNodeSchemaInitializedData,
	privateDataSymbol,
	createTreeNodeSchemaPrivateData,
	normalizeAllowedTypes,
	type FlexContent,
	type UnhydratedFlexTreeField,
	createField,
	type TreeNodeSchemaCorePrivate,
	type TreeNodeSchemaPrivateData,
	type TreeNodeSchemaClass,
	type AllowedTypesFull,
} from "../../core/index.js";
import {
	getTreeNodeSchemaInitializedData,
	getUnhydratedContext,
} from "../../createContext.js";
import {
	type ImplicitFieldSchema,
	getStoredKey,
	getExplicitStoredKey,
	type TreeFieldFromImplicitField,
	type InsertableTreeFieldFromImplicitField,
	type FieldSchema,
	FieldSchemaAlpha,
	normalizeFieldSchema,
	FieldKind,
	type FieldProps,
	type ContextualFieldProvider,
	extractFieldProvider,
	isConstant,
	type DefaultProvider,
} from "../../fieldSchema.js";
import { tryGetTreeNodeForField } from "../../getTreeNodeForField.js";
import { prepareForInsertion } from "../../prepareForInsertion.js";
import type { SimpleObjectFieldSchema } from "../../simpleSchema.js";
import { convertFieldKind } from "../../toStoredSchema.js";
import {
	unhydratedFlexTreeFromInsertable,
	unhydratedFlexTreeFromInsertableNode,
	type FactoryContent,
	type FactoryContentObject,
	type InsertableContent,
} from "../../unhydratedFlexTreeFromInsertable.js";

import type {
	ObjectNodeSchema,
	ObjectNodeSchemaInternalData,
	ObjectNodeSchemaPrivate,
} from "./objectNodeTypes.js";

/**
 * Generates the properties for an ObjectNode from its field schema object.
 * @remarks
 * Due to {@link https://github.com/microsoft/TypeScript/issues/43826}, we can't enable implicit construction of {@link TreeNode|TreeNodes} for setters.
 * Therefore code assigning to these fields must explicitly construct nodes using the schema's constructor or create method,
 * or using some other method like {@link (TreeAlpha:interface).create}.
 * @system @public
 */
export type ObjectFromSchemaRecord<T extends RestrictiveStringRecord<ImplicitFieldSchema>> =
	RestrictiveStringRecord<ImplicitFieldSchema> extends T
		? {}
		: {
				-readonly [Property in keyof T]: Property extends string
					? TreeFieldFromImplicitField<T[Property]>
					: unknown;
			};

/**
 * A {@link TreeNode} which models a JavaScript object.
 * @remarks
 * Object nodes consist of a type which specifies which {@link TreeNodeSchema} they use (see {@link TreeNodeApi.schema} and {@link SchemaFactory.object}),
 * and a collections of fields, each with a distinct `key` and its own {@link FieldSchema} defining what can be placed under that key.
 *
 * All fields on an object node are exposed as own properties with string keys.
 * Non-empty fields are enumerable and empty optional fields are non-enumerable own properties with the value `undefined`.
 * No other own `own` or `enumerable` properties are included on object nodes unless the user of the node manually adds custom session only state.
 * This allows a majority of general purpose JavaScript object processing operations (like `for...in`, `Reflect.ownKeys()` and `Object.entries()`) to enumerate all the children.
 *
 * Field Assignment and Deletion
 * Assigning to a field updates the tree value as long as it is still valid based on the schema.
 * - For required fields, assigning `undefined` is invalid, and will throw.
 * - For optional fields, assigning `undefined` removes the field's contents, and marks it as empty (non-enumerable and value set to undefined).
 *
 * Example:
 * ```ts
 * const Foo = schemaFactory.object("Foo", {bar: schemaFactory.optional(schemaFactory.number)});
 * const node = new Foo({bar: 1})
 *
 * // This clears the field, is non-enumerable, and value is undefined.
 * delete node.bar;
 *
 * // This is equivalent to the delete example.
 * node.bar = undefined
 * ```
 *
 * The API for fields is defined by {@link ObjectFromSchemaRecord}.
 * @public
 */
export type TreeObjectNode<
	T extends RestrictiveStringRecord<ImplicitFieldSchema>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecord<T> & WithType<TypeName, NodeKind.Object, T>;

/**
 * Type utility for determining if an implicit field schema is known to have a default value.
 *
 * @remarks Yields `false` when unknown.
 *
 * @privateRemarks
 * This checks for:
 * 1. Optional fields (which have an implicit undefined default)
 * 2. Identifier fields (which have auto-generated defaults)
 *
 * Note that this cannot tell if required fields have defaults. Use `FieldHasDefaultAlpha` for alpha schemas if you need to check for required field defaults.
 *
 * @system @public
 */
export type FieldHasDefault<T extends ImplicitFieldSchema> = [T] extends [
	FieldSchema<FieldKind.Optional | FieldKind.Identifier>,
]
	? true
	: false;

/**
 * Type utility for determining if an implicit field schema is known to have a default value.
 * Supports alpha field schemas with explicit default providers.
 *
 * @remarks Yields `false` when unknown.
 *
 * @privateRemarks
 * This checks for:
 * 1. Fields with explicit default providers (computed from the props type)
 * 2. Optional fields (which have an implicit undefined default)
 * 3. Identifier fields (which have auto-generated defaults)
 *
 * @system @alpha
 */
export type FieldHasDefaultAlpha<T extends ImplicitFieldSchema> =
	// Extract Kind and TProps from FieldSchemaAlpha and compute whether it has a default
	[T] extends [FieldSchemaAlpha<infer Kind, infer _Types, infer _Meta, infer TProps>]
		? // Optional and Identifier kinds always have defaults
			Kind extends FieldKind.Optional | FieldKind.Identifier
			? true
			: // Check if props has defaultProvider
				TProps extends { defaultProvider: DefaultProvider }
				? true
				: false
		: // Fallback to base FieldHasDefault for non-Alpha schemas
			FieldHasDefault<T>;

/**
 * Helper used to produce types for:
 *
 * 1. Insertable content which can be used to construct an object node.
 * In this case, only own properties are considered.
 * This reduces the risk of incorrectly interpreting data at the cost of occasionally requiring users to convert data into a compatible format.
 *
 * 2. Insertable content which is an unhydrated object node.
 *
 * 3. Union of 1 and 2.
 *
 * @see {@link Input}
 *
 * @privateRemarks
 * TODO: consider separating these cases into different types.
 *
 * Empty objects don't get "no excess property" checks in literals.
 * To prevent extraneous properties in literals for the fields of an empty object from compiling, the empty case is special cased to produce `Record<string, never>`.
 * More details at {@link https://mercury.com/blog/creating-an-emptyobject-type-in-typescript}.
 *
 * Additionally when T is exactly `RestrictiveStringRecord<ImplicitFieldSchema>` produce just `never` so that it is assignable to the insertable for any given object type.
 *
 * Separating `{}` from `RestrictiveStringRecord<ImplicitFieldSchema>` is a bit messy since both extend each-other despite them being very different types.
 * A third dummy type `{ arbitraryKey: "arbitraryValue" }` is used to resolve this.
 *
 * @system @public
 */
export type InsertableObjectFromSchemaRecord<
	T extends RestrictiveStringRecord<ImplicitFieldSchema>,
> =
	RestrictiveStringRecord<ImplicitFieldSchema> extends T
		? { arbitraryKey: "arbitraryValue" } extends T
			? // {} case
				Record<string, never>
			: // RestrictiveStringRecord<ImplicitFieldSchema> case
				never
		: FlattenKeys<
				{
					readonly [Property in keyof T]?: InsertableTreeFieldFromImplicitField<
						T[Property & string]
					>;
				} & {
					// Field does not have a known default, make it required:
					readonly [Property in keyof T as FieldHasDefault<T[Property & string]> extends false
						? Property
						: never]: InsertableTreeFieldFromImplicitField<T[Property & string]>;
				}
			>;

/**
 * Alpha version of InsertableObjectFromSchemaRecord that supports field defaults.
 *
 * @system @alpha
 */
export type InsertableObjectFromSchemaRecordAlpha<
	T extends RestrictiveStringRecord<ImplicitFieldSchema>,
> =
	RestrictiveStringRecord<ImplicitFieldSchema> extends T
		? { arbitraryKey: "arbitraryValue" } extends T
			? // {} case
				Record<string, never>
			: // RestrictiveStringRecord<ImplicitFieldSchema> case
				never
		: FlattenKeys<
				{
					readonly [Property in keyof T]?: InsertableTreeFieldFromImplicitField<
						T[Property & string]
					>;
				} & {
					// Field does not have a known default, make it required:
					readonly [Property in keyof T as FieldHasDefaultAlpha<
						T[Property & string]
					> extends false
						? Property
						: never]: InsertableTreeFieldFromImplicitField<T[Property & string]>;
				}
			>;

/**
 * Maps from simple field keys ("property" keys) to information about the field.
 *
 * @remarks
 * A missing entry for a given property key indicates that no such field exists.
 * Keys with symbols are currently never used, but allowed to make lookups on non-field things
 * (returning undefined) easier.
 */
export type SimpleKeyMap = ReadonlyMap<
	string | symbol,
	{ storedKey: FieldKey; schema: FieldSchema }
>;

/**
 * Caches the mappings from property keys to stored keys for the provided object field schemas in {@link simpleKeyToFlexKeyCache}.
 */
function createFlexKeyMapping(fields: Record<string, ImplicitFieldSchema>): SimpleKeyMap {
	const keyMap: Map<string | symbol, { storedKey: FieldKey; schema: FieldSchema }> = new Map();
	for (const [propertyKey, fieldSchema] of Object.entries(fields)) {
		const schema = normalizeFieldSchema(fieldSchema);
		const storedKey = getStoredKey(propertyKey, schema);
		keyMap.set(propertyKey, { storedKey, schema });
	}

	return keyMap;
}

/**
 * Proxy handler for object nodes of a given schema.
 * @remarks
 * The traps are prototype methods rather than closures so that each schema only needs one small handler object.
 *
 * To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
 * prototype as an object literal `{}`.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
 * as a way to quickly reject objects with different prototype chains.
 *
 * (Note that the prototype of an object literal appears as `[Object: null prototype] {}`, not because
 * the prototype is null, but because the prototype object itself has a null prototype.)
 *
 * TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
 * a dispatch object to see if it improves performance.
 */
class ObjectProxyHandler implements ProxyHandler<TreeNode> {
	private readonly flexKeyMap: SimpleKeyMap;

	/**
	 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
	 * Otherwise setting of unexpected properties will error.
	 * This is also used to select the proxy target: customizable (subclassed) schema use the node itself, others use `{}`.
	 * TODO: consider implementing this using `Object.preventExtension` instead.
	 */
	public constructor(
		private readonly schema: ObjectNodeSchemaPrivate,
		public readonly allowAdditionalProperties: boolean,
	) {
		this.flexKeyMap = schema.flexKeyMap;
	}

	public get(target: TreeNode, propertyKey: string | symbol, proxy: TreeNode): unknown {
		const fieldInfo = this.flexKeyMap.get(propertyKey);
		if (fieldInfo !== undefined) {
			const flexNode = getInnerNode(proxy);
			debugAssert(() => !flexNode.context.isDisposed() || "FlexTreeNode is disposed");
			const field = flexNode.tryGetField(fieldInfo.storedKey);
			if (field !== undefined) {
				return tryGetTreeNodeForField(field);
			}

			return undefined;
		}

		// POJO mode objects don't have TreeNode's built in members on their targets, so special case them:
		if (propertyKey === typeSchemaSymbol) {
			return this.schema;
		}
		if (propertyKey === schemaIdentifierBrand) {
			return this.schema.identifier;
		}

		// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
		return Reflect.get(target, propertyKey, proxy);
	}

	public set(
		target: TreeNode,
		propertyKey: string | symbol,
		value: InsertableContent | undefined,
		proxy: TreeNode,
	): boolean {
		const fieldInfo = this.flexKeyMap.get(propertyKey);
		if (fieldInfo === undefined) {
			// Pass the proxy as the receiver here, so that setters on the prototype receive `proxy` as `this`.
			return this.allowAdditionalProperties
				? Reflect.set(target, propertyKey, value, proxy)
				: false;
		}

		applyFieldChange(this.schema, { kind: "proxy", node: proxy }, fieldInfo, value);
		return true;
	}

	public deleteProperty(target: TreeNode, propertyKey: string | symbol): boolean {
		const fieldInfo = this.flexKeyMap.get(propertyKey);
		if (fieldInfo === undefined) {
			return this.allowAdditionalProperties
				? Reflect.deleteProperty(target, propertyKey)
				: false;
		}

		applyFieldChange(this.schema, { kind: "target", node: target }, fieldInfo, undefined);
		return true;
	}

	public has(target: TreeNode, propertyKey: string | symbol): boolean {
		return (
			this.flexKeyMap.has(propertyKey) ||
			(this.allowAdditionalProperties ? Reflect.has(target, propertyKey) : false)
		);
	}

	public ownKeys(target: TreeNode): (string | symbol)[] {
		return [
			...this.flexKeyMap.keys(),
			...(this.allowAdditionalProperties ? Reflect.ownKeys(target) : []),
		];
	}

	public getOwnPropertyDescriptor(
		target: TreeNode,
		propertyKey: string | symbol,
	): PropertyDescriptor | undefined {
		const fieldInfo = this.flexKeyMap.get(propertyKey);

		if (fieldInfo === undefined) {
			return this.allowAdditionalProperties
				? Reflect.getOwnPropertyDescriptor(target, propertyKey)
				: undefined;
		}

		// For some reason, the getOwnPropertyDescriptor is not passed in the receiver, so use a weak map.
		// If a refactoring is done to associated flex tree data with the target not the proxy, this extra map could be removed,
		// and the design would be more compatible with proxyless nodes.
		const proxy = targetToProxy.get(target) ?? fail(0xadd /* missing proxy */);
		const field = getInnerNode(proxy).tryGetField(fieldInfo.storedKey);

		const p: PropertyDescriptor = {
			value: field === undefined ? undefined : tryGetTreeNodeForField(field),
			writable: true,
			// Report empty fields as own properties so they shadow inherited properties (even when empty) to match TypeScript typing.
			// Make empty fields not enumerable so they get skipped when iterating over an object to better align with
			// JSON and deep equals with JSON compatible object (which can't have undefined fields).
			enumerable: field !== undefined,
			configurable: true, // Must be 'configurable' if property is absent from proxy target.
		};

		return p;
	}
}

export function setField(
	field: FlexTreeField,
	simpleFieldSchema: FieldSchema,
	value: InsertableContent | undefined,
	destinationSchema: TreeFieldStoredSchema,
): void {
	const mapTree = prepareForInsertion(
		value,
		simpleFieldSchema,
		field.context,
		destinationSchema,
	);

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

		default: {
			fail(0xade /* invalid FieldKind */);
		}
	}
}

/**
 * {@link FieldSchemaAlpha} including {@link SimpleObjectFieldSchema}.
 */
export class ObjectFieldSchema<
		Kind extends FieldKind,
		Types extends ImplicitAllowedTypes,
		TCustomMetadata = unknown,
		TProps extends FieldProps<TCustomMetadata> & {
			readonly key: string;
		} = FieldProps<TCustomMetadata> & { readonly key: string },
	>
	extends FieldSchemaAlpha<Kind, Types, TCustomMetadata, TProps>
	implements SimpleObjectFieldSchema
{
	public readonly storedKey: string;

	public constructor(kind: Kind, allowedTypes: Types, props: TProps) {
		super(kind, allowedTypes, props);
		this.storedKey = props.key;
	}
}

/**
 * Key of the {@link ObjectNodeSchemaData} static on object node schema classes.
 */
const objectNodeDataSymbol: unique symbol = Symbol("objectNodeData");

/**
 * Data derived from the fields of an object node schema.
 * @remarks
 * All object node schema without fields share {@link emptyFieldData}.
 */
interface ObjectNodeFieldData {
	/**
	 * Cache for {@link CustomObjectNodeBase.fields}, computed on first use (see {@link getFields}).
	 */
	fields: ReadonlyMap<string, FieldSchemaAlpha & SimpleObjectFieldSchema> | undefined;
	readonly flexKeyMap: SimpleKeyMap;
	/**
	 * Cache for {@link CustomObjectNodeBase.storedKeyToPropertyKey}, computed on first use.
	 */
	storedKeyToPropertyKey: ReadonlyMap<FieldKey, string> | undefined;
	readonly identifierFieldKeys: readonly FieldKey[];
	readonly childAllowedTypes: readonly AllowedTypesFull[];
	/**
	 * Cache for {@link CustomObjectNodeBase.childTypes}, computed on first use.
	 */
	childTypes: ReadonlySet<TreeNodeSchema> | undefined;
}

/**
 * Everything specific to one object node schema.
 * @remarks
 * Each schema class stores this in a single static property (besides `constructorCached`),
 * and the static members and methods of the schema are implemented once, on {@link CustomObjectNodeBase}, in terms of it.
 * This keeps each schema class cheap, which matters for schemas with many object node schema such as large schemas with many enum values.
 */
interface ObjectNodeSchemaData {
	readonly identifier: string;
	readonly info: RestrictiveStringRecord<ImplicitFieldSchema>;
	readonly implicitlyConstructable: boolean;
	readonly metadata: NodeSchemaMetadata;
	readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;
	readonly allowUnknownOptionalFields: boolean;
	readonly fieldData: ObjectNodeFieldData;
	/**
	 * The value of nodes of schema created by {@link singletonObjectSchema}.
	 */
	readonly singletonValue: string | number | undefined;
	/**
	 * If true, nodes use themselves as the target of their proxy (and allow additional properties) even when the schema class is not subclassed.
	 * @remarks
	 * Otherwise this is only done when the schema class is subclassed: see {@link CustomObjectNodeBase.prepareInstance}.
	 */
	readonly alwaysCustomizable: boolean;
	/**
	 * The class created for this schema.
	 * @remarks
	 * The most derived schema class is either this class or a subclass of it.
	 */
	nodeClass: { readonly prototype: object } | undefined;
	/**
	 * Set by {@link CustomObjectNodeBase.oneTimeSetup}.
	 */
	handler: ObjectProxyHandler | undefined;
	/**
	 * Cache for {@link CustomObjectNodeBase.[privateDataSymbol]}.
	 */
	privateData: TreeNodeSchemaPrivateData | undefined;
}

/**
 * Prevents modification of a collection which is shared between schemas.
 * @remarks
 * `Object.freeze` alone does not prevent modifying the content of Maps and Sets.
 */
function freezeSharedCollection<T extends object>(collection: T): T {
	for (const method of ["set", "add", "delete", "clear"]) {
		if (method in collection) {
			Object.defineProperty(collection, method, {
				value: (): never => fail("Collections shared between schemas must not be modified"),
			});
		}
	}
	return Object.freeze(collection);
}

const emptyFieldData: ObjectNodeFieldData = Object.freeze({
	fields: freezeSharedCollection(new Map()),
	flexKeyMap: freezeSharedCollection(new Map()),
	storedKeyToPropertyKey: freezeSharedCollection(new Map()),
	identifierFieldKeys: Object.freeze([]),
	childAllowedTypes: Object.freeze([]),
	childTypes: freezeSharedCollection(new Set<TreeNodeSchema>()),
});

const emptyMetadata: NodeSchemaMetadata = Object.freeze({});

function createFieldData(
	info: RestrictiveStringRecord<ImplicitFieldSchema>,
): ObjectNodeFieldData {
	if (Object.keys(info).length === 0) {
		return emptyFieldData;
	}

	// Performance optimization: cache property key => stored key and schema.
	const flexKeyMap: SimpleKeyMap = createFlexKeyMapping(info);

	const identifierFieldKeys: FieldKey[] = [];
	for (const item of flexKeyMap.values()) {
		if (item.schema.kind === FieldKind.Identifier) {
			identifierFieldKeys.push(item.storedKey);
		}
	}

	return {
		fields: undefined,
		flexKeyMap,
		storedKeyToPropertyKey: undefined,
		identifierFieldKeys,
		// The same (cached) normalized allowed types as the corresponding entries of `fields` have.
		childAllowedTypes: Array.from(flexKeyMap.values(), (value) =>
			normalizeAllowedTypes(value.schema.allowedTypes),
		),
		childTypes: undefined,
	};
}

/**
 * {@link CustomObjectNodeBase.fields}, created on first use: many schemas never need it.
 */
function getFields(
	fieldData: ObjectNodeFieldData,
): ReadonlyMap<string, FieldSchemaAlpha & SimpleObjectFieldSchema> {
	return (fieldData.fields ??= new Map(
		Array.from(fieldData.flexKeyMap, ([key, value]) => [
			key as string,
			new ObjectFieldSchema(value.schema.kind, value.schema.allowedTypes, {
				...value.schema.props,
				key: getStoredKey(key as string, value.schema),
			}),
		]),
	));
}

/**
 * {@link CustomObjectNodeBase.storedKeyToPropertyKey}, created on first use.
 */
function getStoredKeyToPropertyKey(
	fieldData: ObjectNodeFieldData,
): ReadonlyMap<FieldKey, string> {
	return (fieldData.storedKeyToPropertyKey ??= new Map(
		Array.from(fieldData.flexKeyMap, ([key, value]): [FieldKey, string] => [
			value.storedKey,
			key as string,
		]),
	));
}

function createObjectNodeSchemaData(
	identifier: string,
	info: RestrictiveStringRecord<ImplicitFieldSchema>,
	implicitlyConstructable: boolean,
	nodeOptions: ObjectSchemaOptionsAlpha,
	singleton: { readonly value: string | number } | undefined,
): ObjectNodeSchemaData {
	return {
		identifier,
		info,
		implicitlyConstructable,
		metadata: nodeOptions.metadata ?? emptyMetadata,
		persistedMetadata: nodeOptions.persistedMetadata,
		allowUnknownOptionalFields: nodeOptions.allowUnknownOptionalFields ?? false,
		fieldData: createFieldData(info),
		singletonValue: singleton?.value,
		alwaysCustomizable: singleton !== undefined,
		nodeClass: undefined,
		handler: undefined,
		privateData: undefined,
	};
}

/**
 * Base class for all object node schema classes.
 * @remarks
 * Implements the schema's static members and methods using the {@link ObjectNodeSchemaData} of the schema,
 * so the classes created for each schema only need to declare that data.
 */
abstract class CustomObjectNodeBase<
	const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
> extends TreeNodeValid<InsertableObjectFromSchemaRecord<T>> {
	public static readonly kind = NodeKind.Object;

	public declare static readonly [objectNodeDataSymbol]: ObjectNodeSchemaData;

	protected declare static constructorCached: MostDerivedData | undefined;

	public static get identifier(): string {
		return this[objectNodeDataSymbol].identifier;
	}
	public static get info(): RestrictiveStringRecord<ImplicitFieldSchema> {
		return this[objectNodeDataSymbol].info;
	}
	public static get implicitlyConstructable(): boolean {
		return this[objectNodeDataSymbol].implicitlyConstructable;
	}
	public static get metadata(): NodeSchemaMetadata {
		return this[objectNodeDataSymbol].metadata;
	}
	public static get persistedMetadata(): JsonCompatibleReadOnlyObject | undefined {
		return this[objectNodeDataSymbol].persistedMetadata;
	}
	public static get allowUnknownOptionalFields(): boolean {
		return this[objectNodeDataSymbol].allowUnknownOptionalFields;
	}
	public static get fields(): ReadonlyMap<string, FieldSchemaAlpha & SimpleObjectFieldSchema> {
		return getFields(this[objectNodeDataSymbol].fieldData);
	}
	public static get flexKeyMap(): SimpleKeyMap {
		return this[objectNodeDataSymbol].fieldData.flexKeyMap;
	}
	public static get storedKeyToPropertyKey(): ReadonlyMap<FieldKey, string> {
		return getStoredKeyToPropertyKey(this[objectNodeDataSymbol].fieldData);
	}
	public static get identifierFieldKeys(): readonly FieldKey[] {
		return this[objectNodeDataSymbol].fieldData.identifierFieldKeys;
	}
	public static get childTypes(): ReadonlySet<TreeNodeSchema> {
		const fieldData = this[objectNodeDataSymbol].fieldData;
		return (fieldData.childTypes ??= new Set(
			Array.from(fieldData.flexKeyMap.values(), (f) => [...f.schema.allowedTypeSet]).flat(),
		));
	}

	public static get [privateDataSymbol](): TreeNodeSchemaPrivateData {
		const data = this[objectNodeDataSymbol];
		return (data.privateData ??= createTreeNodeSchemaPrivateData(
			this as unknown as TreeNodeSchema,
			data.fieldData.childAllowedTypes,
		));
	}

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
		//
		// The handler is created by oneTimeSetup, which the TreeNodeValid constructor runs before this.

		const handler =
			(this as unknown as typeof CustomObjectNodeBase)[objectNodeDataSymbol].handler ??
			fail("Object node proxy handler should be created in oneTimeSetup");
		const proxyTarget = handler.allowAdditionalProperties ? instance : {};
		const proxy = new Proxy(proxyTarget as TreeNode, handler);
		targetToProxy.set(proxyTarget, proxy);
		return proxy as TreeNodeValid<T2>;
	}

	public static override buildRawNode<T2>(
		this: typeof TreeNodeValid<T2>,
		instance: TreeNodeValid<T2>,
		input: T2,
	): UnhydratedFlexTreeNode {
		return unhydratedFlexTreeFromInsertable(
			input as object,
			this as unknown as TreeNodeSchema,
		);
	}

	protected static override oneTimeSetup(): TreeNodeSchemaInitializedData {
		// One time initialization that required knowing the most derived type (from this.constructor) and thus has to be lazy.
		const data = this[objectNodeDataSymbol];
		const nodeClass = data.nodeClass ?? fail("Object node schema class should be recorded");
		const customizable = data.alwaysCustomizable || this !== nodeClass;
		const schema = this as unknown as ObjectNodeSchemaPrivate;
		data.handler = new ObjectProxyHandler(schema, customizable);

		// First run, do extra validation.
		// TODO: provide a way for TreeConfiguration to trigger this same validation to ensure it gets run early.
		// Scan for shadowing inherited members which won't work, but stop scan early to allow shadowing built in (which seems to work ok).
		{
			let prototype: object = this.prototype;
			// There isn't a clear cleaner way to author this loop.
			while (prototype !== nodeClass.prototype) {
				for (const [key] of data.fieldData.flexKeyMap) {
					if (
						// constructor is a special case, since one is built in on the derived type, and shadowing it works fine since we only use it before fields are applied.
						key !== "constructor" &&
						Reflect.getOwnPropertyDescriptor(prototype, key) !== undefined
					) {
						throw new UsageError(
							`Schema ${data.identifier} defines an inherited property "${key.toString()}" which shadows a field. Since fields are exposed as own properties, this shadowing will not work, and is an error.`,
						);
					}
				}
				// Since this stops at the schema's class, it should never see a null prototype, so this case is safe.
				// Additionally, if the prototype chain is ever messed up such that the schema's class is not in it,
				// the null that would show up here does at least ensure this code throws instead of hanging.
				prototype = Reflect.getPrototypeOf(prototype) as object;
			}
		}

		return getTreeNodeSchemaInitializedData(schema, {
			shallowCompatibilityTest: (content: FactoryContent): CompatibilityLevel =>
				shallowCompatibilityTest(content, schema),
			toFlexContent: (
				content: FactoryContent,
				allowedTypes: ReadonlySet<TreeNodeSchema>,
			): FlexContent => objectToFlexContent(content, schema),
		});
	}

	public get [schemaIdentifierBrand](): string {
		return (this.constructor as typeof CustomObjectNodeBase)[objectNodeDataSymbol].identifier;
	}
	public get [typeSchemaSymbol](): TreeNodeSchemaClass {
		return (this.constructor as typeof CustomObjectNodeBase).constructorCached
			?.constructor as unknown as TreeNodeSchemaClass;
	}
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
	const T extends RestrictiveStringRecord<ImplicitFieldSchema>,
	const ImplicitlyConstructable extends boolean,
	const TCustomMetadata = unknown,
>(
	identifier: TName,
	info: T,
	implicitlyConstructable: ImplicitlyConstructable,
	nodeOptions: ObjectSchemaOptionsAlpha<TCustomMetadata>,
): ObjectNodeSchema<TName, T, ImplicitlyConstructable, TCustomMetadata> &
	ObjectNodeSchemaInternalData &
	TreeNodeSchemaCorePrivate {
	// Field set can't be modified after this since derived data is stored in maps.
	Object.freeze(info);

	// Ensure no collisions between final set of property keys, and final set of stored keys (including those
	// implicitly derived from property keys)
	assertUniqueKeys(identifier, info);

	const data = createObjectNodeSchemaData(
		identifier,
		info,
		implicitlyConstructable,
		nodeOptions,
		undefined,
	);

	class CustomObjectNode extends CustomObjectNodeBase<T> {
		public declare static readonly identifier: TName;
		public declare static readonly info: T;
		public declare static readonly implicitlyConstructable: ImplicitlyConstructable;
		public declare static readonly metadata: NodeSchemaMetadata<TCustomMetadata>;
	}
	defineSchemaClassData(CustomObjectNode, data);

	type Output = typeof CustomObjectNode &
		(new (
			input: InsertableObjectFromSchemaRecordAlpha<T> | InternalTreeNode,
		) => TreeObjectNode<T, TName>);
	return CustomObjectNode as Output;
}

/**
 * Base class for schema created by {@link singletonObjectSchema}.
 */
abstract class SingletonNodeBase extends CustomObjectNodeBase<Record<string, never>> {
	public constructor(data?: InternalTreeNode | Record<string, never>) {
		super(data ?? {});
	}

	public get value(): string | number {
		const schema = this[typeSchemaSymbol] as unknown as typeof CustomObjectNodeBase;
		return schema[objectNodeDataSymbol].singletonValue ?? fail("Missing singleton value");
	}

	public static override toString(): string {
		return `SingletonSchema(${this[objectNodeDataSymbol]?.singletonValue})`;
	}

	public static get [Symbol.toStringTag](): string {
		return this.toString();
	}
}

/**
 * Defines an object node schema with no fields whose nodes have a `value` property returning `value`.
 * @remarks
 * Implements {@link singletonSchema}.
 * Only one class is created per schema, and it declares nothing but the schema's data,
 * since large schemas can have many of these (one per enum value).
 *
 * Nodes are customizable objects (see {@link CustomObjectNodeBase.prepareInstance}) so that the `value` getter works.
 */
export function singletonObjectSchema<TName extends string, TValue extends string | number>(
	identifier: TName,
	value: TValue,
): TreeNodeSchemaClass<
	TName,
	NodeKind.Object,
	TreeNode & { readonly value: TValue },
	Record<string, never>,
	true,
	Record<string, never>,
	undefined
> {
	const data = createObjectNodeSchemaData(
		identifier,
		emptyInfo,
		true,
		{ allowUnknownOptionalFields: false },
		{ value },
	);
	class SingletonSchema extends SingletonNodeBase {}
	defineSchemaClassData(SingletonSchema, data);
	return SingletonSchema as unknown as TreeNodeSchemaClass<
		TName,
		NodeKind.Object,
		TreeNode & { readonly value: TValue },
		Record<string, never>,
		true,
		Record<string, never>,
		undefined
	>;
}

const emptyInfo: Record<string, never> = Object.freeze({});

const targetToProxy: WeakMap<object, TreeNode> = new WeakMap();

/**
 * Defines the static members which each class created for an object schema has, as static class fields would,
 * and records the class in `data`.
 * @remarks
 * Unlike static class fields, which are initialized by a function closing over `data`,
 * this does not allocate closure contexts for each class: large schemas can have many classes.
 */
function defineSchemaClassData(
	nodeClass: abstract new (...args: never[]) => CustomObjectNodeBase<never>,
	data: ObjectNodeSchemaData,
): void {
	// TreeNodeValid.markMostDerived requires each schema class to have its own `constructorCached`, initially undefined.
	Object.defineProperty(nodeClass, "constructorCached", {
		value: undefined,
		writable: true,
		enumerable: true,
		configurable: true,
	});
	Object.defineProperty(nodeClass, objectNodeDataSymbol, {
		value: data,
		writable: true,
		enumerable: true,
		configurable: true,
	});
	data.nodeClass = nodeClass;
}

/**
 * Ensures that the set of property keys in the schema is unique.
 * Also ensure that the final set of stored keys (including those implicitly derived from property keys) is unique.
 * @throws Throws a `UsageError` if either of the key uniqueness invariants is violated.
 */
function assertUniqueKeys<
	const Name extends number | string,
	const Fields extends RestrictiveStringRecord<ImplicitFieldSchema>,
>(schemaName: Name, fields: Fields): void {
	// Verify that there are no duplicates among the explicitly specified stored keys.
	const explicitStoredKeys = new Set<string>();
	for (const schema of Object.values(fields)) {
		const storedKey = getExplicitStoredKey(schema);
		if (storedKey === undefined) {
			continue;
		}
		if (explicitStoredKeys.has(storedKey)) {
			throw new UsageError(
				`Duplicate stored key "${storedKey}" in schema "${schemaName}". Stored keys must be unique within an object schema.`,
			);
		}
		explicitStoredKeys.add(storedKey);
	}

	// Verify that there are no duplicates among the derived
	// (including those implicitly derived from property keys) stored keys.
	const derivedStoredKeys = new Set<string>();
	for (const [propertyKey, schema] of Object.entries(fields)) {
		const storedKey = getStoredKey(propertyKey, schema);
		if (derivedStoredKeys.has(storedKey)) {
			throw new UsageError(
				`Stored key "${storedKey}" in schema "${schemaName}" conflicts with a property key of the same name, which is not overridden by a stored key. The final set of stored keys in an object schema must be unique.`,
			);
		}
		derivedStoredKeys.add(storedKey);
	}
}

/**
 * {@link TreeNodeSchemaInitializedData.toFlexContent} for object nodes.
 *
 * @param data - The tree data to be transformed. Must be a Record-like object.
 * @param schema - The schema to comply with.
 */
function objectToFlexContent(
	data: FactoryContent,
	schema: TreeNodeSchema & ObjectNodeSchemaInternalData,
): FlexContent {
	if (
		typeof data !== "object" ||
		data === null ||
		Symbol.iterator in data ||
		isFluidHandle(data)
	) {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		throw new UsageError(`Input data is incompatible with Object schema: ${data}`);
	}

	const fields = new Map<FieldKey, UnhydratedFlexTreeField>();
	const context = getUnhydratedContext(schema).flexContext;

	for (const [key, fieldInfo] of schema.flexKeyMap) {
		const value = getFieldProperty(data, key);

		let children: UnhydratedFlexTreeNode[] | ContextualFieldProvider;
		if (value === undefined) {
			const defaultProvider =
				fieldInfo.schema.props?.defaultProvider ??
				fail(0xbb1 /* missing field has no default provider */);
			const fieldProvider = extractFieldProvider(defaultProvider);
			children = isConstant(fieldProvider) ? fieldProvider() : fieldProvider;
		} else {
			children = [
				unhydratedFlexTreeFromInsertableNode(value, fieldInfo.schema.allowedTypeSet),
			];
		}

		const kind =
			convertFieldKind.get(fieldInfo.schema.kind) ?? fail(0xbb2 /* Invalid field kind */);
		fields.set(
			fieldInfo.storedKey,
			createField(context, kind.identifier, fieldInfo.storedKey, children),
		);
	}

	return [{ type: brand(schema.identifier) }, fields];
}

/**
 * {@link TreeNodeSchemaInitializedData.shallowCompatibilityTest} for Object nodes.
 */
function shallowCompatibilityTest(
	data: FactoryContent,
	schema: ObjectNodeSchema & ObjectNodeSchemaInternalData,
): CompatibilityLevel {
	if (isTreeValue(data)) {
		return CompatibilityLevel.None;
	}

	if (Symbol.iterator in data) {
		return CompatibilityLevel.None;
	}

	// TODO: Improve type inference by making this logic more thorough. Handle at least:
	// * Types which are strict subsets of other types in the same polymorphic union
	// * Types which have the same keys but different types for those keys in the polymorphic union
	// * Types which have the same required fields but different optional fields and enough of those optional fields are populated to disambiguate

	// TODO#7441: Consider allowing data to be inserted which has keys that are extraneous/unknown to the schema (those keys are ignored)

	// If the schema has a required key which is not present in the input object, reject it.
	for (const [fieldKey, { schema: fieldSchema }] of schema.flexKeyMap) {
		if (fieldSchema.requiresValue && getFieldProperty(data, fieldKey) === undefined) {
			return CompatibilityLevel.None;
		}
	}

	return CompatibilityLevel.Normal;
}

/**
 * Check {@link FactoryContentObject} for a property which could be store a field.
 *
 * @returns If the property exists, return its value. Otherwise, returns undefined.
 * @remarks
 * The currently policy is to only consider own properties.
 * See {@link InsertableObjectFromSchemaRecord} for where this policy is documented in the public API.
 *
 * Explicit undefined values are treated the same as missing properties to allow explicit use of undefined with defaulted identifiers.
 *
 * @privateRemarks
 * If we ever want to have an optional field which defaults to something other than undefined, this will need changes.
 * It would need to adjusting the handling of explicit undefined in contexts where undefined is allowed, and a default provider also exists.
 */
function getFieldProperty(
	data: FactoryContentObject,
	key: string | symbol,
): InsertableContent | undefined {
	// This policy only allows own properties.
	if (Object.hasOwnProperty.call(data, key)) {
		return (data as Record<string, InsertableContent>)[key as string];
	}
	return undefined;
}

function applyFieldChange(
	schema: ObjectNodeSchemaPrivate,
	from: { kind: "proxy"; node: TreeNode } | { kind: "target"; node: object },
	fieldInfo: { storedKey: FieldKey; schema: FieldSchema },
	value: InsertableContent | undefined,
): void {
	const proxy =
		from.kind === "proxy"
			? from.node
			: (targetToProxy.get(from.node) ?? fail(0xc95 /* missing proxy */));
	const inner = getInnerNode(proxy);
	const storedSchema = inner.context.schema.nodeSchema.get(brand(schema.identifier));
	assert(
		storedSchema instanceof ObjectNodeStoredSchema,
		0xc96 /* Expected ObjectNodeStoredSchema */,
	);

	if (value === undefined && inner.tryGetField(fieldInfo.storedKey) === undefined) {
		return;
	}

	setField(
		inner.getBoxed(fieldInfo.storedKey),
		fieldInfo.schema,
		value,
		storedSchema.getFieldSchema(fieldInfo.storedKey),
	);
}
