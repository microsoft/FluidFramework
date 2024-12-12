/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type AnchorEvents,
	type AnchorNode,
	EmptyKey,
	type ExclusiveMapTree,
	type FieldKey,
	type FieldKindIdentifier,
	type FieldUpPath,
	forbiddenFieldKindIdentifier,
	type ITreeCursorSynchronous,
	type MapTree,
	type SchemaPolicy,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type Value,
} from "../../core/index.js";
import { brand, fail, getOrCreate, mapIterable } from "../../util/index.js";
import {
	type FlexTreeContext,
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeTypedField,
	type FlexTreeUnknownUnboxed,
	flexTreeMarker,
	indexForAt,
	type FlexTreeHydratedContext,
	type FlexFieldKind,
	FieldKinds,
	type SequenceFieldEditBuilder,
	cursorForMapTreeNode,
} from "../../feature-libraries/index.js";
import type { Context } from "./context.js";

interface UnhydratedTreeSequenceFieldEditBuilder
	extends SequenceFieldEditBuilder<ExclusiveMapTree[]> {
	/**
	 * Issues a change which removes `count` elements starting at the given `index`.
	 * @param index - The index of the first removed element.
	 * @param count - The number of elements to remove.
	 * @returns the MapTrees that were removed
	 */
	remove(index: number, count: number): ExclusiveMapTree[];
}

type UnhydratedFlexTreeNodeEvents = Pick<AnchorEvents, "childrenChangedAfterBatch">;

/** A node's parent field and its index in that field */
interface LocationInField {
	readonly parent: FlexTreeField;
	readonly index: number;
}

/**
 * An unhydrated implementation of {@link FlexTreeNode} which wraps a {@link MapTree}.
 * @remarks
 * MapTreeNodes are unconditionally cached -
 * when retrieved via {@link getOrCreateNode}, the same {@link MapTree} object will always produce the same `UnhydratedFlexTreeNode` object.
 *
 * Create a `UnhydratedFlexTreeNode` by calling {@link getOrCreate}.
 */
export class UnhydratedFlexTreeNode implements UnhydratedFlexTreeNode {
	public get schema(): TreeNodeSchemaIdentifier {
		return this.mapTree.type;
	}

	public get storedSchema(): TreeNodeStoredSchema {
		return this.context.schema.nodeSchema.get(this.mapTree.type) ?? fail("missing schema");
	}

	public readonly [flexTreeMarker] = FlexTreeEntityKind.Node as const;

	private readonly _events = createEmitter<UnhydratedFlexTreeNodeEvents>();
	public get events(): Listenable<UnhydratedFlexTreeNodeEvents> {
		return this._events;
	}

	/**
	 * Create a {@link UnhydratedFlexTreeNode} that wraps the given {@link MapTree}, or get the node that already exists for that {@link MapTree} if there is one.
	 * @param nodeSchema - the {@link FlexTreeNodeSchema | schema} that the node conforms to
	 * @param mapTree - the {@link MapTree} containing the data for this node.
	 * @remarks It must conform to the `nodeSchema`.
	 */
	public static getOrCreate(
		context: Context,
		mapTree: ExclusiveMapTree,
	): UnhydratedFlexTreeNode {
		return nodeCache.get(mapTree) ?? new UnhydratedFlexTreeNode(context, mapTree, undefined);
	}

	public get context(): FlexTreeContext {
		return this.simpleContext.flexContext;
	}

