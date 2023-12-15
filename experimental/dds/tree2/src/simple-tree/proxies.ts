/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { brand, fail, isReadonlyArray } from "../util";
import {
	AllowedTypes,
	TreeFieldSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	MapNodeSchema,
	FieldNodeSchema,
	FieldKinds,
	FlexTreeFieldNode,
	FlexTreeMapNode,
	FlexTreeObjectNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeNode,
	FlexTreeTypedField,
	FlexTreeUnknownUnboxed,
	onNextChange,
	typeNameSymbol,
	isFluidHandle,
} from "../feature-libraries";
import { EmptyKey, FieldKey, TreeNodeSchemaIdentifier } from "../core";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { LazyObjectNode, getBoxedField } from "../feature-libraries/flex-tree/lazyNode";
import { type TreeNodeSchema as TreeNodeSchemaClass } from "../class-tree";
// eslint-disable-next-line import/no-internal-modules
import { NodeBase, NodeKind } from "../class-tree/schemaTypes";
import { IterableTreeListContent, TreeListNodeOld } from "./treeListNode";
import { TreeField, TypedNode, TreeMapNode, TreeObjectNode, TreeNode, Unhydrated } from "./types";
import { tryGetFlexNodeTarget, setFlexNode, getFlexNode, tryGetFlexNode } from "./flexNode";
import { InsertableTreeNodeUnion, InsertableTypedNode } from "./insertable";
import { cursorFromFieldData, cursorFromNodeData } from "./toMapTree";
import { RawTreeNode, createRawNode, extractRawNodeContent } from "./rawNode";

/** Retrieve the associated proxy for the given field. */
export function getProxyForField<TSchema extends TreeFieldSchema>(
	field: FlexTreeTypedField<TSchema>,
): TreeField<TSchema> {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as FlexTreeTypedField<
				TreeFieldSchema<typeof FieldKinds.required>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(asValue.boxedContent) as TreeField<TSchema>;
		}
		case FieldKinds.optional: {
			const asValue = field as FlexTreeTypedField<
				TreeFieldSchema<typeof FieldKinds.optional>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.

			const maybeContent = asValue.boxedContent;

			// Normally, empty fields are unreachable due to the behavior of 'tryGetField'.  However, the
			// root field is a special case where the field is always present (even if empty).
			return (
				maybeContent === undefined ? undefined : getOrCreateNodeProxy(maybeContent)
			) as TreeField<TSchema>;
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a list proxy, making
			// this case unreachable as long as users follow the 'list recipe'.
			fail("'sequence' field is unexpected.");
		}
		default:
			fail("invalid field kind");
	}
}

/**
 * A symbol for storing TreeNodeSchemaClass on FlexTreeNode's schema.
 */
export const simpleSchemaSymbol: unique symbol = Symbol(`simpleSchema`);

export function getClassSchema(schema: TreeNodeSchema): TreeNodeSchemaClass | undefined {
	if (simpleSchemaSymbol in schema) {
		return schema[simpleSchemaSymbol] as TreeNodeSchemaClass;
	}
	return undefined;
}

export function getOrCreateNodeProxy<TSchema extends TreeNodeSchema>(
	flexNode: FlexTreeNode,
): TypedNode<TSchema> {
	const cachedProxy = tryGetFlexNodeTarget(flexNode);
	if (cachedProxy !== undefined) {
		return cachedProxy as TypedNode<TSchema>;
	}

	const schema = flexNode.schema;
	let output: TypedNode<TSchema>;
	const classSchema = getClassSchema(schema);
	if (classSchema !== undefined) {
		if (typeof classSchema === "function") {
			const simpleSchema = classSchema as unknown as new (
				dummy: FlexTreeNode,
			) => TypedNode<TSchema>;
			output = new simpleSchema(flexNode);
		} else {
			output = (
				schema as unknown as { create: (data: FlexTreeNode) => TypedNode<TSchema> }
			).create(flexNode);
		}
	} else {
		// Fallback to createNodeProxy if needed.
		// TODO: maybe remove this fallback and error once migration to class based schema is done.
		output = createNodeProxy<TSchema>(flexNode, false);
	}
	return output;
}

/**
 * @param flexNode - underlying tree node which this proxy should wrap.
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided an empty collection of the relevant type is used for the target and a separate object created to dispatch methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide needed functionality depending on the schema kind.
 */
