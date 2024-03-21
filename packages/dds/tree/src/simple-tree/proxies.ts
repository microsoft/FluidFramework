/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { AnchorSet, EmptyKey, FieldKey, TreeValue, UpPath } from "../core/index.js";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { LazyObjectNode, getBoxedField } from "../feature-libraries/flex-tree/lazyNode.js";
import {
	FieldKinds,
	FlexAllowedTypes,
	FlexFieldSchema,
	FlexObjectNodeSchema,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeNodeSchema,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeTypedField,
	isFluidHandle,
	typeNameSymbol,
} from "../feature-libraries/index.js";
import { Mutable, brand, fail, isReadonlyArray } from "../util/index.js";
import { anchorProxy, getFlexNode, tryGetFlexNode, tryGetProxy } from "./proxyBinding.js";
import { extractRawNodeContent } from "./rawNode.js";
import {
	type InsertableTypedNode,
	NodeKind,
	TreeMapNode,
	type TreeNodeSchema,
} from "./schemaTypes.js";
import { cursorFromFieldData, cursorFromNodeData } from "./toMapTree.js";
import { IterableTreeArrayContent, TreeArrayNode } from "./treeArrayNode.js";
import { TreeNode, Unhydrated } from "./types.js";

/**
 * Detects if the given 'candidate' is a TreeNode.
 *
 * @remarks
 * Supports both Hydrated and {@link Unhydrated} TreeNodes, both of which return true.
 *
 * Because the common usage is to check if a value being inserted/set is a TreeNode,
 * this function permits calling with primitives as well as objects.
 *
 * Primitives will always return false (as they are copies of data, not references to nodes).
 *
 * @param candidate - Value which may be a TreeNode
 * @returns true if the given 'candidate' is a hydrated TreeNode.
 */
export function isTreeNode(candidate: unknown): candidate is TreeNode | Unhydrated<TreeNode> {
	return tryGetFlexNode(candidate) !== undefined;
}

/**
 * Retrieve the associated proxy for the given field.
 * */
export function getProxyForField(field: FlexTreeField): TreeNode | TreeValue | undefined {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.required>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(asValue.boxedContent);
		}
		case FieldKinds.optional: {
			const asValue = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.optional>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.

			const maybeContent = asValue.boxedContent;

			// Normally, empty fields are unreachable due to the behavior of 'tryGetField'.  However, the
			// root field is a special case where the field is always present (even if empty).
			return maybeContent === undefined ? undefined : getOrCreateNodeProxy(maybeContent);
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a array node proxy, making
			// this case unreachable as long as users follow the 'array recipe'.
			fail("'sequence' field is unexpected.");
		}
		default:
			fail("invalid field kind");
	}
}

/**
 * A symbol for storing TreeNodeSchema on FlexTreeNode's schema.
 */
export const simpleSchemaSymbol: unique symbol = Symbol(`simpleSchema`);

export function getSimpleSchema(schema: FlexTreeNodeSchema): TreeNodeSchema | undefined {
	if (simpleSchemaSymbol in schema) {
		return schema[simpleSchemaSymbol] as TreeNodeSchema;
	}
	return undefined;
}

export function getOrCreateNodeProxy(flexNode: FlexTreeNode): TreeNode | TreeValue {
	const cachedProxy = tryGetProxy(flexNode);
	if (cachedProxy !== undefined) {
		return cachedProxy;
	}

	const schema = flexNode.schema;
	const classSchema = getSimpleSchema(schema);
	assert(classSchema !== undefined, "node without schema");
	if (typeof classSchema === "function") {
		const simpleSchema = classSchema as unknown as new (dummy: FlexTreeNode) => TreeNode;
		return new simpleSchema(flexNode);
	} else {
		return (classSchema as { create(data: FlexTreeNode): TreeNode }).create(flexNode);
	}
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 */
export function createObjectProxy<TSchema extends FlexObjectNodeSchema>(
	schema: TSchema,
	allowAdditionalProperties: boolean,
	targetObject: object = {},
): TreeNode {
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
			const flexNodeSchema = flexNode.schema;
			assert(flexNodeSchema instanceof FlexObjectNodeSchema, 0x888 /* invalid schema */);
			const fieldSchema = flexNodeSchema.objectNodeFields.get(key as FieldKey);

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
						| FlexTreeRequiredField<FlexAllowedTypes>
						| FlexTreeOptionalField<FlexAllowedTypes>;

					const content = prepareContentForInsert(value, flexNode.context.anchorSet);
					const cursor = cursorFromNodeData(
						content,
						flexNode.context.schema,
						fieldSchema.allowedTypeSet,
					);
					typedField.content = cursor;
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
	}) as TreeNode;
	return proxy;
}