	/**
	 * Create a new UnhydratedFlexTreeNode.
	 * @param location - the parentage of this node, if it is being created underneath an existing node and field, or undefined if not
	 * @remarks This class (and its subclasses) should not be directly constructed outside of this module.
	 * Instead, use {@link getOrCreateNode} to create a UnhydratedFlexTreeNode from a {@link MapTree}.
	 * A `UnhydratedFlexTreeNode` may never be constructed more than once for the same {@link MapTree} object.
	 * Instead, it should always be acquired via {@link getOrCreateNode}.
	 */
	public constructor(
		public readonly simpleContext: Context,
		/** The underlying {@link MapTree} that this `UnhydratedFlexTreeNode` reads its data from */
		public readonly mapTree: ExclusiveMapTree,
		private location = unparentedLocation,
	) {
		assert(!nodeCache.has(mapTree), 0x98b /* A node already exists for the given MapTree */);
		nodeCache.set(mapTree, this);

		// Fully demand the tree to ensure that parent pointers are present and accurate on all nodes.
		// When a UnhydratedFlexTreeNode is constructed, its MapTree may contain nodes (anywhere below) that map (via the `nodeCache`) to pre-existing UnhydratedFlexTreeNodes.
		// Put another way, for a given MapTree, some ancestor UnhydratedFlexTreeNode can be created after any number of its descendant UnhydratedFlexTreeNodes already exist.
		// In such a case, the spine of nodes between the descendant and ancestor need to exist in order for the ancestor to be able to walk upwards via the `parentField` property.
		// This needs to happen for all UnhydratedFlexTreeNodes that are descendants of the ancestor UnhydratedFlexTreeNode.
		// Demanding the entire tree is overkill to solve this problem since not all descendant MapTree nodes will have corresponding UnhydratedFlexTreeNodes.
		// However, demanding the full tree also lets us eagerly validate that there are no duplicate MapTrees (i.e. same MapTree object) anywhere in the tree.
		this.walkTree();
	}

	public get type(): TreeNodeSchemaIdentifier {
		return this.mapTree.type;
	}

	/**
	 * Set this node's parentage (see {@link FlexTreeNode.parentField}).
	 * @remarks The node may be given a parent if it has none, or may have its parent removed (by passing `undefined`).
	 * However, a node with a parent may not be directly re-assigned a different parent.
	 * That likely indicates either an attempted multi-parenting or an attempt to "move" the node, neither of which are supported.
	 * Removing a node's parent twice in a row is also not supported, as it likely indicates a bug.
	 */
	public adoptBy(parent: undefined): void;
	public adoptBy(parent: UnhydratedFlexTreeField, index: number): void;
	public adoptBy(parent: UnhydratedFlexTreeField | undefined, index?: number): void {
		if (parent !== undefined) {
			assert(
				this.location === unparentedLocation,
				0x98c /* Node may not be adopted if it already has a parent */,
			);
			assert(index !== undefined, 0xa08 /* Expected index */);
			this.location = { parent, index };
		} else {
			assert(
				this.location !== unparentedLocation,
				0xa09 /* Node may not be un-adopted if it does not have a parent */,
			);
			this.location = unparentedLocation;
		}
	}

	/**
	 * The field this tree is in, and the index within that field.
	 * @remarks If this node is unparented, this method will return the special {@link unparentedLocation} as the parent.
	 */
	public get parentField(): LocationInField {
		return this.location;
	}

	public borrowCursor(): ITreeCursorSynchronous {
		return cursorForMapTreeNode(this.mapTree);
	}

	public tryGetField(key: FieldKey): UnhydratedFlexTreeField | undefined {
		const field = this.mapTree.fields.get(key);
		// Only return the field if it is not empty, in order to fulfill the contract of `tryGetField`.
		if (field !== undefined && field.length > 0) {
			return getOrCreateField(this, key, this.storedSchema.getFieldSchema(key).kind, () =>
				this.emitChangedEvent(key),
			);
		}
	}

	public getBoxed(key: string): FlexTreeField {
		const fieldKey: FieldKey = brand(key);
		return getOrCreateField(
			this,
			fieldKey,
			this.storedSchema.getFieldSchema(fieldKey).kind,
			() => this.emitChangedEvent(fieldKey),
		);
	}

	public boxedIterator(): IterableIterator<FlexTreeField> {
		return mapIterable(this.mapTree.fields.entries(), ([key]) =>
			getOrCreateField(this, key, this.storedSchema.getFieldSchema(key).kind, () =>
				this.emitChangedEvent(key),
			),
		);
	}

	public keys(): IterableIterator<FieldKey> {
		// TODO: how this should handle missing defaults (and empty keys if they end up being allowed) needs to be determined.
		return this.mapTree.fields.keys();
	}

	public get value(): Value {
		return this.mapTree.value;
	}