export function createNodeProxy<TSchema extends TreeNodeSchema>(
	flexNode: FlexTreeNode,
	allowAdditionalProperties: boolean,
	targetObject?: object,
): TypedNode<TSchema> {
	const schema = flexNode.schema;
	if (schemaIsLeaf(schema)) {
		return flexNode.value as TypedNode<TSchema>;
	}
	let proxy: TypedNode<TSchema>;
	if (schemaIsMap(schema)) {
		proxy = createMapProxy(allowAdditionalProperties, targetObject) as TypedNode<TSchema>;
	} else if (schemaIsFieldNode(schema)) {
		proxy = createListProxy(allowAdditionalProperties, targetObject) as TypedNode<TSchema>;
	} else if (schemaIsObjectNode(schema)) {
		proxy = createObjectProxy(
			schema,
			allowAdditionalProperties,
			targetObject,
		) as TypedNode<TSchema>;
	} else {
		fail("unrecognized node kind");
	}
	setFlexNode(proxy as TreeNode, flexNode);
	return proxy;
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 */
export function createObjectProxy<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
	allowAdditionalProperties: boolean,
	targetObject: object = {},
): TreeObjectNode<TSchema> {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy(targetObject, {
		get(target, key): unknown {
			const field = getFlexNode(proxy).tryGetField(key as FieldKey);
			if (field !== undefined) {
				return getProxyForField(field);
			}

			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(target, key, proxy);
		},
		set(target, key, value: InsertableContent) {
			const flexNode = getFlexNode(proxy);
			const fieldSchema = flexNode.schema.objectNodeFields.get(key as FieldKey);

			if (fieldSchema === undefined) {
				return allowAdditionalProperties ? Reflect.set(target, key, value) : false;
			}

			// TODO: Is it safe to assume 'content' is a LazyObjectNode?
			assert(flexNode instanceof LazyObjectNode, 0x7e0 /* invalid content */);
			assert(typeof key === "string", 0x7e1 /* invalid key */);
			const field = getBoxedField(flexNode, brand(key), fieldSchema);

			switch (field.schema.kind) {
				case FieldKinds.required:
				case FieldKinds.optional: {
					const typedField = field as
						| FlexTreeRequiredField<AllowedTypes>
						| FlexTreeOptionalField<AllowedTypes>;

					const { content, hydrateProxies } = extractFactoryContent(value);
					const cursor = cursorFromNodeData(
						content,
						flexNode.context.schema,
						fieldSchema.allowedTypeSet,
					);
					modifyChildren(
						flexNode,
						() => {
							typedField.content = cursor;
						},
						() => hydrateProxies(typedField.boxedContent),
					);
					break;
				}

				default:
					fail("invalid FieldKind");
			}

			return true;
		},
		has: (target, key) => {
			return (
				schema.objectNodeFields.has(key as FieldKey) ||
				(allowAdditionalProperties ? Reflect.has(target, key) : false)
			);
		},
		ownKeys: (target) => {
			return [
				...schema.objectNodeFields.keys(),
				...(allowAdditionalProperties ? Reflect.ownKeys(target) : []),
			];
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getFlexNode(proxy).tryGetField(key as FieldKey);

			if (field === undefined) {
				return allowAdditionalProperties
					? Reflect.getOwnPropertyDescriptor(target, key)
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
	}) as TreeObjectNode<TSchema>;
	return proxy;
}

/**
 * Given a list proxy, returns its underlying LazySequence field.
 */
export const getSequenceField = <TTypes extends AllowedTypes>(list: TreeListNodeOld) =>
	getFlexNode(list).content as FlexTreeSequenceField<TTypes>;

// Used by 'insert*()' APIs to converts new content (expressed as a proxy union) to contextually
// typed data prior to forwarding to 'LazySequence.insert*()'.
function contextualizeInsertedListContent(
	insertedAtIndex: number,
	content: readonly (InsertableContent | IterableTreeListContent<InsertableContent>)[],
): ExtractedFactoryContent {
	return extractFactoryContent(
		content.flatMap((c): InsertableContent[] =>
			c instanceof IterableTreeListContent ? Array.from(c) : [c],
		),
		insertedAtIndex,
	);
}

// #region Create dispatch map for lists

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

/**
 * PropertyDescriptorMap used to build the prototype for our SharedListNode dispatch object.
 */
export const listPrototypeProperties: PropertyDescriptorMap = {
	// We manually add [Symbol.iterator] to the dispatch map rather than use '[fn.name] = fn' as
	// below when adding 'Array.prototype.*' properties to this map because 'Array.prototype[Symbol.iterator].name'
	// returns "values" (i.e., Symbol.iterator is an alias for the '.values()' function.)
	[Symbol.iterator]: {
		value: Array.prototype[Symbol.iterator],
	},
	at: {
		value(this: TreeListNodeOld, index: number): FlexTreeUnknownUnboxed | undefined {
			const field = getSequenceField(this);
			const val = field.boxedAt(index);

			if (val === undefined) {
				return val;
			}

			return getOrCreateNodeProxy(val) as FlexTreeUnknownUnboxed;
		},
	},
	insertAt: {
		value(
			this: TreeListNodeOld,
			index: number,
			...value: readonly (InsertableContent | IterableTreeListContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);

			const { content, hydrateProxies } = contextualizeInsertedListContent(index, value);
			const cursor = cursorFromFieldData(
				content,
				sequenceField.context.schema,
				sequenceField.schema,
			);

			modifyChildren(
				getFlexNode(this),
				() => sequenceField.insertAt(index, cursor),
				(listFlexNode) => hydrateProxies(listFlexNode),
			);
		},
	},
	insertAtStart: {
		value(
			this: TreeListNodeOld,
			...value: readonly (InsertableContent | IterableTreeListContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);

			const { content, hydrateProxies } = contextualizeInsertedListContent(0, value);
			const cursor = cursorFromFieldData(
				content,
				sequenceField.context.schema,
				sequenceField.schema,
			);

			modifyChildren(
				getFlexNode(this),
				() => sequenceField.insertAtStart(cursor),
				(listFlexNode) => hydrateProxies(listFlexNode),
			);
		},
	},
	insertAtEnd: {
		value(
			this: TreeListNodeOld,
			...value: readonly (InsertableContent | IterableTreeListContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);

			const { content, hydrateProxies } = contextualizeInsertedListContent(
				this.length,
				value,
			);
			const cursor = cursorFromFieldData(
				content,
				sequenceField.context.schema,
				sequenceField.schema,
			);

			modifyChildren(
				getFlexNode(this),
				() => sequenceField.insertAtEnd(cursor),
				(listFlexNode) => hydrateProxies(listFlexNode),
			);
		},
	},
	removeAt: {
		value(this: TreeListNodeOld, index: number): void {
			getSequenceField(this).removeAt(index);
		},
	},
	removeRange: {
		value(this: TreeListNodeOld, start?: number, end?: number): void {
			getSequenceField(this).removeRange(start, end);
		},
	},
	moveToStart: {
		value(this: TreeListNodeOld, sourceIndex: number, source?: TreeListNodeOld): void {
			if (source !== undefined) {
				getSequenceField(this).moveToStart(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToStart(sourceIndex);
			}
		},
	},
	moveToEnd: {
		value(this: TreeListNodeOld, sourceIndex: number, source?: TreeListNodeOld): void {
			if (source !== undefined) {
				getSequenceField(this).moveToEnd(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToEnd(sourceIndex);
			}
		},
	},
	moveToIndex: {
		value(
			this: TreeListNodeOld,
			index: number,
			sourceIndex: number,
			source?: TreeListNodeOld,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveToIndex(index, sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToIndex(index, sourceIndex);
			}
		},
	},
	moveRangeToStart: {
		value(
			this: TreeListNodeOld,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeListNodeOld,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveRangeToStart(
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveRangeToStart(sourceStart, sourceEnd);
			}
		},
	},
	moveRangeToEnd: {
		value(
			this: TreeListNodeOld,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeListNodeOld,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveRangeToEnd(
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveRangeToEnd(sourceStart, sourceEnd);
			}
		},
	},
	moveRangeToIndex: {
		value(
			this: TreeListNodeOld,
			index: number,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeListNodeOld,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveRangeToIndex(
					index,
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveRangeToIndex(index, sourceStart, sourceEnd);
			}
		},
	},
};

/* eslint-disable @typescript-eslint/unbound-method */

// For compatibility, we are initially implement 'readonly T[]' by applying the Array.prototype methods
// to the list proxy.  Over time, we should replace these with efficient implementations on LazySequence
// to avoid re-entering the proxy as these methods access 'length' and the indexed properties.
//
// For brevity, the current implementation dynamically builds a property descriptor map from a list of
// Array functions we want to re-expose via the proxy.

// TODO: This assumes 'Function.name' matches the property name on 'Array.prototype', which may be
// dubious across JS engines.
[
	Array.prototype.concat,
	// Array.prototype.copyWithin,
	Array.prototype.entries,
	Array.prototype.every,
	// Array.prototype.fill,
	Array.prototype.filter,
	Array.prototype.find,
	Array.prototype.findIndex,
	Array.prototype.flat,
	Array.prototype.flatMap,
	Array.prototype.forEach,
	Array.prototype.includes,
	Array.prototype.indexOf,
	Array.prototype.join,
	Array.prototype.keys,
	Array.prototype.lastIndexOf,
	// Array.prototype.length,
	Array.prototype.map,
	// Array.prototype.pop,
	// Array.prototype.push,
	Array.prototype.reduce,
	Array.prototype.reduceRight,
	// Array.prototype.reverse,
	// Array.prototype.shift,
	Array.prototype.slice,
	Array.prototype.some,
	// Array.prototype.sort,
	// Array.prototype.splice,
	Array.prototype.toLocaleString,
	Array.prototype.toString,
	// Array.prototype.unshift,
	Array.prototype.values,
].forEach((fn) => {
	listPrototypeProperties[fn.name] = { value: fn };
});

/* eslint-enable @typescript-eslint/unbound-method */

const listPrototype = Object.create(Object.prototype, listPrototypeProperties);

// #endregion

/**
 * Helper to coerce property keys to integer indexes (or undefined if not an in-range integer).
 */
function asIndex(key: string | symbol, length: number) {
	if (typeof key === "string") {
		// TODO: It may be worth a '0' <= ch <= '9' check before calling 'Number' to quickly
		// reject 'length' as an index, or even parsing integers ourselves.
		const asNumber = Number(key);

		// TODO: See 'matrix/range.ts' for fast integer coercing + range check.
		if (Number.isInteger(asNumber)) {
			return 0 <= asNumber && asNumber < length ? asNumber : undefined;
		}
	}
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `[]` is used for the target and a separate object created to dispatch list methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide `length` and the list functionality from {@link listPrototype}.
 */
function createListProxy<TTypes extends AllowedTypes>(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeListNodeOld<TTypes> {
	const targetObject = customTargetObject ?? [];

	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target, because we need
	// the proxy target to be a plain JS array (see comments below when we instantiate the Proxy).
	// Own properties on the dispatch object are surfaced as own properties of the proxy.
	// (e.g., 'length', which is defined below).
	//
	// Properties normally inherited from 'Array.prototype' are surfaced via the prototype chain.
	const dispatch: object =
		customTargetObject ??
		Object.create(listPrototype, {
			length: {
				get(this: TreeListNodeOld) {
					return getSequenceField(this).length;
				},
				set() {},
				enumerable: false,
				configurable: false,
			},
		});

	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeListNodeOld<TTypes> = new Proxy<TreeListNodeOld<TTypes>>(targetObject as any, {
		get: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);

			if (maybeIndex === undefined) {
				// Pass the proxy as the receiver here, so that any methods on
				// the prototype receive `proxy` as `this`.
				return Reflect.get(dispatch, key, proxy) as unknown;
			}

			const value = field.boxedAt(maybeIndex);

			if (value === undefined) {
				return undefined;
			}

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(value);
		},
		set: (target, key, newValue, receiver) => {
			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue, proxy);
			}

			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				// For MVP, we otherwise disallow setting properties (mutation is only available via the list mutation APIs).
				return false;
			}
			return allowAdditionalProperties ? Reflect.set(target, key, newValue) : false;
		},
		has: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatch, key);
		},
		ownKeys: (target) => {
			const field = getSequenceField(proxy);

			// TODO: Would a lazy iterator to produce the indexes work / be more efficient?
			// TODO: Need to surface 'Symbol.isConcatSpreadable' as an own key.
			return Array.from({ length: field.length }, (_, index) => `${index}`).concat("length");
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				const val = field.boxedAt(maybeIndex);
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for indexed properties must
				// be a simple value property (as opposed to using getter) and declared writable/enumerable/configurable.
				return {
					// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
					//       as simple as calling '.at' since this skips the node and returns the FieldNode's
					//       inner field.
					value: val === undefined ? val : getOrCreateNodeProxy(val),
					writable: true, // For MVP, disallow setting indexed properties.
					enumerable: true,
					configurable: true,
				};
			} else if (key === "length") {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for 'length' must be a simple
				// value property (as opposed to using getter) and be declared writable / non-configurable.
				return {
					value: getSequenceField(proxy).length,
					writable: true,
					enumerable: false,
					configurable: false,
				};
			}
			return Reflect.getOwnPropertyDescriptor(dispatch, key);
		},
	});
	return proxy;
}

