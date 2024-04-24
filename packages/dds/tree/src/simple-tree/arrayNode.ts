/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { EmptyKey, TreeNodeSchemaIdentifier, TreeValue } from "../core/index.js";
import {
	FlexAllowedTypes,
	FlexFieldNodeSchema,
	FlexTreeFieldNode,
	FlexTreeNode,
	FlexTreeSequenceField,
	FlexTreeTypedField,
	FlexTreeUnboxField,
	isFlexTreeNode,
} from "../feature-libraries/index.js";
import {
	FactoryContent,
	InsertableContent,
	getOrCreateNodeProxy,
	markContentType,
	prepareContentForInsert,
} from "./proxies.js";
import { getFlexNode, setFlexNode } from "./proxyBinding.js";
import { getSimpleFieldSchema, getSimpleNodeSchema } from "./schemaCaching.js";
import {
	NodeKind,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	ImplicitFieldSchema,
	TreeNodeSchemaClass,
	WithType,
	TreeNodeSchema,
} from "./schemaTypes.js";
import { cursorFromFieldData } from "./toMapTree.js";
import { TreeNode } from "./types.js";
import { fail } from "../util/index.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { RawTreeNode, rawError } from "./rawNode.js";

/**
 * A generic array type, used to defined types like {@link (TreeArrayNode:interface)}.
 *
 * @privateRemarks
 * Inlining this into TreeArrayNode causes recursive array use to stop compiling.
 *
 * @public
 */
