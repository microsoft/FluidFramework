/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	type AnchorNode,
	EmptyKey,
	type FieldKey,
	type FieldUpPath,
	type MapTree,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	type Value,
} from "../../core/index.js";
import { brand, fail, getOrCreate, mapIterable } from "../../util/index.js";
import {
	type FlexTreeContext,
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeFieldNode,
	type FlexTreeLeafNode,
	type FlexTreeMapNode,
	type FlexTreeNode,
	type FlexTreeNodeEvents,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeTypedField,
	type FlexTreeTypedNode,
	type FlexTreeTypedNodeUnion,
	type FlexTreeUnboxField,
	type FlexTreeUnboxNodeUnion,
	type FlexibleFieldContent,
	type FlexibleNodeSubSequence,
	TreeStatus,
	flexTreeMarker,
	indexForAt,
} from "../flex-tree/index.js";
import {
	type FlexAllowedTypes,
	type FlexFieldNodeSchema,
	FlexFieldSchema,
	type FlexMapNodeSchema,
	type FlexTreeNodeSchema,
	type LeafNodeSchema,
	isLazy,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
} from "../typed-schema/index.js";
import { type FlexImplicitAllowedTypes, normalizeAllowedTypes } from "../schemaBuilderBase.js";
import type { FlexFieldKind } from "../modular-schema/index.js";
import { FieldKinds, type SequenceFieldEditBuilder } from "../default-schema/index.js";
import { ComposableEventEmitter, type Listenable, type Off } from "../../events/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

// #region Nodes

/**
 * A readonly {@link FlexTreeNode} which wraps a {@link MapTree}.
 * @remarks Reading data from the MapTreeNode will read the corresponding data from the {@link MapTree}.
 * Create a `MapTreeNode` by calling {@link getOrCreateMapTreeNode}.
 */
export interface MapTreeNode extends FlexTreeNode {
	readonly mapTree: MapTree;
	forwardEvents(to: Listenable<FlexTreeNodeEvents>): void;
}

/**
 * Checks if the given {@link FlexTreeNode} is a {@link MapTreeNode}.
 */
export function isMapTreeNode(flexNode: FlexTreeNode): flexNode is MapTreeNode {
	return flexNode instanceof EagerMapTreeNode;
}

/** A node's parent field and its index in that field */
interface LocationInField {
	readonly parent: MapTreeField<FlexAllowedTypes>;
	readonly index: number;
}

/**
 * Allows events to be forwarded to another event emitter.
 * @remarks TODO: After the eventing library is simplified, find a way to support this pattern elegantly in the library.
 */
class ForwardingEventEmitter extends ComposableEventEmitter<FlexTreeNodeEvents> {
	// A map from deregistration functions produced by this class to deregistration functions of Listenables that have been forwarded to
	private readonly forwardedOffs = new Map<Off, Off[]>();

	public override on<K extends keyof FlexTreeNodeEvents>(
		eventName: K,
		listener: FlexTreeNodeEvents[K],
	): Off {
		const off = super.on(eventName, listener);
		// Return a deregister function which...
		return (): void => {
			off(); // ...deregisters the event in this emitter,
			// and also deregisters the event in any Listenable that it gets forwarded to
			(this.forwardedOffs.get(off) ?? []).forEach((f) => f());
		};
	}

	public forwardEvents(to: Listenable<FlexTreeNodeEvents>): void {
		for (const [eventName, listeners] of this.listeners) {
			for (const [off, listener] of listeners) {
				// For every one of our listeners, make the same subscription in the Listenable that we're forwarding to,
				// and then create a mapping from our deregistration function to theirs, so we can call it later if need be.
				getOrCreate(this.forwardedOffs, off, () => []).push(to.on(eventName, listener));
			}
		}
	}
}

/**
 * A readonly implementation of {@link FlexTreeNode} which wraps a {@link MapTree}.
 * @remarks Any methods that would mutate the node will fail,
 * as will the querying of data specific to the {@link LazyTreeNode} implementation (e.g. {@link FlexTreeNode.context}).
 * MapTreeNodes are unconditionally cached -
 * when retrieved via {@link getOrCreateNode}, the same {@link MapTree} object will always produce the same `MapTreeNode` object.
 */