// #region Create dispatch map for maps

export const mapStaticDispatchMap: PropertyDescriptorMap = {
	[Symbol.iterator]: {
		value(this: TreeMapNode) {
			return this.entries();
		},
	},
	delete: {
		value(this: TreeMapNode, key: string): void {
			const node = getFlexNode(this);
			node.delete(key);
		},
	},
	entries: {
		*value(this: TreeMapNode): IterableIterator<[string, unknown]> {
			const node = getFlexNode(this);
			for (const key of node.keys()) {
				yield [key, getProxyForField(node.getBoxed(key))];
			}
		},
	},
	get: {
		value(this: TreeMapNode, key: string): unknown {
			const node = getFlexNode(this);
			const field = node.getBoxed(key);
			return getProxyForField(field);
		},
	},
	has: {
		value(this: TreeMapNode, key: string): boolean {
			const node = getFlexNode(this);
			return node.has(key);
		},
	},
	keys: {
		value(this: TreeMapNode): IterableIterator<string> {
			const node = getFlexNode(this);
			return node.keys();
		},
	},
	set: {
		value(
			this: TreeMapNode,
			key: string,
			value: InsertableTreeNodeUnion<AllowedTypes>,
		): TreeMapNode {
			const node = getFlexNode(this);

			const { content, hydrateProxies } = extractFactoryContent(value as FactoryContent);
			const cursor = cursorFromNodeData(
				content,
				node.context.schema,
				node.schema.mapFields.allowedTypeSet,
			);
			modifyChildren(
				node,
				(mapNode) => mapNode.set(key, cursor),
				(mapNode) => hydrateProxies(getMapChildNode(mapNode, key)),
			);
			return this;
		},
	},
	size: {
		get(this: TreeMapNode) {
			return getFlexNode(this).size;
		},
	},
	values: {
		*value(this: TreeMapNode): IterableIterator<unknown> {
			for (const [, value] of this.entries()) {
				yield value;
			}
		},
	},
	// TODO: add `clear` once we have established merge semantics for it.
};

