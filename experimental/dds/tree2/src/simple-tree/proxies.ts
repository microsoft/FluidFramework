/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { brand, fail } from "../util";
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
	MapFieldSchema,
	FieldKinds,
	FlexTreeFieldNode,
	FlexibleFieldContent,
	FlexTreeMapNode,
	FlexTreeObjectNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeNode,
	FlexTreeTypedField,
	FlexTreeUnknownUnboxed,
	onNextChange,
	ContextuallyTypedNodeData,
	typeNameSymbol,
	isFluidHandle,
} from "../feature-libraries";
import { EmptyKey, FieldKey } from "../core";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { LazyObjectNode, getBoxedField } from "../feature-libraries/flex-tree/lazyNode";
import { createRawObjectNode, extractRawNodeContent } from "./rawObjectNode";
import {
	TreeField,
	TypedNode,
	TreeNodeUnion,
	TreeListNode,
	TreeMapNode,
	TreeObjectNode,
} from "./types";
import { tryGetEditNodeTarget, setEditNode, getEditNode, tryGetEditNode } from "./editNode";
import { IterableTreeListContent } from "./iterableTreeListContent";

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

export function getOrCreateNodeProxy<TSchema extends TreeNodeSchema>(
	editNode: FlexTreeNode,
): TypedNode<TSchema> {
	const cachedProxy = tryGetEditNodeTarget(editNode);
	if (cachedProxy !== undefined) {
		return cachedProxy as TypedNode<TSchema>;
	}

	const schema = editNode.schema;
	if (schemaIsLeaf(schema)) {
		return editNode.value as TypedNode<TSchema>;
	}
	if (schemaIsMap(schema)) {
		return setEditNode(
			createMapProxy(),
			editNode as FlexTreeMapNode<MapNodeSchema>,
		) as TypedNode<TSchema>;
	} else if (schemaIsFieldNode(schema)) {
		return setEditNode(
			createListProxy(),
			editNode as FlexTreeFieldNode<FieldNodeSchema>,
		) as TypedNode<TSchema>;
	} else if (schemaIsObjectNode(schema)) {
		return setEditNode(
			createObjectProxy(schema),
			editNode as FlexTreeObjectNode,
		) as TypedNode<TSchema>;
	} else {
		fail("unrecognized node kind");
	}
}