export class EagerMapTreeNode<TSchema extends FlexTreeNodeSchema> implements MapTreeNode {
	public readonly [flexTreeMarker] = FlexTreeEntityKind.Node as const;
	private readonly events = new ForwardingEventEmitter();
	public forwardEvents(to: Listenable<FlexTreeNodeEvents>): void {
		this.events.forwardEvents(to);
	}

	/**
	 * Create a new MapTreeNode.
	 * @param location - the parentage of this node, if it is being created underneath an existing node and field, or undefined if not
	 * @remarks This class (and its subclasses) should not be directly constructed outside of this module.
	 * Instead, use {@link getOrCreateNode} to create a MapTreeNode from a {@link MapTree}.
	 * A `MapTreeNode` may never be constructed more than once for the same {@link MapTree} object.
	 * Instead, it should always be acquired via {@link getOrCreateNode}.
	 */
	public constructor(
		public readonly schema: TSchema,
		/** The underlying {@link MapTree} that this `MapTreeNode` reads its data from */
		public readonly mapTree: MapTree,
		private location: LocationInField | undefined,
	) {
		assert(!nodeCache.has(mapTree), 0x98b /* A node already exists for the given MapTree */);
		nodeCache.set(mapTree, this);

		// Fully demand the tree to ensure that parent pointers are present and accurate on all nodes.
		// When a MapTreeNode is constructed, its MapTree may contain nodes (anywhere below) that map (via the `nodeCache`) to pre-existing MapTreeNodes.
		// Put another way, for a given MapTree, some ancestor MapTreeNode can be created after any number of its descendant MapTreeNodes already exist.
		// In such a case, the spine of nodes between the descendant and ancestor need to exist in order for the ancestor to be able to walk upwards via the `parentField` property.
		// This needs to happen for all MapTreeNodes that are descendants of the ancestor MapTreeNode.
		// Demanding the entire tree is overkill to solve this problem since not all descendant MapTree nodes will have corresponding MapTreeNodes.
		// However, demanding the full tree also lets us eagerly validate that there are no duplicate MapTrees (i.e. same MapTree object) anywhere in the tree.
		this.walkTree();
	}

	public get type(): TreeNodeSchemaIdentifier {
		return this.schema.name;
	}

	/**
	 * Set this node's parentage (see {@link FlexTreeNode.parentField}).
	 * @remarks A node may only be adopted to a new parent one time, and only if it was not constructed with a parent.
	 */
	public adopt(parent: MapTreeField<FlexAllowedTypes>, index: number): void {
		assert(
			this.location === undefined,
			0x98c /* Node may not be adopted if it already has a parent */,
		);
		this.location = { parent, index };
	}

	/**
	 * The field this tree is in, and the index within that field.
	 * @remarks If this node is unparented, this method will return the special {@link rootMapTreeField} as the parent.
	 */
	public get parentField(): LocationInField {
		if (this.location === undefined) {
			return {
				parent: rootMapTreeField,
				index: -1,
			};
		}

		return this.location;
	}

	public is<TSchemaInner extends FlexTreeNodeSchema>(
		schema: TSchemaInner,
	): this is FlexTreeTypedNode<TSchemaInner> {
		return (schema as unknown) === this.schema;
	}

	public tryGetField(key: FieldKey): MapTreeField<FlexAllowedTypes> | undefined {
		const field = this.mapTree.fields.get(key);
		// Only return the field if it is not empty, in order to fulfill the contract of `tryGetField`.
		if (field !== undefined && field.length > 0) {
			return getOrCreateField(this, key, field, this.schema.getFieldSchema(key));
		}
	}

	public getBoxed(key: string): FlexTreeField {
		const fieldKey: FieldKey = brand(key);
		const field = this.mapTree.fields.get(fieldKey) ?? [];
		return getOrCreateField(this, fieldKey, field, this.schema.getFieldSchema(fieldKey));
	}

	public boxedIterator(): IterableIterator<FlexTreeField> {
		return mapIterable(this.mapTree.fields.entries(), ([key, field]) =>
			getOrCreateField(this, key, field, this.schema.getFieldSchema(key)),
		);
	}

	public treeStatus(): TreeStatus {
		return TreeStatus.New;
	}

	public get value(): Value {
		return this.mapTree.value;
	}