export interface TreeArrayNodeBase<out T, in TNew, in TMoveFrom>
	extends ReadonlyArray<T>,
		TreeNode {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if `index` is not in the range [0, `array.length`).
	 */
	insertAt(index: number, ...value: (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the start of the array.
	 * @param value - The content to insert.
	 */
	insertAtStart(...value: (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the end of the array.
	 * @param value - The content to insert.
	 */
	insertAtEnd(...value: (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if `index` is not in the range [0, `array.length`).
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the array.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if `start` is not in the range [0, `array.length`).
	 * @throws Throws if `end` is less than `start`.
	 * If `end` is not supplied or is greater than the length of the array, all items after `start` are removed.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToStart(sourceIndex: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToStart(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToEnd(sourceIndex: number): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToEnd(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 * @param index - The index to move the item to.
	 * This is based on the state of the array before moving the source item.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`).
	 */
	moveToIndex(index: number, sourceIndex: number): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 * @param index - The index to move the item to.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`).
	 */
	moveToIndex(index: number, sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 * @param index - The index to move the items to.
	 * This is based on the state of the array before moving the source items.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if any of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: TMoveFrom,
	): void;
}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the array mutation APIs.
 *
 * @typeParam TAllowedTypes - Schema for types which are allowed as members of this array.
 *
 * @public
 */
export interface TreeArrayNode<TAllowedTypes extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeArrayNodeBase<
		TreeNodeFromImplicitAllowedTypes<TAllowedTypes>,
		InsertableTreeNodeFromImplicitAllowedTypes<TAllowedTypes>,
		TreeArrayNode
	> {}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the array mutation APIs.
 * @public
 */
export const TreeArrayNode = {
	/**
	 * Wrap an iterable of items to inserted as consecutive items in a array.
	 * @remarks
	 * The object returned by this function can be inserted into a {@link (TreeArrayNode:interface)}.
	 * Its contents will be inserted consecutively in the corresponding location in the array.
	 * @example
	 * ```ts
	 * array.insertAtEnd(TreeArrayNode.spread(iterable))
	 * ```
	 */
	spread: <T>(content: Iterable<T>) => create(content),
};

/**
 * Package internal construction API.
 * Use {@link (TreeArrayNode:variable).spread} to create an instance of this type instead.
 */
let create: <T>(content: Iterable<T>) => IterableTreeArrayContent<T>;

/**
 * Used to insert iterable content into a {@link (TreeArrayNode:interface)}.
 * Use {@link (TreeArrayNode:variable).spread} to create an instance of this type.
 * @public
 */
export class IterableTreeArrayContent<T> implements Iterable<T> {
	static {
		create = <T2>(content: Iterable<T2>) => new IterableTreeArrayContent(content);
	}

	private constructor(private readonly content: Iterable<T>) {}

	/**
	 * Iterates over content for nodes to insert.
	 */
	public [Symbol.iterator](): Iterator<T> {
		return this.content[Symbol.iterator]();
	}
}

/**
 * Given a array node proxy, returns its underlying LazySequence field.
 */
function getSequenceField<TTypes extends FlexAllowedTypes>(
	arrayNode: TreeArrayNode,
): FlexTreeSequenceField<TTypes> {
	return getFlexNode(arrayNode).getBoxed(EmptyKey) as FlexTreeSequenceField<TTypes>;
}

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
		sequenceField.context.forest,
	);
}

// #region Create dispatch map for array nodes

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

/**
 * PropertyDescriptorMap used to build the prototype for our array node dispatch object.
 */
const arrayNodePrototypeProperties: PropertyDescriptorMap = {
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
			const sequenceNode = getFlexNode(this);
			const sequenceField = getSequenceField(this);

			const content = contextualizeInsertedArrayContent(value, sequenceField);

			const simpleNodeSchema = getSimpleNodeSchema(sequenceNode.schema);
			assert(simpleNodeSchema.kind === NodeKind.Array, 0x912 /* Expected array schema */);

			const simpleFieldSchema = getSimpleFieldSchema(
				sequenceField.schema,
				simpleNodeSchema.info as ImplicitFieldSchema,
			);

			sequenceField.insertAt(index, cursorFromFieldData(content, simpleFieldSchema));
		},
	},
	insertAtStart: {
		value(
			this: TreeArrayNode,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceNode = getFlexNode(this);
			const sequenceField = getSequenceField(this);

			const content = contextualizeInsertedArrayContent(value, sequenceField);

			const simpleNodeSchema = getSimpleNodeSchema(sequenceNode.schema);
			assert(simpleNodeSchema.kind === NodeKind.Array, 0x913 /* Expected array schema */);

			const simpleFieldSchema = getSimpleFieldSchema(
				sequenceField.schema,
				simpleNodeSchema.info as ImplicitFieldSchema,
			);

			sequenceField.insertAtStart(cursorFromFieldData(content, simpleFieldSchema));
		},
	},
	insertAtEnd: {
		value(
			this: TreeArrayNode,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceNode = getFlexNode(this);
			const sequenceField = getSequenceField(this);

			const content = contextualizeInsertedArrayContent(value, sequenceField);

			const simpleNodeSchema = getSimpleNodeSchema(sequenceNode.schema);
			assert(simpleNodeSchema.kind === NodeKind.Array, 0x914 /* Expected array schema */);

			const simpleFieldSchema = getSimpleFieldSchema(
				sequenceField.schema,
				simpleNodeSchema.info as ImplicitFieldSchema,
			);

			sequenceField.insertAtEnd(cursorFromFieldData(content, simpleFieldSchema));
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

// #endregion

/**
 * Attempts to coerce the given property key to an integer index property.
 * @param key - The property key to coerce.
 * @param exclusiveMax - This restricts the range in which the resulting index is allowed to be.
 * The coerced index of `key` must be less than `exclusiveMax` or else this function will return `undefined`.
 * This is useful for reading an array within the bounds of its length, e.g. `asIndex(key, array.length)`.
 */
export function asIndex(key: string | symbol, exclusiveMax: number): number | undefined {
	if (typeof key !== "string") {
		return undefined;
	}

	// TODO: It may be worth a '0' <= ch <= '9' check before calling 'Number' to quickly
	// reject 'length' as an index, or even parsing integers ourselves.
	const asNumber = Number(key);
	if (!Number.isInteger(asNumber)) {
		return undefined;
	}

	// Check that the original string is the same after converting to a number and back again.
	// This prevents keys like "5.0", "0x5", " 5" from coercing to 5, and keys like " " or "" from coercing to 0.
	const asString = String(asNumber);
	if (asString !== key) {
		return undefined;
	}

	// TODO: See 'matrix/range.ts' for fast integer coercing + range check.
	return 0 <= asNumber && asNumber < exclusiveMax ? asNumber : undefined;
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param proxyTarget - Target object of the proxy. Must provide an own `length` value property
 * (which is not used but must exist for getOwnPropertyDescriptor invariants) and the array functionality from {@link arrayNodePrototype}.
 * Controls the prototype exposed by the produced proxy.
 * @param dispatchTarget - provides the functionally of the node, implementing all fields.
 */
function createArrayNodeProxy(
	allowAdditionalProperties: boolean,
	proxyTarget: object,
	dispatchTarget: object,
): TreeArrayNode {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeArrayNode = new Proxy<TreeArrayNode>(proxyTarget as TreeArrayNode, {
		get: (target, key, receiver) => {
			const field = getSequenceField(receiver);
			const maybeIndex = asIndex(key, field.length);

			if (maybeIndex === undefined) {
				if (key === "length") {
					return field.length;
				}

				// Pass the proxy as the receiver here, so that any methods on
				// the prototype receive `proxy` as `this`.
				return Reflect.get(dispatchTarget, key, receiver) as unknown;
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
				return Reflect.set(dispatchTarget, key, newValue, receiver);
			}

			// Array nodes treat all non-negative integer indexes as array access.
			// Using Infinity here (rather than length) ensures that indexing past the end doesn't create additional session local properties.
			const maybeIndex = asIndex(key, Number.POSITIVE_INFINITY);
			if (maybeIndex !== undefined) {
				// For MVP, we otherwise disallow setting properties (mutation is only available via the array node mutation APIs).
				return false;
			}
			return allowAdditionalProperties ? Reflect.set(target, key, newValue) : false;
		},
		has: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatchTarget, key);
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
			return Reflect.getOwnPropertyDescriptor(dispatchTarget, key);
		},
	});
	return proxy;
}

/**
 * Define a {@link TreeNodeSchema} for a {@link (TreeArrayNode:interface)}.
 *
 * @param name - Unique identifier for this schema including the factory's scope.
 */
export function arraySchema<
	TName extends string,
	const T extends ImplicitAllowedTypes,
	const ImplicitlyConstructable extends boolean,
>(
	base: TreeNodeSchemaClass<
		TName,
		NodeKind.Array,
		TreeNode & WithType<TName>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		ImplicitlyConstructable,
		T
	>,
	customizable: boolean,
) {
	// This class returns a proxy from its constructor to handle numeric indexing.
	// Alternatively it could extend a normal class which gets tons of numeric properties added.
	class schema extends base {
		public constructor(input: Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>) {
			super(input);

			const proxyTarget = customizable ? this : [];

			if (customizable) {
				// Since proxy reports this as a "non-configurable" property, it must exist on the underlying object used as the proxy target, not as an inherited property.
				// This should not get used as the proxy should intercept all use.
				Object.defineProperty(this, "length", {
					value: NaN,
					writable: true,
					enumerable: false,
					configurable: false,
				});
			}

			const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
			assert(flexSchema instanceof FlexFieldNodeSchema, 0x915 /* invalid flex schema */);
			const flexNode: FlexTreeNode = isFlexTreeNode(input)
				? input
				: new RawFieldNode(flexSchema, copyContent(flexSchema.name, input) as object);

			const proxy: TreeNode = createArrayNodeProxy(customizable, proxyTarget, this);
			setFlexNode(proxy, flexNode);
			return proxy as unknown as schema;
		}

		public toJSON(): unknown {
			// This override causes the class instance to `JSON.stringify` as `[a, b]` rather than `{0: a, 1: b}`.
			return Array.from(this as unknown as TreeArrayNode);
		}

		// Instances of this class are used as the dispatch object for the proxy,
		// and thus its set of keys is used to implement `has` (for the `in` operator) for the non-numeric cases.
		// Therefore it must must include `length`,
		// even though this "length" is never invoked (due to being shadowed by the proxy provided own property).
		public get length() {
			return fail("Proxy should intercept length");
		}
	}

	// Setup array functionality
	Object.defineProperties(schema.prototype, arrayNodePrototypeProperties);

	return schema as typeof base as TreeNodeSchemaClass<
		TName,
		NodeKind.Array,
		TreeArrayNode<T> & WithType<TName>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
		ImplicitlyConstructable,
		T
	>;
}

/**
 * The implementation of a field node created by {@link createRawNode}.
 */
class RawFieldNode<TSchema extends FlexFieldNodeSchema>
	extends RawTreeNode<TSchema, InsertableContent>
	implements FlexTreeFieldNode<TSchema>
{
	public get content(): FlexTreeUnboxField<TSchema["info"]> {
		throw rawError("Reading content of an array node");
	}

	public get boxedContent(): FlexTreeTypedField<TSchema["info"]> {
		throw rawError("Reading boxed content of an array node");
	}
}

function copyContent<T>(typeName: TreeNodeSchemaIdentifier, content: Iterable<T>): T[] {
	const copy = Array.from(content);
	markContentType(typeName, copy);
	return copy;
}