const mapPrototype = Object.create(Object.prototype, mapStaticDispatchMap);

// #endregion

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `new Map()` is used for the target and a separate object created to dispatch map methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide the map functionality from {@link mapPrototype}.
 */
function createMapProxy<TSchema extends MapNodeSchema>(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeMapNode<TSchema> {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	const dispatch: object =
		customTargetObject ??
		Object.create(mapPrototype, {
			// Empty - JavaScript Maps do not expose any "own" properties.
		});
	const targetObject: object =
		customTargetObject ?? new Map<string, TreeField<TSchema["info"], "notEmpty">>();

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy<TreeMapNode<TSchema>>(
		targetObject as Map<string, TreeField<TSchema["info"], "notEmpty">>,
		{
			get: (target, key, receiver): unknown => {
				// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
				return Reflect.get(dispatch, key, proxy);
			},
			getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined => {
				return Reflect.getOwnPropertyDescriptor(dispatch, key);
			},
			has: (target, key) => {
				return Reflect.has(dispatch, key);
			},
			set: (target, key, newValue): boolean => {
				return allowAdditionalProperties ? Reflect.set(dispatch, key, newValue) : false;
			},
			ownKeys: (target) => {
				// All of Map's properties are inherited via its prototype, so there is nothing to return here,
				return [];
			},
		},
	);
	return proxy;
}

/**
 * Create a proxy to a {@link TreeObjectNode} that is backed by a raw object node (see {@link createRawNode}).
 * @param schema - the schema of the object node
 * @param content - the content to be stored in the raw node.
 * A copy of content is stored, the input `content` is not modified and can be safely reused in another call to {@link createRawObjectProxy}.
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 * @remarks
 * Because this proxy is backed by a raw node, it has the same limitations as the node created by {@link createRawNode}.
 * Most of its properties and methods will error if read/called.
 */
export function createRawNodeProxy<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
	content: InsertableTypedNode<TSchema>,
	allowAdditionalProperties: boolean,
	target?: object,
): Unhydrated<TreeObjectNode<TSchema>>;
export function createRawNodeProxy<TSchema extends FieldNodeSchema>(
	schema: TSchema,
	content: InsertableTypedNode<TSchema>,
	allowAdditionalProperties: boolean,
	target?: object,
): Unhydrated<TreeListNodeOld<TSchema["info"]["allowedTypes"]>>;
export function createRawNodeProxy<TSchema extends MapNodeSchema>(
	schema: TSchema,
	content: InsertableTypedNode<TSchema>,
	allowAdditionalProperties: boolean,
	target?: object,
): Unhydrated<TreeMapNode<TSchema>>;
export function createRawNodeProxy<TSchema extends TreeNodeSchema>(
	schema: TSchema,
	content: InsertableTypedNode<TSchema>,
	allowAdditionalProperties: boolean,
	target?: object,
): Unhydrated<TreeNode> {
	// Shallow copy the content and then add the type name symbol to it.
	let flexNode: RawTreeNode<TSchema, InsertableTypedNode<TreeNodeSchema>>;
	let proxy: TreeNode;
	if (schema instanceof ObjectNodeSchema) {
		const contentCopy = copyContent(schema.name, content as InsertableTypedNode<typeof schema>);
		flexNode = createRawNode(schema, contentCopy);
		proxy = createObjectProxy(schema, allowAdditionalProperties, target);
	} else if (schema instanceof FieldNodeSchema) {
		// simple-tree uses field nodes exclusively to represent lists
		const contentCopy = copyContent(schema.name, content as InsertableTypedNode<typeof schema>);
		flexNode = createRawNode(schema, contentCopy);
		proxy = createListProxy(allowAdditionalProperties, target);
	} else if (schema instanceof MapNodeSchema) {
		const contentCopy = copyContent(schema.name, content as InsertableTypedNode<typeof schema>);
		flexNode = createRawNode(schema, contentCopy);
		proxy = createMapProxy(allowAdditionalProperties, target);
	} else {
		fail("Unrecognized content schema");
	}

	return setFlexNode(proxy, flexNode);
}