	public on<K extends keyof FlexTreeNodeEvents>(
		eventName: K,
		listener: FlexTreeNodeEvents[K],
	): () => void {
		switch (eventName) {
			case "nodeChanged":
			case "treeChanged":
				return this.events.on(eventName, listener);
			default:
				throw unsupportedUsageError(`Subscribing to ${eventName}`);
		}
	}

	public get context(): FlexTreeContext {
		// This API is relevant to `LazyTreeNode`s, but not `MapTreeNode`s.
		// TODO: Refactor the FlexTreeNode interface so that stubbing this out isn't necessary.
		return fail("MapTreeNode does not implement context");
	}

	public get anchorNode(): AnchorNode {
		// This API is relevant to `LazyTreeNode`s, but not `MapTreeNode`s.
		// TODO: Refactor the FlexTreeNode interface so that stubbing this out isn't necessary.
		return fail("MapTreeNode does not implement anchorNode");
	}

	private walkTree(): void {
		for (const [key, mapTrees] of this.mapTree.fields) {
			const field = getOrCreateField(this, key, mapTrees, this.schema.getFieldSchema(key));
			for (let index = 0; index < field.length; index++) {
				const child = getOrCreateChild(
					mapTrees[index],
					this.schema.getFieldSchema(key).allowedTypes,
					{ parent: field, index },
				);
				// These next asserts detect the case where `getOrCreateChild` gets a cache hit of a different node than the one we're trying to create
				assert(child.location !== undefined, 0x98d /* Expected node to have parent */);
				assert(
					child.location.parent.parent === this,
					0x98e /* Node may not be multi-parented */,
				);
				assert(child.location.index === index, 0x98f /* Node may not be multi-parented */);
				child.walkTree();
			}
		}
	}
}

/**
 * The implementation of a field node created by {@link getOrCreateNode}.
 */
export class EagerMapTreeFieldNode<TSchema extends FlexFieldNodeSchema>
	extends EagerMapTreeNode<TSchema>
	implements FlexTreeFieldNode<TSchema>
{
	public get content(): FlexTreeUnboxField<TSchema["info"]> {
		const field = this.tryGetField(EmptyKey);
		if (field === undefined) {
			return undefined as FlexTreeUnboxField<TSchema["info"]>;
		}
		return unboxedField(field, EmptyKey, this.mapTree, this);
	}

	public get boxedContent(): FlexTreeTypedField<TSchema["info"]> {
		const field = this.mapTree.fields.get(EmptyKey) ?? [];
		return getOrCreateField(
			this,
			EmptyKey,
			field,
			this.schema.info,
		) as unknown as FlexTreeTypedField<TSchema["info"]>;
	}

	public override getBoxed(key: string): FlexTreeTypedField<TSchema["info"]> {
		return super.getBoxed(key) as FlexTreeTypedField<TSchema["info"]>;
	}
}

/**
 * The implementation of a map node created by {@link getOrCreateNode}.
 */
export class EagerMapTreeMapNode<TSchema extends FlexMapNodeSchema>
	extends EagerMapTreeNode<TSchema>
	implements FlexTreeMapNode<TSchema>
{
	public get size(): number {
		return this.mapTree.fields.size;
	}

	public has(key: string): boolean {
		return this.tryGetField(brand(key)) !== undefined;
	}

	public get(key: string): FlexTreeUnboxField<TSchema["info"]> {
		const field = this.tryGetField(brand(key));
		if (field === undefined) {
			return undefined as FlexTreeUnboxField<TSchema["info"]>;
		}
		return unboxedField(field, brand(key), this.mapTree, this);
	}

	public keys(): IterableIterator<FieldKey> {
		return this.mapTree.fields.keys();
	}

	public values(): IterableIterator<FlexTreeUnboxField<TSchema["info"], "notEmpty">> {
		return mapIterable(
			this.mapTree.fields.keys(),
			(key) =>
				unboxedField(
					this.tryGetField(key) ?? fail("Unexpected empty map field"),
					key,
					this.mapTree,
					this,
				) as FlexTreeUnboxField<TSchema["info"], "notEmpty">,
		);
	}

	public entries(): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		return mapIterable(this.mapTree.fields.keys(), (key) => [
			key,
			unboxedField(
				this.tryGetField(key) ?? fail("Unexpected empty map field"),
				key,
				this.mapTree,
				this,
			) as FlexTreeUnboxField<TSchema["info"], "notEmpty">,
		]);
	}

	public forEach(
		callbackFn: (
			value: FlexTreeUnboxField<TSchema["info"], "notEmpty">,
			key: FieldKey,
			map: FlexTreeMapNode<TSchema>,
		) => void,
		thisArg?: unknown,
	): void {
		const fn = thisArg !== undefined ? callbackFn.bind(thisArg) : callbackFn;
		for (const [key, value] of this.entries()) {
			fn(value, key, this);
		}
	}

	public override getBoxed(key: string): FlexTreeTypedField<TSchema["info"]> {
		return super.getBoxed(key) as FlexTreeTypedField<TSchema["info"]>;
	}

	public set(key: string, value: FlexibleFieldContent<TSchema["info"]> | undefined): void {
		// `MapTreeNode`s cannot be mutated
		throw unsupportedUsageError("Setting a map entry");
	}

	public delete(key: string): void {
		// `MapTreeNode`s cannot be mutated
		throw unsupportedUsageError("Deleting a map entry");
	}

	public [Symbol.iterator](): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		return this.entries();
	}

	public override boxedIterator(): IterableIterator<FlexTreeTypedField<TSchema["info"]>> {
		return super.boxedIterator() as IterableIterator<FlexTreeTypedField<TSchema["info"]>>;
	}
}