	public get anchorNode(): AnchorNode {
		// This API is relevant to `LazyTreeNode`s, but not `UnhydratedFlexTreeNode`s.
		// TODO: Refactor the FlexTreeNode interface so that stubbing this out isn't necessary.
		return fail("UnhydratedFlexTreeNode does not implement anchorNode");
	}

	private walkTree(): void {
		for (const [key, mapTrees] of this.mapTree.fields) {
			const field = getOrCreateField(
				this,
				key,
				this.storedSchema.getFieldSchema(key).kind,
				() => this.emitChangedEvent(key),
			);
			for (let index = 0; index < field.length; index++) {
				const child = getOrCreateChild(this.simpleContext, mapTrees[index] ?? oob(), {
					parent: field,
					index,
				});
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

	private emitChangedEvent(key: FieldKey): void {
		this._events.emit("childrenChangedAfterBatch", { changedFields: new Set([key]) });
	}
}

/**
 * Implementation of `FlexTreeContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 */
export class UnhydratedContext implements FlexTreeContext {
	/**
	 * @param flexSchema - Schema to use when working with the tree.
	 */
	public constructor(
		public readonly schemaPolicy: SchemaPolicy,
		public readonly schema: TreeStoredSchema,
	) {}

	public isHydrated(): this is FlexTreeHydratedContext {
		return false;
	}
}

// #region Fields

/**
 * A special singleton that is the implicit {@link LocationInField} of all un-parented {@link UnhydratedFlexTreeNode}s.
 * @remarks This exists because {@link UnhydratedFlexTreeNode.parentField} must return a field.
 * If a {@link UnhydratedFlexTreeNode} is created without a parent, its {@link UnhydratedFlexTreeNode.parentField} property will point to this object.
 * However, this field cannot be used in any practical way because it is empty, i.e. it does not actually contain the children that claim to be parented under it.
 * It has the "empty" schema and it will always contain zero children if queried.
 * Any nodes with this location will have a dummy parent index of `-1`.
 */
const unparentedLocation: LocationInField = {
	parent: {
		[flexTreeMarker]: FlexTreeEntityKind.Field as const,
		length: 0,
		key: EmptyKey,
		parent: undefined,
		is<TKind2 extends FlexFieldKind>(kind: TKind2) {
			return this.schema === kind.identifier;
		},
		boxedIterator(): IterableIterator<FlexTreeNode> {
			return [].values();
		},
		boxedAt(index: number): FlexTreeNode | undefined {
			return undefined;
		},
		schema: brand(forbiddenFieldKindIdentifier),
		get context(): never {
			return fail("unsupported");
		},
		getFieldPath() {
			fail("unsupported");
		},
	},
	index: -1,
};

class UnhydratedFlexTreeField implements FlexTreeField {
	public [flexTreeMarker] = FlexTreeEntityKind.Field as const;

	public get context(): FlexTreeContext {
		return this.simpleContext.flexContext;
	}

	public constructor(
		public readonly simpleContext: Context,
		public readonly schema: FieldKindIdentifier,
		public readonly key: FieldKey,
		public readonly parent: UnhydratedFlexTreeNode,
		public readonly onEdit?: () => void,
	) {
		const fieldKeyCache = getFieldKeyCache(parent);
		assert(!fieldKeyCache.has(key), 0x990 /* A field already exists for the given MapTrees */);
		fieldKeyCache.set(key, this);

		// When this field is created (which only happens one time, because it is cached), all the children become parented for the first time.
		// "Adopt" each child by updating its parent information to point to this field.
		for (const [i, mapTree] of this.mapTrees.entries()) {
			const mapTreeNodeChild = nodeCache.get(mapTree);
			if (mapTreeNodeChild !== undefined) {
				if (mapTreeNodeChild.parentField !== unparentedLocation) {
					throw new UsageError("A node may not be in more than one place in the tree");
				}
				mapTreeNodeChild.adoptBy(this, i);
			}
		}
	}

	public get mapTrees(): readonly ExclusiveMapTree[] {
		return this.parent.mapTree.fields.get(this.key) ?? [];
	}

	public get length(): number {
		return this.mapTrees.length;
	}

	public is<TKind2 extends FlexFieldKind>(kind: TKind2): this is FlexTreeTypedField<TKind2> {
		return this.schema === kind.identifier;
	}

	public boxedIterator(): IterableIterator<FlexTreeNode> {
		return this.mapTrees
			.map(
				(m, index) =>
					getOrCreateChild(this.simpleContext, m, {
						parent: this,
						index,
					}) as FlexTreeNode,
			)
			.values();
	}

	public boxedAt(index: number): FlexTreeNode | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		const m = this.mapTrees[i];
		if (m !== undefined) {
			return getOrCreateChild(this.simpleContext, m, {
				parent: this,
				index: i,
			}) as FlexTreeNode;
		}
	}

	/**
	 * Mutate this field.
	 * @param edit - A function which receives the current `MapTree`s that comprise the contents of the field so that it may be mutated.
	 * The function may mutate the array in place or return a new array.
	 * If a new array is returned then it will be used as the new contents of the field, otherwise the original array will be continue to be used.
	 * @remarks All edits to the field (i.e. mutations of the field's MapTrees) should be directed through this function.
	 * This function ensures that the parent MapTree has no empty fields (which is an invariant of `MapTree`) after the mutation.
	 */
	protected edit(edit: (mapTrees: ExclusiveMapTree[]) => void | ExclusiveMapTree[]): void {
		const oldMapTrees = this.parent.mapTree.fields.get(this.key) ?? [];
		const newMapTrees = edit(oldMapTrees) ?? oldMapTrees;
		if (newMapTrees.length > 0) {
			this.parent.mapTree.fields.set(this.key, newMapTrees);
		} else {
			this.parent.mapTree.fields.delete(this.key);
		}

		this.onEdit?.();
	}

	public getFieldPath(): FieldUpPath {
		throw unsupportedUsageError("Editing an array");
	}

	/** Unboxes leaf nodes to their values */
	protected unboxed(index: number): FlexTreeUnknownUnboxed {
		const mapTree: ExclusiveMapTree = this.mapTrees[index] ?? oob();
		const value = mapTree.value;
		if (value !== undefined) {
			return value;
		}

		return getOrCreateChild(this.simpleContext, mapTree, { parent: this, index });
	}
}

class EagerMapTreeOptionalField
	extends UnhydratedFlexTreeField
	implements FlexTreeOptionalField
{
	public readonly editor = {
		set: (newContent: ExclusiveMapTree | undefined): void => {
			// If the new content is a UnhydratedFlexTreeNode, it needs to have its parent pointer updated
			if (newContent !== undefined) {
				nodeCache.get(newContent)?.adoptBy(this, 0);
			}
			// If the old content is a UnhydratedFlexTreeNode, it needs to have its parent pointer unset
			const oldContent = this.mapTrees[0];
			if (oldContent !== undefined) {
				nodeCache.get(oldContent)?.adoptBy(undefined);
			}

			this.edit((mapTrees) => {
				if (newContent !== undefined) {
					mapTrees[0] = newContent;
				} else {
					mapTrees.length = 0;
				}
			});
		},
	};

	public get content(): FlexTreeUnknownUnboxed | undefined {
		const value = this.mapTrees[0];
		if (value !== undefined) {
			return this.unboxed(0);
		}

		return undefined;
	}
}

class EagerMapTreeRequiredField
	extends EagerMapTreeOptionalField
	implements FlexTreeRequiredField
{
	public override get content(): FlexTreeUnknownUnboxed {
		// This cannot use ?? since null is a legal value here.
		assert(
			super.content !== undefined,
			0xa57 /* Expected EagerMapTree required field to have a value */,
		);
		return super.content;
	}
}

export class UnhydratedTreeSequenceField
	extends UnhydratedFlexTreeField
	implements FlexTreeSequenceField
{
	public readonly editor: UnhydratedTreeSequenceFieldEditBuilder = {
		insert: (index, newContent): void => {
			for (let i = 0; i < newContent.length; i++) {
				const c = newContent[i];
				assert(c !== undefined, 0xa0a /* Unexpected sparse array content */);
				nodeCache.get(c)?.adoptBy(this, index + i);
			}
			this.edit((mapTrees) => {
				if (newContent.length < 1000) {
					// For "smallish arrays" (`1000` is not empirically derived), the `splice` function is appropriate...
					mapTrees.splice(index, 0, ...newContent);
				} else {
					// ...but we avoid using `splice` + spread for very large input arrays since there is a limit on how many elements can be spread (too many will overflow the stack).
					return mapTrees.slice(0, index).concat(newContent, mapTrees.slice(index));
				}
			});
		},
		remove: (index, count): ExclusiveMapTree[] => {
			for (let i = index; i < index + count; i++) {
				const c = this.mapTrees[i];
				assert(c !== undefined, 0xa0b /* Unexpected sparse array */);
				nodeCache.get(c)?.adoptBy(undefined);
			}
			let removed: ExclusiveMapTree[] | undefined;
			this.edit((mapTrees) => {
				removed = mapTrees.splice(index, count);
			});
			return removed ?? fail("Expected removed to be set by edit");
		},
	};

	public at(index: number): FlexTreeUnknownUnboxed | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		return this.unboxed(i);
	}
	public map<U>(callbackfn: (value: FlexTreeUnknownUnboxed, index: number) => U): U[] {
		return Array.from(this, callbackfn);
	}

	public *[Symbol.iterator](): IterableIterator<FlexTreeUnknownUnboxed> {
		for (const [i] of this.mapTrees.entries()) {
			yield this.unboxed(i);
		}
	}
}

// #endregion Fields

// #region Caching and unboxing utilities

const nodeCache = new WeakMap<MapTree, UnhydratedFlexTreeNode>();
/** Node Parent -\> Field Key -\> Field */
const fieldCache = new WeakMap<
	UnhydratedFlexTreeNode,
	Map<FieldKey, UnhydratedFlexTreeField>
>();
function getFieldKeyCache(
	parent: UnhydratedFlexTreeNode,
): WeakMap<FieldKey, UnhydratedFlexTreeField> {
	return getOrCreate(fieldCache, parent, () => new Map());
}

/**
 * If there exists a {@link UnhydratedFlexTreeNode} for the given {@link MapTree}, returns it, otherwise returns `undefined`.
 * @remarks {@link UnhydratedFlexTreeNode | UnhydratedFlexTreeNodes} are created via {@link getOrCreateNode}.
 */
export function tryUnhydratedFlexTreeNode(
	mapTree: MapTree,
): UnhydratedFlexTreeNode | undefined {
	return nodeCache.get(mapTree);
}

/** Helper for creating a `UnhydratedFlexTreeNode` given the parent field (e.g. when "walking down") */
function getOrCreateChild(
	context: Context,
	mapTree: ExclusiveMapTree,
	parent: LocationInField | undefined,
): UnhydratedFlexTreeNode {
	const cached = nodeCache.get(mapTree);
	if (cached !== undefined) {
		return cached;
	}

	return new UnhydratedFlexTreeNode(context, mapTree, parent);
}

/** Creates a field with the given attributes, or returns a cached field if there is one */
function getOrCreateField(
	parent: UnhydratedFlexTreeNode,
	key: FieldKey,
	schema: FieldKindIdentifier,
	onEdit?: () => void,
): UnhydratedFlexTreeField {
	const cached = getFieldKeyCache(parent).get(key);
	if (cached !== undefined) {
		return cached;
	}

	if (
		schema === FieldKinds.required.identifier ||
		schema === FieldKinds.identifier.identifier
	) {
		return new EagerMapTreeRequiredField(parent.simpleContext, schema, key, parent, onEdit);
	}

	if (schema === FieldKinds.optional.identifier) {
		return new EagerMapTreeOptionalField(parent.simpleContext, schema, key, parent, onEdit);
	}

	if (schema === FieldKinds.sequence.identifier) {
		return new UnhydratedTreeSequenceField(parent.simpleContext, schema, key, parent, onEdit);
	}

	return new UnhydratedFlexTreeField(parent.simpleContext, schema, key, parent, onEdit);
}

// #endregion Caching and unboxing utilities

export function unsupportedUsageError(message?: string): Error {
	return new UsageError(
		`${
			message ?? "Operation"
		} is not supported for content that has not yet been inserted into the tree`,
	);
}