function copyContent<T extends object>(typeName: TreeNodeSchemaIdentifier, content: T): T {
	const copy =
		content instanceof Map
			? (new Map(content) as T)
			: Array.isArray(content)
			? (content.slice() as T)
			: { ...content };

	return Object.defineProperty(copy, typeNameSymbol, { value: typeName });
}

type ProxyHydrator = (flexNode: FlexTreeNode | undefined) => void;
const noopHydrator: ProxyHydrator = () => {};

/** The result returned by {@link extractFactoryContent} and its related helpers. */
interface ExtractedFactoryContent<out T = FactoryContent> {
	/** The content with the factory subtrees replaced. */
	readonly content: T;
	/**
	 * A function which walks all factory-created object that underwent replacement/extraction.
	 * Before hydration, those objects are unusable (see {@link createRawObjectProxy}).
	 * However, after the content is fully inserted into the tree the `hydrateProxies` function may be invoked in order to update the contents of these objects such that they become a mirror of the content in the tree.
	 * This must be done before any calls to {@link getOrCreateNodeProxy} so that the "edit node to proxy" mapping is correctly updated (see {@link setFlexNode}).
	 */
	readonly hydrateProxies: ProxyHydrator;
}

/**
 * Given a content tree that is to be inserted into the shared tree, replace all subtrees that were created by factories
 * (via {@link SharedTreeObjectFactory.create}) with the content that was passed to those factories.
 * @param content - the content being inserted which may be, and/or may contain, factory-created content
 * @param insertedAtIndex - if the content being inserted is list content, this must be the index in the list at which the content is being inserted
 * @returns the result of the content replacement and a {@link ExtractedFactoryContent.hydrateProxies} function which must be invoked if present.
 * @remarks
 * This functions works recursively.
 * Factory-created objects that are nested inside of the content passed to other factory-created objects, and so on, will be in-lined.
 * This function also adds the hidden {@link typeNameSymbol} of each object schema to the output.
 * @example
 * ```ts
 * const x = foo.create({
 *   a: 3, b: bar.create({
 *     c: [baz.create({ d: 5 })]
 *   })
 * });
 * const y = extractFactoryContent(x);
 * y === {
 *   [typeNameSymbol]: "foo", a: 3, b: {
 *     [typeNameSymbol]: "bar", c: [{ [typeNameSymbol]: "baz", d: 5 }]
 *  }
 * }
 * ```
 */