class EagerMapTreeLeafNode<TSchema extends LeafNodeSchema>
	extends EagerMapTreeNode<TSchema>
	implements FlexTreeLeafNode<TSchema>
{
	public override get value(): TreeValue<TSchema["info"]> {
		return super.value as TreeValue<TSchema["info"]>;
	}
}

// #endregion Nodes

// #region Fields

/**
 * A special singleton that is the implicit parent field of all un-parented {@link EagerMapTreeNode}s.
 * @remarks This exists because {@link EagerMapTreeNode.parentField} must return a field.
 * If a {@link EagerMapTreeNode} is created without a parent, its {@link EagerMapTreeNode.parentField} property will point to this object.
 * However, this field cannot be used in any practical way because it is empty, i.e. it does not actually contain the children that claim to be parented under it.
 * It has the "empty" schema and it will always contain zero children if queried.
 */
export const rootMapTreeField: MapTreeField<FlexAllowedTypes> = {
	[flexTreeMarker]: FlexTreeEntityKind.Field as const,
	length: 0,
	key: EmptyKey,
	parent: undefined,
	is<TSchema extends FlexFieldSchema>(schema: TSchema) {
		return schema === (FlexFieldSchema.empty as FlexFieldSchema);
	},
	isSameAs(other: FlexTreeField): boolean {
		return other === this;
	},
	boxedIterator(): IterableIterator<FlexTreeNode> {
		return [].values();
	},
	boxedAt(index: number): FlexTreeNode | undefined {
		return undefined;
	},
	schema: FlexFieldSchema.empty,
	get context(): FlexTreeContext {
		return fail("MapTreeField does not implement context");
	},
	treeStatus(): TreeStatus {
		return TreeStatus.New;
	},
	mapTrees: [],
};

class MapTreeField<T extends FlexAllowedTypes> implements FlexTreeField {
	public [flexTreeMarker] = FlexTreeEntityKind.Field as const;

	public constructor(
		public readonly schema: FlexFieldSchema<FlexFieldKind, T>,
		public readonly key: FieldKey,
		public readonly parent: FlexTreeNode | undefined,
		public readonly mapTrees: readonly MapTree[],
	) {
		assert(
			!fieldCache.has(mapTrees),
			0x990 /* A field already exists for the given MapTrees */,
		);
		fieldCache.set(mapTrees, this);

		// When this field is created (which only happens one time, because it is cached), all the children become parented for the first time.
		// "Adopt" each child by updating its parent information to point to this field.
		for (let i = 0; i < mapTrees.length; i++) {
			const mapTreeNodeChild = nodeCache.get(mapTrees[i]);
			if (mapTreeNodeChild !== undefined) {
				assert(
					mapTreeNodeChild.parentField.parent === rootMapTreeField,
					0x991 /* Node is already parented under a different field */,
				);
				mapTreeNodeChild.adopt(this, i);
			}
		}
	}

	public get length(): number {
		return this.mapTrees.length;
	}

