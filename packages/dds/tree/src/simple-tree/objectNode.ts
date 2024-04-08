/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { FieldKey, TreeNodeSchemaIdentifier } from "../core/index.js";
import {
	FieldKinds,
	FlexAllowedTypes,
	FlexObjectNodeSchema,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeObjectNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	LocalNodeKey,
	isFlexTreeNode,
} from "../feature-libraries/index.js";
import {
	InsertableContent,
	getProxyForField,
	markContentType,
	prepareContentForInsert,
} from "./proxies.js";
import { getFlexNode, setFlexNode } from "./proxyBinding.js";
import { getSimpleFieldSchema } from "./schemaCaching.js";
import {
	NodeKind,
	ImplicitFieldSchema,
	TreeNodeSchemaClass,
	WithType,
	TreeNodeSchema,
	getStoredKey,
	getExplicitStoredKey,
	TreeFieldFromImplicitField,
	InsertableTreeFieldFromImplicitField,
	FieldSchema,
} from "./schemaTypes.js";
import { cursorFromNodeData } from "./toMapTree.js";
import { TreeNode } from "./types.js";
import { RestrictiveReadonlyRecord, brand, fail } from "../util/index.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { RawTreeNode, rawError } from "./rawNode.js";

/**
 * Helper used to produce types for object nodes.
 * @public
 */
export type ObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitField<T[Property]>;
};

/**
 * A {@link TreeNode} which modules a JavaScript object.
 * @remarks
 * Object nodes consist of a type which specifies which {@link TreeNodeSchema} they use (see {@link TreeNodeApi.schema}), and a collections of fields, each with a distinct `key` and its own {@link FieldSchema} defining what can be placed under that key.
 *
 * All non-empty fields on an object node are exposed as enumerable own properties with string keys.
 * No other own `own` or `enumerable` properties are included on object nodes unless the user of the node manually adds custom session only state.
 * This allows a majority of general purpose JavaScript object processing operations (like `for...in`, `Reflect.ownKeys()` and `Object.entries()`) to enumerate all the children.
 * @public
 */
export type TreeObjectNode<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecord<T> & WithType<TypeName>;

/**
 * Helper used to produce types for:
 *
 * 1. Insertable content which can be used to construct an object node.
 *
 * 2. Insertable content which is an unhydrated object node.
 *
 * 3. Union of 1 and 2.
 *
 * @privateRemarks TODO: consider separating these cases into different types.
 *
 * @public
 */
export type InsertableObjectFromSchemaRecord<
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitField<T[Property]>;
};

/**
 * Maps from simple field keys ("view" keys) to their flex field counterparts ("stored" keys).
 *
 * @remarks
 * A missing entry for a given view key indicates that the view and stored keys are the same for that field.
 */
type SimpleKeyToFlexKeyMap = Map<string, FieldKey>;

/**
 * Caches a {@link SimpleKeyToFlexKeyMap} for a given {@link TreeNodeSchema}.
 */
const simpleKeyToFlexKeyCache = new WeakMap<TreeNodeSchema, SimpleKeyToFlexKeyMap>();

/**
 * Caches the mappings from view keys to stored keys for the provided object field schemas in {@link simpleKeyToFlexKeyCache}.
 */