/**
 * Given a array node proxy, returns its underlying LazySequence field.
 */
export const getSequenceField = <TTypes extends FlexAllowedTypes>(arrayNode: TreeArrayNode) =>
	getFlexNode(arrayNode).content as FlexTreeSequenceField<TTypes>;

// Used by 'insert*()' APIs to converts new content (expressed as a proxy union) to contextually
// typed data prior to forwarding to 'LazySequence.insert*()'.
function contextualizeInsertedArrayContent(
	content: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[],
	sequenceField: FlexTreeSequenceField<FlexAllowedTypes>,
): FactoryContent {
	return prepareContentForInsert(
		content.flatMap((c): InsertableContent[] =>
			c instanceof IterableTreeArrayContent ? Array.from(c) : [c],
		),
		sequenceField.context.anchorSet,
	);
}

// #region Create dispatch map for array nodes

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

/**
 * PropertyDescriptorMap used to build the prototype for our array node dispatch object.
 */
export const arrayNodePrototypeProperties: PropertyDescriptorMap = {
	// We manually add [Symbol.iterator] to the dispatch map rather than use '[fn.name] = fn' as
	// below when adding 'Array.prototype.*' properties to this map because 'Array.prototype[Symbol.iterator].name'
	// returns "values" (i.e., Symbol.iterator is an alias for the '.values()' function.)
	[Symbol.iterator]: {
		value: Array.prototype[Symbol.iterator],
	},
	at: {
		value(this: TreeArrayNode, index: number): TreeNode | TreeValue | undefined {
			const field = getSequenceField(this);
			const val = field.boxedAt(index);

			if (val === undefined) {
				return val;
			}

			return getOrCreateNodeProxy(val);
		},
	},
	insertAt: {
		value(
			this: TreeArrayNode,
			index: number,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);
			const content = contextualizeInsertedArrayContent(value, sequenceField);
			sequenceField.insertAt(
				index,
				cursorFromFieldData(content, sequenceField.context.schema, sequenceField.schema),
			);
		},
	},
	insertAtStart: {
		value(
			this: TreeArrayNode,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);
			const content = contextualizeInsertedArrayContent(value, sequenceField);
			sequenceField.insertAtStart(
				cursorFromFieldData(content, sequenceField.context.schema, sequenceField.schema),
			);
		},
	},
	insertAtEnd: {
		value(
			this: TreeArrayNode,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);
			const content = contextualizeInsertedArrayContent(value, sequenceField);
			sequenceField.insertAtEnd(
				cursorFromFieldData(content, sequenceField.context.schema, sequenceField.schema),
			);
		},
	},
	removeAt: {
		value(this: TreeArrayNode, index: number): void {
			getSequenceField(this).removeAt(index);
		},
	},
	removeRange: {
		value(this: TreeArrayNode, start?: number, end?: number): void {
			getSequenceField(this).removeRange(start, end);
		},
	},
	moveToStart: {
		value(this: TreeArrayNode, sourceIndex: number, source?: TreeArrayNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToStart(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToStart(sourceIndex);
			}
		},
	},
	moveToEnd: {
		value(this: TreeArrayNode, sourceIndex: number, source?: TreeArrayNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToEnd(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToEnd(sourceIndex);
			}
		},
	},
	moveToIndex: {
		value(
			this: TreeArrayNode,
			index: number,
			sourceIndex: number,
			source?: TreeArrayNode,
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
			this: TreeArrayNode,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeArrayNode,
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
			this: TreeArrayNode,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeArrayNode,
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
			this: TreeArrayNode,
			index: number,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeArrayNode,
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
// to the array node proxy.  Over time, we should replace these with efficient implementations on LazySequence
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
	arrayNodePrototypeProperties[fn.name] = { value: fn };
});

/* eslint-enable @typescript-eslint/unbound-method */

const arrayNodePrototype = Object.create(Object.prototype, arrayNodePrototypeProperties);

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
 * If not provided `[]` is used for the target and a separate object created to dispatch array methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide an own `length` value property
 * (which is not used but must exist for getOwnPropertyDescriptor invariants) and the array functionality from {@link arrayNodePrototype}.
 */