export function extractFactoryContent(
	input: InsertableContent,
	insertedAtIndex = 0,
): ExtractedFactoryContent {
	let content: FactoryContent;
	let fromFactory = false;
	const rawFlexNode = tryGetFlexNode(input);
	if (rawFlexNode !== undefined) {
		const factoryContent = extractRawNodeContent(rawFlexNode);
		if (factoryContent === undefined) {
			// We were passed a proxy, but that proxy doesn't have any raw content.
			throw new Error("Cannot insert a node that is already in the tree");
		}
		content = factoryContent;
		fromFactory = true;
	} else {
		content = input as FactoryContent;
	}

	assert(
		!(content instanceof NodeBase),
		0x844 /* Unhydrated insertion content should have FlexNode */,
	);

	let type: NodeKind;
	let extractedContent: ExtractedFactoryContent;
	if (isReadonlyArray(content)) {
		type = NodeKind.Array;
		extractedContent = extractContentArray(
			content as readonly FactoryContent[],
			insertedAtIndex,
		);
	} else if (content instanceof Map) {
		type = NodeKind.Map;
		extractedContent = extractContentMap(content as ReadonlyMap<string, FactoryContent>);
	} else if (typeof content === "object" && content !== null && !isFluidHandle(content)) {
		type = NodeKind.Object;
		extractedContent = extractContentObject(content as object);
	} else {
		extractedContent = { content, hydrateProxies: noopHydrator };
		type = NodeKind.Leaf;
	}

	if (input instanceof NodeBase) {
		const kindFromSchema = getNodeKind(input);
		assert(kindFromSchema === type, 0x845 /* kind of data should match kind of schema */);
	}

	if (fromFactory) {
		return {
			content: extractedContent.content,
			hydrateProxies: (flexNode) => {
				// This makes the input proxy usable and updates the proxy cache
				setFlexNode(input as TreeNode, flexNode ?? fail("Expected edit node"));
				extractedContent.hydrateProxies(flexNode);
			},
		};
	}

	return extractedContent;
}