function getOrCreateFlexKeyMapping(
	nodeSchema: TreeNodeSchema,
	fields: Record<string, ImplicitFieldSchema>,
): SimpleKeyToFlexKeyMap {
	let keyMap = simpleKeyToFlexKeyCache.get(nodeSchema);
	if (keyMap === undefined) {
		keyMap = new Map<FieldKey, FieldKey>();
		for (const [viewKey, fieldSchema] of Object.entries(fields)) {
			// Only specify mapping if the stored key differs from the view key.
			// No entry in this map will indicate that the two keys are the same.
			const storedKey = getStoredKey(viewKey, fieldSchema);
			if (viewKey !== storedKey) {
				keyMap.set(viewKey, brand(storedKey));
			}
		}
		simpleKeyToFlexKeyCache.set(nodeSchema, keyMap);
	}
	return keyMap;
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 */
function createObjectProxy(
	schema: ObjectNodeSchema,
	allowAdditionalProperties: boolean,
	targetObject: object = {},
): TreeNode {
	// Performance optimization: cache view key => stored key mapping.
	const flexKeyMap: SimpleKeyToFlexKeyMap = getOrCreateFlexKeyMapping(
		schema,
		schema.info as Record<string, ImplicitFieldSchema>,
	);

	function getFlexKey(viewKey: string): FieldKey {
		return flexKeyMap.get(viewKey) ?? brand(viewKey);
	}

	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy(targetObject, {
		get(target, viewKey): unknown {
			const flexKey = getFlexKey(viewKey as FieldKey);
			const field = getFlexNode(proxy).tryGetField(flexKey);

			if (field !== undefined) {
				return getProxyForField(field);
			}

			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(target, viewKey, proxy);
		},
		set(target, viewKey, value: InsertableContent) {
			const flexNode = getFlexNode(proxy);
			const flexNodeSchema = flexNode.schema;
			assert(flexNodeSchema instanceof FlexObjectNodeSchema, 0x888 /* invalid schema */);

			const hasField = viewKey in schema.info;

			if (!hasField) {
				return allowAdditionalProperties ? Reflect.set(target, viewKey, value) : false;
			}
			assert(typeof viewKey === "string", 0x7e1 /* invalid key */);
			const flexKey: FieldKey | undefined = getFlexKey(viewKey);

			const field = flexNode.getBoxed(flexKey);

			const simpleNodeFields = schema.info;
			if (simpleNodeFields[viewKey] === undefined) {
				fail(`Field key '${viewKey}' not found in schema.`);
			}

			const simpleFieldSchema = getSimpleFieldSchema(field.schema, schema.info[viewKey]);

			setField(field, simpleFieldSchema, value);

			return true;
		},
		has: (target, viewKey) => {
			const fields = schema.info as Record<string, ImplicitFieldSchema>;
			return (
				fields[viewKey as FieldKey] !== undefined ||
				(allowAdditionalProperties ? Reflect.has(target, viewKey) : false)
			);
		},
		ownKeys: (target) => {
			const fields = schema.info as Record<string, ImplicitFieldSchema>;
			return [
				...Object.keys(fields),
				...(allowAdditionalProperties ? Reflect.ownKeys(target) : []),
			];
		},
		getOwnPropertyDescriptor: (target, viewKey) => {
			const flexKey = getFlexKey(viewKey as FieldKey);
			const field = getFlexNode(proxy).tryGetField(flexKey);

			if (field === undefined) {
				return allowAdditionalProperties
					? Reflect.getOwnPropertyDescriptor(target, viewKey)
					: undefined;
			}

			const p: PropertyDescriptor = {
				value: getProxyForField(field),
				writable: true,
				enumerable: true,
				configurable: true, // Must be 'configurable' if property is absent from proxy target.
			};

			return p;
		},
	}) as TreeNode;
	return proxy;
}

export function setField(
	field: FlexTreeField,
	simpleFieldSchema: FieldSchema,
	value: InsertableContent,
): void {
	switch (field.schema.kind) {
		case FieldKinds.required:
		case FieldKinds.optional: {
			const typedField = field as
				| FlexTreeRequiredField<FlexAllowedTypes>
				| FlexTreeOptionalField<FlexAllowedTypes>;

			const content = prepareContentForInsert(value, field.context.forest);
			const cursor = cursorFromNodeData(content, simpleFieldSchema.allowedTypes);
			typedField.content = cursor;
			break;
		}

		default:
			fail("invalid FieldKind");
	}
}

type ObjectNodeSchema<
	TName extends string = string,
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema> = RestrictiveReadonlyRecord<
		string,
		ImplicitFieldSchema
	>,
	ImplicitlyConstructable extends boolean = boolean,
> = TreeNodeSchemaClass<
	TName,
	NodeKind.Object,
	TreeNode & WithType<TName>,
	InsertableObjectFromSchemaRecord<T>,
	ImplicitlyConstructable,
	T
>;

/**
 * Define a {@link TreeNodeSchema} for a {@link TreeObjectNode}.
 *
 * @param name - Unique identifier for this schema within this factory's scope.
 * @param fields - Schema for fields of the object node's schema. Defines what children can be placed under each key.
 */
export function objectSchema<
	TName extends string,
	const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	const ImplicitlyConstructable extends boolean,
>(base: ObjectNodeSchema<TName, T, ImplicitlyConstructable>) {
	// Ensure no collisions between final set of view keys, and final set of stored keys (including those
	// implicitly derived from view keys)
	assertUniqueKeys(base.identifier, base.info);
	class schema extends base {
		public constructor(input: InsertableObjectFromSchemaRecord<T>) {
			super(input);

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
			const customizable = this.constructor !== schema;
			const proxyTarget = customizable ? this : undefined;

			const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
			assert(flexSchema instanceof FlexObjectNodeSchema, "invalid flex schema");
			const flexNode: FlexTreeNode = isFlexTreeNode(input)
				? input
				: new RawObjectNode(flexSchema, copyContent(flexSchema.name, input) as object);

			const proxy: TreeNode = createObjectProxy(
				this.constructor as ObjectNodeSchema,
				customizable,
				proxyTarget,
			);
			setFlexNode(proxy, flexNode);
			return proxy as unknown as schema;
		}
	}

	return schema as TreeNodeSchemaClass<
		TName,
		NodeKind.Object,
		TreeObjectNode<T, TName>,
		object & InsertableObjectFromSchemaRecord<T>,
		true,
		T
	>;
}

/**
 * The implementation of an object node created by {@link createRawNode}.
 */
export class RawObjectNode<TSchema extends FlexObjectNodeSchema, TContent extends object>
	extends RawTreeNode<TSchema, TContent>
	implements FlexTreeObjectNode
{
	public get localNodeKey(): LocalNodeKey | undefined {
		throw rawError("Reading local node keys");
	}
}

/**
 * Ensures that the set of view keys in the schema is unique.
 * Also ensure that the final set of stored keys (including those implicitly derived from view keys) is unique.
 * @throws Throws a `UsageError` if either of the key uniqueness invariants is violated.
 */
function assertUniqueKeys<
	const Name extends number | string,
	const Fields extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
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
	// (including those implicitly derived from view keys) stored keys.
	const derivedStoredKeys = new Set<string>();
	for (const [viewKey, schema] of Object.entries(fields)) {
		const storedKey = getStoredKey(viewKey, schema);
		if (derivedStoredKeys.has(storedKey)) {
			throw new UsageError(
				`Stored key "${storedKey}" in schema "${schemaName}" conflicts with a property key of the same name, which is not overridden by a stored key. The final set of stored keys in an object schema must be unique.`,
			);
		}
		derivedStoredKeys.add(storedKey);
	}
}

function copyContent<T extends object>(typeName: TreeNodeSchemaIdentifier, content: T): T {
	const copy = { ...content };
	markContentType(typeName, copy);
	return copy;
}