	public is<TSchemaInner extends FlexFieldSchema>(
		schema: TSchemaInner,
	): this is FlexTreeTypedField<TSchemaInner> {
		return this.schema.equals(schema);
	}

	public isSameAs(other: FlexTreeField): boolean {
		if (other.parent === this.parent && other.key === this.key) {
			assert(other === this, 0x992 /* Expected field to be cached */);
			return true;
		}

		return false;
	}

	public boxedIterator(): IterableIterator<FlexTreeTypedNodeUnion<T>> {
		return this.mapTrees
			.map(
				(m, index) =>
					getOrCreateChild(m, this.schema.allowedTypes, {
						parent: this,
						index,
					}) as FlexTreeNode as FlexTreeTypedNodeUnion<T>,
			)
			.values();
	}

	public boxedAt(index: number): FlexTreeTypedNodeUnion<T> | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		const m = this.mapTrees[i];
		if (m !== undefined) {
			return getOrCreateChild(m, this.schema.allowedTypes, {
				parent: this,
				index: i,
			}) as FlexTreeNode as FlexTreeTypedNodeUnion<T>;
		}
	}

	public get context(): FlexTreeContext {
		return fail("MapTreeField does not implement context");
	}

	public treeStatus(): TreeStatus {
		return TreeStatus.New;
	}
}

class MapTreeRequiredField<T extends FlexAllowedTypes>
	extends MapTreeField<T>
	implements FlexTreeRequiredField<T>
{
	public get content(): FlexTreeUnboxNodeUnion<T> {
		return unboxedUnion(this.schema, this.mapTrees[0], { parent: this, index: 0 });
	}
	public set content(_: FlexTreeUnboxNodeUnion<T>) {
		throw unsupportedUsageError("Setting an optional field");
	}

	public get boxedContent(): FlexTreeTypedNodeUnion<T> {
		return this.boxedAt(0) ?? fail("Required field must have exactly one node");
	}
}

class MapTreeOptionalField<T extends FlexAllowedTypes>
	extends MapTreeField<T>
	implements FlexTreeOptionalField<T>
{
	public get content(): FlexTreeUnboxNodeUnion<T> | undefined {
		return this.mapTrees.length > 0
			? unboxedUnion(this.schema, this.mapTrees[0], { parent: this, index: 0 })
			: undefined;
	}
	public set content(_: FlexTreeUnboxNodeUnion<T> | undefined) {
		throw unsupportedUsageError("Setting an optional field");
	}

	public get boxedContent(): FlexTreeTypedNodeUnion<T> | undefined {
		return this.boxedAt(0);
	}
}

class MapTreeSequenceField<T extends FlexAllowedTypes>
	extends MapTreeField<T>
	implements FlexTreeSequenceField<T>
{
	public at(index: number): FlexTreeUnboxNodeUnion<T> | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		return unboxedUnion(this.schema, this.mapTrees[i], { parent: this, index: i });
	}
	public map<U>(callbackfn: (value: FlexTreeUnboxNodeUnion<T>, index: number) => U): U[] {
		return Array.from(this, callbackfn);
	}
	public mapBoxed<U>(callbackfn: (value: FlexTreeTypedNodeUnion<T>, index: number) => U): U[] {
		return Array.from(this.boxedIterator(), callbackfn);
	}

	public *[Symbol.iterator](): IterableIterator<FlexTreeUnboxNodeUnion<T>> {
		for (let i = 0; i < this.mapTrees.length; i++) {
			yield unboxedUnion(this.schema, this.mapTrees[i], { parent: this, index: i });
		}
	}

	public sequenceEditor(): SequenceFieldEditBuilder {
		throw unsupportedUsageError("Editing a sequence");
	}
	public insertAt(index: number, value: FlexibleNodeSubSequence<T>): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public insertAtStart(value: FlexibleNodeSubSequence<T>): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public insertAtEnd(value: FlexibleNodeSubSequence<T>): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public removeAt(index: number): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public moveToStart(sourceIndex: unknown, source?: unknown): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public moveToEnd(sourceIndex: unknown, source?: unknown): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public moveToIndex(index: unknown, sourceIndex: unknown, source?: unknown): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public moveRangeToStart(sourceStart: unknown, sourceEnd: unknown, source?: unknown): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public moveRangeToEnd(sourceStart: unknown, sourceEnd: unknown, source?: unknown): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public moveRangeToIndex(
		index: unknown,
		sourceStart: unknown,
		sourceEnd: unknown,
		source?: unknown,
	): void {
		throw unsupportedUsageError("Editing a sequence");
	}
	public getFieldPath(): FieldUpPath {
		throw unsupportedUsageError("Editing a sequence");
	}
}