/**
 * @param insertedAtIndex - Supply this if the extracted array content will be inserted into an existing list in the tree.
 */
function extractContentArray(
	input: readonly FactoryContent[],
	insertedAtIndex: number,
): ExtractedFactoryContent {
	const output: FactoryContent[] = [];
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	const hydrators: [index: number, hydrate: ProxyHydrator][] = [];
	for (let i = 0; i < input.length; i++) {
		const { content: childContent, hydrateProxies } = extractFactoryContent(input[i]);
		output.push(childContent);
		// The conditional here is an optimization so that primitive items don't incur boxed reads for hydration
		if (hydrateProxies !== noopHydrator) {
			hydrators.push([i, hydrateProxies]);
		}
	}
	return {
		content: output,
		hydrateProxies: (flexNode: FlexTreeNode | undefined) => {
			assert(
				flexNode !== undefined,
				0x7f6 /* Expected edit node to be defined when hydrating list */,
			);
			assert(
				schemaIsFieldNode(flexNode.schema),
				0x7f7 /* Expected field node when hydrating list */,
			);
			hydrators.forEach(([i, hydrate]) =>
				hydrate(
					getListChildNode(
						flexNode as FlexTreeFieldNode<FieldNodeSchema>,
						insertedAtIndex + i,
					),
				),
			);
		},
	};
}

function extractContentMap(input: ReadonlyMap<string, FactoryContent>): ExtractedFactoryContent {
	const output = new Map();
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	const hydrators: [key: string, hydrate: ProxyHydrator][] = [];
	for (const [key, value] of input) {
		const { content: childContent, hydrateProxies } = extractFactoryContent(value);
		output.set(key, childContent);
		// The conditional here is an optimization so that primitive values don't incur boxed reads for hydration
		if (hydrateProxies !== noopHydrator) {
			hydrators.push([key, hydrateProxies]);
		}
	}
	return {
		content: output,
		hydrateProxies: (flexNode: FlexTreeNode | undefined) => {
			assert(
				flexNode !== undefined,
				0x7f8 /* Expected edit node to be defined when hydrating map */,
			);
			assert(schemaIsMap(flexNode.schema), 0x7f9 /* Expected map node when hydrating map */);
			hydrators.forEach(([key, hydrate]) =>
				hydrate(getMapChildNode(flexNode as FlexTreeMapNode<MapNodeSchema>, key)),
			);
		},
	};
}