export function createArrayNodeProxy(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeArrayNode {
	const targetObject = customTargetObject ?? [];

	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target, because we need
	// the proxy target to be a plain JS array (see comments below when we instantiate the Proxy).
	// Own properties on the dispatch object are surfaced as own properties of the proxy.
	// (e.g., 'length', which is defined below).
	//
	// Properties normally inherited from 'Array.prototype' are surfaced via the prototype chain.
	const dispatch: object =
		customTargetObject ??
		Object.create(arrayNodePrototype, {
			// This dispatch object's set of keys is used to implement `has` (for the `in` operator) for the non-numeric cases, and therefor must include `length`.
			length: {
				get(this: TreeArrayNode) {
					fail("Proxy should intercept length");
				},
				set() {
					fail("Proxy should intercept length");
				},
				enumerable: false,
				configurable: false,
			},
		});

	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeArrayNode = new Proxy<TreeArrayNode>(targetObject as any, {
		get: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);

			if (maybeIndex === undefined) {
				if (key === "length") {
					return field.length;
				}

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
			if (key === "length") {
				// To allow "length" to look like "length" on an array, getOwnPropertyDescriptor has to report it as a writable value.
				// This means the proxy target must provide a length value, but since it can't use getters and setters, it can't be correct.
				// Therefor length has to be handled in this proxy.
				// Since its not actually mutable, return false so setting it will produce a type error.
				return false;
			}

			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue, proxy);
			}

			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				// For MVP, we otherwise disallow setting properties (mutation is only available via the array node mutation APIs).
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
			const keys: (string | symbol)[] = Array.from(
				{ length: field.length },
				(_, index) => `${index}`,
			);

			if (allowAdditionalProperties) {
				keys.push(...Reflect.ownKeys(target));
			} else {
				keys.push("length");
			}
			return keys;
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
					value: field.length,
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
			value: InsertableTypedNode<TreeNodeSchema>,
		): TreeMapNode {
			const node = getFlexNode(this);
			const content = prepareContentForInsert(
				value as InsertableContent,
				node.context.anchorSet,
			);

			const cursor = cursorFromNodeData(
				content,
				node.context.schema,
				node.schema.mapFields.allowedTypeSet,
			);
			node.set(key, cursor);
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
export function createMapProxy(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeMapNode {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	const dispatch: object =
		customTargetObject ??
		Object.create(mapPrototype, {
			// Empty - JavaScript Maps do not expose any "own" properties.
		});
	const targetObject: object = customTargetObject ?? new Map<string, TreeNode>();

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy<TreeMapNode>(targetObject as TreeMapNode, {
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
	});
	return proxy;
}

// #region Content insertion and proxy binding

/** The path of a proxy, relative to the root of the content tree that the proxy belongs to */
interface RelativeProxyPath {
	readonly path: UpPath;
	readonly proxy: TreeNode;
}

/** All {@link RelativeProxyPath}s that are under the given root path */
interface RootedProxyPaths {
	readonly rootPath: UpPath;
	readonly proxyPaths: RelativeProxyPath[];
}

/**
 * Records any proxies in the given content tree and does the necessary bookkeeping to ensure they are synchronized with subsequent reads of the tree.
 * @remarks If the content tree contains any proxies, this function must be called just prior to inserting the content into the tree.
 * Specifically, no other content may be inserted into the tree between the invocation of this function and the insertion of `content`.
 * The insertion of `content` must occur or else this function will cause memory leaks.
 * @param content - the tree of content to be inserted, of which any of its object/map/array nodes might be a proxy
 * @param anchors - the {@link AnchorSet} for the tree
 * @returns The content after having all proxies replaced inline with plain javascript objects.
 * See {@link extractFactoryContent} for more details.
 */
export function prepareContentForInsert(
	content: InsertableContent,
	anchors: AnchorSet,
): FactoryContent {
	if (isReadonlyArray(content)) {
		return prepareArrayContentForInsert(content, anchors);
	}

	const proxies: RootedProxyPaths = {
		rootPath: { parent: undefined, parentField: EmptyKey, parentIndex: 0 },
		proxyPaths: [],
	};
	const extractedContent = extractFactoryContent(content, {
		path: proxies.rootPath,
		onVisitProxy: (p, proxy) => {
			proxies.proxyPaths.push({ path: p, proxy });
		},
	});

	bindProxies([proxies], anchors);
	return extractedContent;
}

function prepareArrayContentForInsert(
	content: readonly InsertableContent[],
	anchors: AnchorSet,
): FactoryContent {
	const proxies: RootedProxyPaths[] = [];
	const extractedContent: FactoryContent[] = [];
	for (let i = 0; i < content.length; i++) {
		proxies.push({
			rootPath: {
				parent: undefined,
				parentField: EmptyKey,
				parentIndex: 0,
			},
			proxyPaths: [],
		});
		extractedContent.push(
			extractFactoryContent(content[i], {
				path: proxies[i].rootPath,
				onVisitProxy: (p, proxy) => {
					proxies[i].proxyPaths.push({ path: p, proxy });
				},
			}),
		);
	}

	bindProxies(proxies, anchors);
	return extractedContent;
}

function bindProxies(proxies: RootedProxyPaths[], anchors: AnchorSet): void {
	let i = 0;
	const off = anchors.on("onCreate", (field) => {
		(proxies[i].rootPath as Mutable<UpPath>).parentField = field;
		for (const { path, proxy } of proxies[i].proxyPaths) {
			anchorProxy(anchors, path, proxy);
		}
		if (++i === proxies.length) {
			off();
		}
	});
}

/**
 * Given a content tree that is to be inserted into the shared tree, replace all subtrees that were created by factories
 * (via {@link SharedTreeObjectFactory.create}) with the content that was passed to those factories.
 * @param content - the content being inserted which may be, and/or may contain, factory-created content
 * @param onVisitProxy - an optional callback that will run for each proxy (i.e. object created by a factory) found in the inserted content
 * @param insertedAtIndex - if the content being inserted is array node content, this must be the index in the array node at which the content is being inserted
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
	visitProxies?: {
		path: UpPath;
		onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
	},
): FactoryContent {
	let content: FactoryContent;
	const rawFlexNode = tryGetFlexNode(input);
	if (rawFlexNode !== undefined) {
		const factoryContent = extractRawNodeContent(rawFlexNode);
		if (factoryContent === undefined) {
			// We were passed a proxy, but that proxy doesn't have any raw content.
			throw new Error("Cannot insert a node that is already in the tree");
		}
		visitProxies?.onVisitProxy(visitProxies.path, input as TreeNode);
		content = factoryContent;
		// fromFactory = true;
	} else {
		content = input as FactoryContent;
	}

	assert(!isTreeNode(content), 0x844 /* Unhydrated insertion content should have FlexNode */);

	let type: NodeKind;
	let extractedContent: FactoryContent;
	if (isReadonlyArray(content)) {
		type = NodeKind.Array;
		extractedContent = extractContentArray(content as readonly FactoryContent[], visitProxies);
	} else if (content instanceof Map) {
		type = NodeKind.Map;
		extractedContent = extractContentMap(
			content as ReadonlyMap<string, FactoryContent>,
			visitProxies,
		);
	} else if (typeof content === "object" && content !== null && !isFluidHandle(content)) {
		type = NodeKind.Object;
		extractedContent = extractContentObject(content as object, visitProxies);
	} else {
		extractedContent = content;
		type = NodeKind.Leaf;
	}

	if (rawFlexNode !== undefined) {
		const kindFromSchema =
			getSimpleSchema(rawFlexNode.schema)?.kind ??
			fail("NodeBase should always have class schema");

		assert(kindFromSchema === type, 0x845 /* kind of data should match kind of schema */);
	}

	return extractedContent;
}

function extractContentArray(
	input: readonly FactoryContent[],
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output: FactoryContent[] = [];
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (let i = 0; i < input.length; i++) {
		const childContent = extractFactoryContent(
			input[i],
			visitProxies !== undefined
				? {
						path: {
							parent: visitProxies.path,
							parentField: EmptyKey,
							parentIndex: i,
						},
						onVisitProxy: visitProxies?.onVisitProxy,
				  }
				: undefined,
		);
		output.push(childContent);
	}
	return output;
}

function extractContentMap(
	input: ReadonlyMap<string, FactoryContent>,
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output = new Map();
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (const [key, value] of input) {
		const childContent = extractFactoryContent(
			value,
			visitProxies !== undefined
				? {
						path: {
							parent: visitProxies.path,
							parentField: brand(key),
							parentIndex: 0,
						},
						onVisitProxy: visitProxies?.onVisitProxy,
				  }
				: undefined,
		);
		output.set(key, childContent);
	}
	return output;
}

function extractContentObject(
	input: {
		readonly [P in string]?: FactoryContent;
	},
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output: Record<string, FactoryContent> = {};
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (const [key, value] of Object.entries(input)) {
		// Treat undefined fields and missing fields the same.
		// Generally tree does not require explicit undefined values at runtime despite some of the schema aware type checking currently requiring it.
		if (value !== undefined) {
			const childContent = extractFactoryContent(
				value,
				visitProxies !== undefined
					? {
							path: {
								parent: visitProxies.path,
								parentField: brand(key),
								parentIndex: 0,
							},
							onVisitProxy: visitProxies?.onVisitProxy,
					  }
					: undefined,
			);
			output[key] = childContent;
		}
	}
	return output;
}

// #endregion Content insertion and proxy binding

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