// #endregion Fields

// #region Caching and unboxing utilities

const nodeCache = new WeakMap<MapTree, EagerMapTreeNode<FlexTreeNodeSchema>>();
const fieldCache = new WeakMap<readonly MapTree[], MapTreeField<FlexAllowedTypes>>();

/**
 * If there exists a {@link EagerMapTreeNode} for the given {@link MapTree}, returns it, otherwise returns `undefined`.
 * @remarks {@link EagerMapTreeNode | MapTreeNodes} are created via {@link getOrCreateNode}.
 */
export function tryGetMapTreeNode(mapTree: MapTree): MapTreeNode | undefined {
	return nodeCache.get(mapTree);
}

/**
 * Create a {@link MapTreeNode} that wraps the given {@link MapTree}, or get the node that already exists for that {@link MapTree} if there is one.
 * @param nodeSchema - the {@link FlexTreeNodeSchema | schema} that the node conforms to
 * @param mapTree - the {@link MapTree} containing the data for this node.
 * @remarks It must conform to the `nodeSchema`.
 */
export function getOrCreateMapTreeNode(
	nodeSchema: FlexTreeNodeSchema,
	mapTree: MapTree,
): MapTreeNode {
	return getOrCreateNode(nodeSchema, mapTree);
}

/**
 * Create a {@link EagerMapTreeNode} that wraps the given {@link MapTree}, or get the node that already exists for that {@link MapTree} if there is one.
 * @param nodeSchema - the {@link FlexTreeNodeSchema | schema} that the node conforms to
 * @param mapTree - the {@link MapTree} containing the data for this node.
 * @remarks It must conform to the `nodeSchema`.
 * This function is exported for the purposes of unit testing.
 */
export function getOrCreateNode<TSchema extends LeafNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
): EagerMapTreeLeafNode<TSchema>;
export function getOrCreateNode<TSchema extends FlexMapNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
): EagerMapTreeMapNode<TSchema>;
export function getOrCreateNode<TSchema extends FlexFieldNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
): EagerMapTreeFieldNode<TSchema>;
export function getOrCreateNode<TSchema extends FlexTreeNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
): EagerMapTreeNode<TSchema>;
export function getOrCreateNode<TSchema extends FlexTreeNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
): EagerMapTreeNode<TSchema> {
	const cached = tryGetMapTreeNode(mapTree);
	if (cached !== undefined) {
		return cached as EagerMapTreeNode<TSchema>;
	}
	return createNode(nodeSchema, mapTree, undefined);
}

/** Helper for creating a `MapTreeNode` given the parent field (e.g. when "walking down") */
function getOrCreateChild(
	mapTree: MapTree,
	implicitAllowedTypes: FlexImplicitAllowedTypes,
	parent: LocationInField | undefined,
): EagerMapTreeNode<FlexTreeNodeSchema> {
	const cached = nodeCache.get(mapTree);
	if (cached !== undefined) {
		return cached;
	}

	const allowedTypes = normalizeAllowedTypes(implicitAllowedTypes);
	const nodeSchema =
		allowedTypes
			.map((t) => (isLazy(t) ? t() : t))
			.find((t): t is FlexTreeNodeSchema => {
				assert(t !== "Any", 0x993 /* 'Any' type is not supported */);
				return t.name === mapTree.type;
			}) ?? fail("Unsupported node schema");

	return createNode(nodeSchema, mapTree, parent);
}