function extractContentObject(input: {
	readonly [P in string]?: FactoryContent;
}): ExtractedFactoryContent {
	const output: Record<string, FactoryContent> = {};
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	const hydrators: [key: string, hydrate: ProxyHydrator][] = [];
	for (const [key, value] of Object.entries(input)) {
		// Treat undefined fields and missing fields the same.
		// Generally tree does not require explicit undefined values at runtime despite some of the schema aware type checking currently requiring it.
		if (value !== undefined) {
			const { content: childContent, hydrateProxies } = extractFactoryContent(value);
			output[key] = childContent;
			hydrators.push([key, hydrateProxies]);
		}
	}

	return {
		content: output,
		hydrateProxies: (flexNode: FlexTreeNode | undefined) => {
			assert(
				flexNode !== undefined,
				0x7fa /* Expected edit node to be defined when hydrating object */,
			);
			assert(
				schemaIsObjectNode(flexNode.schema),
				0x7fb /* Expected object node when hydrating object content */,
			);
			hydrators.forEach(([key, hydrate]) =>
				hydrate(getObjectChildNode(flexNode as FlexTreeObjectNode, key)),
			);
		},
	};
}

/**
 * Content which can be used to build a node.
 * @remarks
 * Can contain unhydrated nodes, but can not be an unhydrated node at the root.
 */
export type FactoryContent =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| ReadonlyMap<string, InsertableContent>
	| readonly InsertableContent[]
	| {
			readonly [P in string]?: InsertableContent;
	  };

/**
 * Content which can be inserted into a tree.
 */
export type InsertableContent = Unhydrated<TreeNode> | FactoryContent;

function getListChildNode(
	listNode: FlexTreeFieldNode<FieldNodeSchema>,
	index: number,
): FlexTreeNode | undefined {
	const field = listNode.tryGetField(EmptyKey);
	assert(
		field?.schema.kind === FieldKinds.sequence,
		0x7fc /* Expected sequence field when hydrating list */,
	);
	return (field as FlexTreeSequenceField<AllowedTypes>).boxedAt(index);
}

function getMapChildNode(
	mapNode: FlexTreeMapNode<MapNodeSchema>,
	key: string,
): FlexTreeNode | undefined {
	const field = mapNode.getBoxed(key);
	assert(
		field.schema.kind === FieldKinds.optional,
		0x7fd /* Sequence field kind is unsupported as map values */,
	);
	return (field as FlexTreeOptionalField<AllowedTypes>).boxedContent;
}

function getObjectChildNode(objectNode: FlexTreeObjectNode, key: string): FlexTreeNode | undefined {
	const field =
		objectNode.tryGetField(brand(key)) ?? fail("Expected a field for inserted content");
	assert(
		field.schema.kind === FieldKinds.required || field.schema.kind === FieldKinds.optional,
		0x7fe /* Expected required or optional field kind */,
	);
	return (field as FlexTreeRequiredField<AllowedTypes> | FlexTreeOptionalField<AllowedTypes>)
		.boxedContent;
}

/**
 * Run the given function `modify`.
 * If the function results in any changes to the direct children of `parent`, `after` will be run immediately thereafter.
 */
function modifyChildren<T extends FlexTreeNode>(
	parent: T,
	modify: (parent: T) => void,
	after?: (parent: T) => void,
): void {
	const offNextChange = parent[onNextChange](() => after?.(parent));
	modify(parent);
	// `onNextChange` unsubscribes itself after firing once. However, there is no guarantee that it will fire.
	// For example, the `modify` function may result in a no-op that doesn't trigger an edit (e.g. inserting `[]` into a list).
	// In those cases, we must unsubscribe manually here. If `modify` was not a no-op, it does no harm to call this function anyway.
	offNextChange();
}

// TODO: Replace this with calls to `Tree.schema(node).kind` when dependency cycles are no longer a problem.
function getNodeKind(node: NodeBase): NodeKind {
	return (
		getClassSchema(getFlexNode(node as TreeNode).schema)?.kind ??
		fail("NodeBase should always have class schema")
	);
}