function createObjectProxy<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
): TreeObjectNode<TSchema> {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy(
		{},
		{
			get(target, key): unknown {
				const field = getEditNode(proxy).tryGetField(key as FieldKey);
				if (field !== undefined) {
					return getProxyForField(field);
				}

				// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
				return Reflect.get(target, key, proxy);
			},
			set(target, key, value) {
				const editNode = getEditNode(proxy);
				const fieldSchema = editNode.schema.objectNodeFields.get(key as FieldKey);

				if (fieldSchema === undefined) {
					return false;
				}

				// TODO: Is it safe to assume 'content' is a LazyObjectNode?
				assert(editNode instanceof LazyObjectNode, 0x7e0 /* invalid content */);
				assert(typeof key === "string", 0x7e1 /* invalid key */);
				const field = getBoxedField(editNode, brand(key), fieldSchema);

				switch (field.schema.kind) {
					case FieldKinds.required:
					case FieldKinds.optional: {
						const typedField = field as
							| FlexTreeRequiredField<AllowedTypes>
							| FlexTreeOptionalField<AllowedTypes>;

						const { content, hydrateProxies } = extractFactoryContent(value);
						modifyChildren(
							editNode,
							() => {
								typedField.content = content;
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
				return schema.objectNodeFields.has(key as FieldKey);
			},
			ownKeys: (target) => {
				return [...schema.objectNodeFields.keys()];
			},
			getOwnPropertyDescriptor: (target, key) => {
				const field = getEditNode(proxy).tryGetField(key as FieldKey);

				if (field === undefined) {
					return undefined;
				}

				const p: PropertyDescriptor = {
					value: getProxyForField(field),
					writable: true,
					enumerable: true,
					configurable: true, // Must be 'configurable' if property is absent from proxy target.
				};

				return p;
			},
		},
	) as TreeObjectNode<TSchema>;
	return proxy;
}

/**
 * Given a list proxy, returns its underlying LazySequence field.
 */
const getSequenceField = <TTypes extends AllowedTypes>(list: TreeListNode) =>
	getEditNode(list).content as FlexTreeSequenceField<TTypes>;

// Used by 'insert*()' APIs to converts new content (expressed as a proxy union) to contextually
// typed data prior to forwarding to 'LazySequence.insert*()'.
function contextualizeInsertedListContent(
	insertedAtIndex: number,
	content: (
		| TreeNodeUnion<AllowedTypes, "javaScript">
		| IterableTreeListContent<TreeNodeUnion<AllowedTypes, "javaScript">>
	)[],
): ExtractedFactoryContent<ContextuallyTypedNodeData[]> {
	return extractContentArray(
		content.flatMap((c) =>
			c instanceof IterableTreeListContent ? Array.from(c) : c,
		) as ContextuallyTypedNodeData[],
		insertedAtIndex,
	);
}

// #region Create dispatch map for lists

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

/**
 * PropertyDescriptorMap used to build the prototype for our SharedListNode dispatch object.
 */
const listPrototypeProperties: PropertyDescriptorMap = {
	// We manually add [Symbol.iterator] to the dispatch map rather than use '[fn.name] = fn' as
	// below when adding 'Array.prototype.*' properties to this map because 'Array.prototype[Symbol.iterator].name'
	// returns "values" (i.e., Symbol.iterator is an alias for the '.values()' function.)
	[Symbol.iterator]: {
		value: Array.prototype[Symbol.iterator],
	},
	at: {
		value(this: TreeListNode, index: number): FlexTreeUnknownUnboxed | undefined {
			return getSequenceField(this).at(index);
		},
	},
	insertAt: {
		value(
			this: TreeListNode,
			index: number,
			...value: (
				| TreeNodeUnion<AllowedTypes, "javaScript">
				| IterableTreeListContent<TreeNodeUnion<AllowedTypes, "javaScript">>
			)[]
		): void {
			const { content, hydrateProxies } = contextualizeInsertedListContent(index, value);
			modifyChildren(
				getEditNode(this),
				() => getSequenceField(this).insertAt(index, content),
				(listEditNode) => hydrateProxies(listEditNode),
			);
		},
	},
	insertAtStart: {
		value(
			this: TreeListNode,
			...value: (
				| TreeNodeUnion<AllowedTypes, "javaScript">
				| IterableTreeListContent<TreeNodeUnion<AllowedTypes, "javaScript">>
			)[]
		): void {
			const { content, hydrateProxies } = contextualizeInsertedListContent(0, value);
			modifyChildren(
				getEditNode(this),
				() => getSequenceField(this).insertAtStart(content),
				(listEditNode) => hydrateProxies(listEditNode),
			);
		},
	},
	insertAtEnd: {
		value(
			this: TreeListNode,
			...value: (
				| TreeNodeUnion<AllowedTypes, "javaScript">
				| IterableTreeListContent<TreeNodeUnion<AllowedTypes, "javaScript">>
			)[]
		): void {
			const { content, hydrateProxies } = contextualizeInsertedListContent(
				this.length,
				value,
			);
			modifyChildren(
				getEditNode(this),
				() => getSequenceField(this).insertAtEnd(content),
				(listEditNode) => hydrateProxies(listEditNode),
			);
		},
	},
	removeAt: {
		value(this: TreeListNode, index: number): void {
			getSequenceField(this).removeAt(index);
		},
	},
	removeRange: {
		value(this: TreeListNode, start?: number, end?: number): void {
			getSequenceField(this).removeRange(start, end);
		},
	},
	moveToStart: {
		value(this: TreeListNode, sourceIndex: number, source?: TreeListNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToStart(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToStart(sourceIndex);
			}
		},
	},
	moveToEnd: {
		value(this: TreeListNode, sourceIndex: number, source?: TreeListNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToEnd(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToEnd(sourceIndex);
			}
		},
	},
	moveToIndex: {
		value(this: TreeListNode, index: number, sourceIndex: number, source?: TreeListNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToIndex(index, sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToIndex(index, sourceIndex);
			}
		},
	},
	moveRangeToStart: {
		value(
			this: TreeListNode,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeListNode,
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
			this: TreeListNode,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeListNode,
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
			this: TreeListNode,
			index: number,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeListNode,
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

function createListProxy<TTypes extends AllowedTypes>(): TreeListNode<TTypes> {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target, because we need
	// the proxy target to be a plain JS array (see comments below when we instantiate the Proxy).
	// Own properties on the dispatch object are surfaced as own properties of the proxy.
	// (e.g., 'length', which is defined below).
	//
	// Properties normally inherited from 'Array.prototype' are surfaced via the prototype chain.
	const dispatch: object = Object.create(listPrototype, {
		length: {
			get(this: TreeListNode) {
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
	const proxy: TreeListNode<TTypes> = new Proxy<TreeListNode<TTypes>>([] as any, {
		get: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return maybeIndex !== undefined
				? getOrCreateNodeProxy(field.boxedAt(maybeIndex))
				: // Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
				  (Reflect.get(dispatch, key, proxy) as unknown);
		},
		set: (target, key, newValue, receiver) => {
			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue, proxy);
			}

			// For MVP, we otherwise disallow setting properties (mutation is only available via the list mutation APIs).
			return false;
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
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for indexed properties must
				// be a simple value property (as opposed to using getter) and declared writable/enumerable/configurable.
				return {
					// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
					//       as simple as calling '.at' since this skips the node and returns the FieldNode's
					//       inner field.
					value: getOrCreateNodeProxy(field.boxedAt(maybeIndex)),
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

const mapStaticDispatchMap: PropertyDescriptorMap = {
	[Symbol.iterator]: {
		value(this: TreeMapNode<MapNodeSchema>) {
			return this.entries();
		},
	},
	delete: {
		value(this: TreeMapNode<MapNodeSchema>, key: string): void {
			const node = getEditNode(this);
			node.delete(key);
		},
	},
	entries: {
		*value(this: TreeMapNode<MapNodeSchema>): IterableIterator<[string, unknown]> {
			const node = getEditNode(this);
			for (const key of node.keys()) {
				yield [key, getProxyForField(node.getBoxed(key))];
			}
		},
	},
	get: {
		value(this: TreeMapNode<MapNodeSchema>, key: string): unknown {
			const node = getEditNode(this);
			const field = node.getBoxed(key);
			return getProxyForField(field);
		},
	},
	has: {
		value(this: TreeMapNode<MapNodeSchema>, key: string): boolean {
			const node = getEditNode(this);
			return node.has(key);
		},
	},
	keys: {
		value(this: TreeMapNode<MapNodeSchema>): IterableIterator<string> {
			const node = getEditNode(this);
			return node.keys();
		},
	},
	set: {
		value(
			this: TreeMapNode<MapNodeSchema>,
			key: string,
			value: TreeNodeUnion<AllowedTypes, "javaScript">,
		): TreeMapNode<MapNodeSchema> {
			const { content, hydrateProxies } = extractFactoryContent(
				value as FlexibleFieldContent<MapFieldSchema>,
			);
			modifyChildren(
				getEditNode(this),
				(mapNode) => mapNode.set(key, content),
				(mapNode) => hydrateProxies(getMapChildNode(mapNode, key)),
			);
			return this;
		},
	},
	size: {
		get(this: TreeMapNode<MapNodeSchema>) {
			return getEditNode(this).size;
		},
	},
	values: {
		*value(this: TreeMapNode<MapNodeSchema>): IterableIterator<unknown> {
			for (const [, value] of this.entries()) {
				yield value;
			}
		},
	},
	// TODO: add `clear` once we have established merge semantics for it.
};

const mapPrototype = Object.create(Object.prototype, mapStaticDispatchMap);

// #endregion

function createMapProxy<TSchema extends MapNodeSchema>(): TreeMapNode<TSchema> {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	const dispatch: object = Object.create(mapPrototype, {
		// Empty - JavaScript Maps do not expose any "own" properties.
	});

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy<TreeMapNode<TSchema>>(
		new Map<string, TreeField<TSchema["info"], "sharedTree", "notEmpty">>(),
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
				// There aren't any `set` operations appropriate for maps.
				return false;
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
 * Create a proxy to a {@link TreeObjectNode} that is backed by a raw object node (see {@link createRawObjectNode}).
 * @param schema - the schema of the object node
 * @param content - the content to be stored in the raw node.
 * A copy of content is stored, the input `content` is not modified and can be safely reused in another call to {@link createRawObjectProxy}.
 * @remarks
 * Because this proxy is backed by a raw node, it has the same limitations as the node created by {@link createRawObjectNode}.
 * Most if its properties and methods will error if read/called.
 */
export function createRawObjectProxy<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
	content: TypedNode<TSchema, "javaScript">,
): TreeObjectNode<TSchema> {
	// Shallow copy the content and then add the type name symbol to it.
	const contentCopy = { ...content };
	Object.defineProperty(contentCopy, typeNameSymbol, { value: schema.name });
	const proxy = createObjectProxy(schema);
	const editNode = createRawObjectNode(schema, contentCopy);
	return setEditNode(proxy, editNode);
}

type ProxyHydrator = (editNode: FlexTreeNode | undefined) => void;
const noopHydrator: ProxyHydrator = () => {};

/** The result returned by {@link extractFactoryContent} and its related helpers. */
interface ExtractedFactoryContent<T extends TypedNode<TreeNodeSchema, "javaScript">> {
	/** The content with the factory subtrees replaced. */
	content: T;
	/**
	 * A function which walks all factory-created object that underwent replacement/extraction.
	 * Before hydration, those objects are unusable (see {@link createRawObjectProxy}).
	 * However, after the content is fully inserted into the tree the `hydrateProxies` function may be invoked in order to update the contents of these objects such that they become a mirror of the content in the tree.
	 * This must be done before any calls to {@link getOrCreateNodeProxy} so that the "edit node to proxy" mapping is correctly updated (see {@link setEditNode}).
	 */
	hydrateProxies: ProxyHydrator;
}

/**
 * Given a content tree that is to be inserted into the shared tree, replace all subtrees that were created by factories
 * (via {@link SharedTreeObjectFactory.create}) with the content that was passed to those factories.
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
 * const y = extractFactoryContent(y);
 * y === {
 *   [typeNameSymbol]: "foo", a: 3, b: {
 *     [typeNameSymbol]: "bar", c: [{ [typeNameSymbol]: "baz", d: 5 }]
 *  }
 * }
 * ```
 */
export function extractFactoryContent<T extends TypedNode<TreeNodeSchema, "javaScript">>(
	content: T,
): ExtractedFactoryContent<T> {
	if (isFluidHandle(content)) {
		return { content, hydrateProxies: noopHydrator };
	} else if (Array.isArray(content)) {
		return extractContentArray(content);
	} else if (content instanceof Map) {
		return extractContentMap(content);
	} else if (content !== null && typeof content === "object") {
		return extractContentObject(content);
	} else {
		return {
			content, // `content` is a primitive or `undefined`
			hydrateProxies: noopHydrator,
		};
	}
}

/**
 * @param insertedAtIndex - Supply this if the extracted array content will be inserted into an existing list in the tree.
 */
function extractContentArray<T extends TypedNode<TreeNodeSchema, "javaScript">[]>(
	input: T,
	insertedAtIndex = 0,
): ExtractedFactoryContent<T> {
	const output = [] as unknown as T;
	const hydrators: [index: number, hydrate: ProxyHydrator][] = [];
	for (let i = 0; i < input.length; i++) {
		const { content, hydrateProxies } = extractFactoryContent(input[i]);
		output.push(content);
		// The conditional here is an optimization so that primitive items don't incur boxed reads for hydration
		if (hydrateProxies !== noopHydrator) {
			hydrators.push([i, hydrateProxies]);
		}
	}
	return {
		content: output,
		hydrateProxies: (editNode: FlexTreeNode | undefined) => {
			assert(
				editNode !== undefined,
				0x7f6 /* Expected edit node to be defined when hydrating list */,
			);
			assert(
				schemaIsFieldNode(editNode.schema),
				0x7f7 /* Expected field node when hydrating list */,
			);
			hydrators.forEach(([i, hydrate]) =>
				hydrate(
					getListChildNode(
						editNode as FlexTreeFieldNode<FieldNodeSchema>,
						insertedAtIndex + i,
					),
				),
			);
		},
	};
}

function extractContentMap<T extends Map<string, TypedNode<TreeNodeSchema, "javaScript">>>(
	input: T,
): ExtractedFactoryContent<T> {
	const output = new Map() as T;
	const hydrators: [key: string, hydrate: ProxyHydrator][] = [];
	for (const [key, value] of input) {
		const { content, hydrateProxies } = extractFactoryContent(value);
		output.set(key, content);
		// The conditional here is an optimization so that primitive values don't incur boxed reads for hydration
		if (hydrateProxies !== noopHydrator) {
			hydrators.push([key, hydrateProxies]);
		}
	}
	return {
		content: output,
		hydrateProxies: (editNode: FlexTreeNode | undefined) => {
			assert(
				editNode !== undefined,
				0x7f8 /* Expected edit node to be defined when hydrating map */,
			);
			assert(schemaIsMap(editNode.schema), 0x7f9 /* Expected map node when hydrating map */);
			hydrators.forEach(([key, hydrate]) =>
				hydrate(getMapChildNode(editNode as FlexTreeMapNode<MapNodeSchema>, key)),
			);
		},
	};
}

function extractContentObject<T extends object>(input: T): ExtractedFactoryContent<T> {
	const output: Record<string, unknown> = {};
	const hydrators: [key: string, hydrate: ProxyHydrator][] = [];
	let unproxiedInput = input;
	const rawEditNode = tryGetEditNode(input);
	if (rawEditNode !== undefined) {
		const factoryContent = extractRawNodeContent(rawEditNode);
		if (factoryContent === undefined) {
			// We were passed a proxy, but that proxy doesn't have any raw content.
			throw new Error("Cannot insert a node that is already in the tree");
		}
		// `content` is a factory-created object
		const typeName =
			(factoryContent as { [typeNameSymbol]?: string })[typeNameSymbol] ??
			fail("Expected schema type name to be set on factory object content");

		// Copy the type name from the factory content to the output object.
		// This ensures that all objects from factories can be checked for their nominal type if necessary.
		Object.defineProperty(output, typeNameSymbol, { value: typeName });
		unproxiedInput = factoryContent as T;
	}

	for (const [key, value] of Object.entries(unproxiedInput)) {
		const { content, hydrateProxies } = extractFactoryContent(value);
		output[key] = content;
		hydrators.push([key, hydrateProxies]);
	}

	return {
		content: output as T,
		hydrateProxies: (editNode: FlexTreeNode | undefined) => {
			assert(
				editNode !== undefined,
				0x7fa /* Expected edit node to be defined when hydrating object */,
			);
			setEditNode(input as TreeObjectNode<ObjectNodeSchema>, editNode as FlexTreeObjectNode); // This makes the input proxy usable and updates the proxy cache
			assert(
				schemaIsObjectNode(editNode.schema),
				0x7fb /* Expected object node when hydrating object content */,
			);
			hydrators.forEach(([key, hydrate]) =>
				hydrate(getObjectChildNode(editNode as FlexTreeObjectNode, key)),
			);
		},
	};
}

function getListChildNode(
	listNode: FlexTreeFieldNode<FieldNodeSchema>,
	index: number,
): FlexTreeNode {
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