/** Always constructs a new node, therefore may not be called twice for the same `MapTree`. */
function createNode<TSchema extends LeafNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
	parentField: LocationInField | undefined,
): EagerMapTreeLeafNode<TSchema>;
function createNode<TSchema extends FlexMapNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
	parentField: LocationInField | undefined,
): EagerMapTreeMapNode<TSchema>;
function createNode<TSchema extends FlexFieldNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
	parentField: LocationInField | undefined,
): EagerMapTreeFieldNode<TSchema>;
function createNode<TSchema extends FlexTreeNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
	parentField: LocationInField | undefined,
): EagerMapTreeNode<TSchema>;
function createNode<TSchema extends FlexTreeNodeSchema>(
	nodeSchema: TSchema,
	mapTree: MapTree,
	parentField: LocationInField | undefined,
): EagerMapTreeNode<TSchema> {
	if (schemaIsLeaf(nodeSchema)) {
		return new EagerMapTreeLeafNode(nodeSchema, mapTree, parentField);
	}
	if (schemaIsMap(nodeSchema)) {
		return new EagerMapTreeMapNode(nodeSchema, mapTree, parentField);
	}
	if (schemaIsFieldNode(nodeSchema)) {
		return new EagerMapTreeFieldNode(nodeSchema, mapTree, parentField);
	}
	if (schemaIsObjectNode(nodeSchema)) {
		return new EagerMapTreeNode(nodeSchema, mapTree, parentField);
	}
	assert(false, 0x994 /* Unrecognized node kind */);
}

/** Creates a field with the given attributes, or returns a cached field if there is one */
function getOrCreateField(
	parent: FlexTreeNode,
	key: FieldKey,
	mapTrees: readonly MapTree[],
	schema: FlexFieldSchema,
): MapTreeField<FlexFieldSchema["allowedTypes"]> {
	const cached = fieldCache.get(mapTrees);
	if (cached !== undefined) {
		return cached;
	}

	if (
		schema.kind.identifier === FieldKinds.required.identifier ||
		schema.kind.identifier === FieldKinds.identifier.identifier
	) {
		return new MapTreeRequiredField(schema, key, parent, mapTrees);
	}

	if (schema.kind.identifier === FieldKinds.optional.identifier) {
		return new MapTreeOptionalField(schema, key, parent, mapTrees);
	}

	if (schema.kind.identifier === FieldKinds.sequence.identifier) {
		return new MapTreeSequenceField(schema, key, parent, mapTrees);
	}

	return new MapTreeField(schema, key, parent, mapTrees);
}

/** Unboxes non-polymorphic leaf nodes to their values, if applicable */
function unboxedUnion<TTypes extends FlexAllowedTypes>(
	schema: FlexFieldSchema<FlexFieldKind, TTypes>,
	mapTree: MapTree,
	parent: LocationInField,
): FlexTreeUnboxNodeUnion<TTypes> {
	const type = schema.monomorphicChildType;
	if (type !== undefined) {
		if (schemaIsLeaf(type)) {
			return mapTree.value as FlexTreeUnboxNodeUnion<TTypes>;
		}
		return getOrCreateChild(mapTree, type, parent) as FlexTreeUnboxNodeUnion<TTypes>;
	}

	return getOrCreateChild(
		mapTree,
		schema.allowedTypes,
		parent,
	) as FlexTreeUnboxNodeUnion<TTypes>;
}

/** Unboxes non-polymorphic required and optional fields holding leaf nodes to their values, if applicable */
function unboxedField<TFieldSchema extends FlexFieldSchema>(
	field: MapTreeField<FlexAllowedTypes>,
	key: FieldKey,
	mapTree: MapTree,
	parentNode: FlexTreeNode,
): FlexTreeUnboxField<TFieldSchema> {
	const fieldSchema = field.schema;
	const mapTrees =
		mapTree.fields.get(key) ?? fail("Key does not exist in unhydrated map tree");

	if (fieldSchema.kind === FieldKinds.required) {
		return unboxedUnion(fieldSchema, mapTrees[0], {
			parent: field,
			index: 0,
		}) as FlexTreeUnboxField<TFieldSchema>;
	}
	if (fieldSchema.kind === FieldKinds.optional) {
		return (
			mapTrees.length > 0
				? unboxedUnion(fieldSchema, mapTrees[0], { parent: field, index: 0 })
				: undefined
		) as FlexTreeUnboxField<TFieldSchema>;
	}

	return getOrCreateField(
		parentNode,
		key,
		mapTrees,
		fieldSchema,
	) as FlexTreeUnboxField<TFieldSchema>;
}

// #endregion Caching and unboxing utilities

export function unsupportedUsageError(message?: string): Error {
	return new UsageError(
		`${
			message ?? "Operation"
		} is not supported for content that has not yet been inserted into the tree`,
	);
}
