/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { HasListeners, Listenable } from "@fluidframework/core-interfaces/internal";
import { assert, oob, fail, debugAssert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type AnchorEvents,
	dummyRoot,
	EmptyKey,
	storedEmptyFieldSchema,
	type DeltaDetachedNodeId,
	type DeltaMark,
	type FieldKey,
	type FieldKindIdentifier,
	type ITreeCursorSynchronous,
	type NodeData,
	type NormalizedFieldUpPath,
	ObjectNodeStoredSchema,
	type SchemaPolicy,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeValue,
	type Value,
} from "../../core/index.js";
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
	type OptionalFieldEditBuilder,
	type ValueFieldEditBuilder,
	type FlexibleNodeContent,
	type FlexTreeHydratedContextMinimal,
	type FlexibleFieldContent,
	type MapTreeFieldViewGeneric,
	type MapTreeNodeViewGeneric,
	type HydratedFlexTreeNode,
	cursorForMapTreeField,
	type MinimalFieldMap,
	currentObserver,
} from "../../feature-libraries/index.js";
import { brand, filterIterable, mapIterable } from "../../util/index.js";
import type { ContextualFieldProvider } from "../fieldSchema.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
import type { SchemaComponent } from "../treeSchema.js";

import type { Context } from "./context.js";
import type { TreeNode } from "./treeNode.js";

interface UnhydratedTreeSequenceFieldEditBuilder
	extends SequenceFieldEditBuilder<FlexibleFieldContent, UnhydratedFlexTreeNode[]> {
	/**
	 * Moves elements from a source position to a destination position.
	 * Can move within the same field or from another unhydrated sequence field.
	 * @param sourceIndex - The index of the first element to move.
	 * @param count - The number of elements to move. Must be a positive integer.
	 * @param destIndex - The index at which to insert the moved elements.
	 * @param source - The source field to move from (defaults to this field for within-field moves).
	 */
	move(
		sourceIndex: number,
		count: number,
		destIndex: number,
		source?: UnhydratedSequenceField,
	): void;
}

type UnhydratedFlexTreeNodeEvents = Pick<
	AnchorEvents,
	"childrenChangedAfterBatch" | "subtreeChangedAfterBatch"
>;

/** A node's parent field and its index in that field */
type LocationInField = FlexTreeNode["parentField"];

/**
 * Placeholder `DeltaDetachedNodeId` used as the attach/detach id in synthetic delta marks produced
 * by the unhydrated sequence-field editor. Only the *presence* of the id is checked by
 * {@link deltaMarksToArrayOps}, so the value itself is arbitrary.
 */
const syntheticDetachedNodeId: DeltaDetachedNodeId = { minor: 0 };

/**
 * Creates an unhydrated node with the implementation selected by its stored schema.
 * @param data - The node's type and value, consistent with the context's schema.
 * A defined value identifies a leaf, including falsy values and null.
 * @param fields - The node's initial fields, whose ownership transfers to the new node.
 * The constructor assigns their parent to the new node, so they must not belong to another node.
 * Leaves must have no fields.
 * @param context - Supplies the view and stored schemas reachable from this node.
 * @param storedSchema - The stored schema for `data.type` from `context.flexContext.schema.nodeSchema`.
 * Supply it when already resolved to avoid another lookup; otherwise the factory resolves it for non-leaf nodes.
 * This is not a schema override and must agree with the context's schema.
 * Leaf construction neither uses this argument nor looks up the schema.
 * @remarks
 * For stored object schemas, the selected implementation retains declared field instances even when empty.
 * For other schemas, it retains only non-empty fields and fields with pending defaults.
 */
export function createUnhydratedFlexTreeNode(
	data: NodeData,
	fields: Map<FieldKey, UnhydratedFlexTreeField>,
	context: Context,
	storedSchema?: TreeNodeStoredSchema,
): UnhydratedFlexTreeNode {
	if (data.value !== undefined) {
		return new UnhydratedGeneralNode(data, fields, context);
	}
	const schema =
		storedSchema ??
		context.flexContext.schema.nodeSchema.get(data.type) ??
		fail("Missing schema for unhydrated node");
	return schema instanceof ObjectNodeStoredSchema
		? new UnhydratedObjectNode(data, fields, context)
		: new UnhydratedGeneralNode(data, fields, context);
}

/**
 * Base for FlexTree nodes whose content has not been inserted into a forest.
 * @remarks
 * Subclasses determine whether empty field instances are retained.
 */
export abstract class UnhydratedFlexTreeNode
	implements FlexTreeNode, MapTreeNodeViewGeneric<UnhydratedFlexTreeNode>
{
	public isHydrated(): this is HydratedFlexTreeNode {
		return false;
	}

	private location = unparentedLocation;

	public get storedSchema(): TreeNodeStoredSchema {
		return (
			this.context.schema.nodeSchema.get(this.data.type) ?? fail(0xb46 /* missing schema */)
		);
	}

	/**
	 * Cache storing the {@link TreeNode} for this inner node.
	 * @remarks
	 * When creating a `TreeNode` for this `UnhydratedFlexTreeNode`, cache the `TreeNode` in this property.
	 * Currently this is done by {@link TreeNodeKernel}.
	 *
	 * See {@link getOrCreateNodeFromInnerNode} how to get the `TreeNode`, even if not already created, regardless of hydration status.
	 */
	public treeNode: TreeNode | undefined;

	public readonly [flexTreeMarker] = FlexTreeEntityKind.Node as const;

	private readonly _events = createEmitter<UnhydratedFlexTreeNodeEvents>();
	public get events(): Listenable<UnhydratedFlexTreeNodeEvents> &
		HasListeners<UnhydratedFlexTreeNodeEvents> {
		return this._events;
	}

	public get context(): FlexTreeContext {
		return this.simpleContext.flexContext;
	}

	/**
	 * Creates an unhydrated node and assigns its fields to it.
	 * @param data - Node type and value consistent with the context's schema.
	 * @param fieldsAll - Initial fields. Ownership of the map and its fields transfers to this node;
	 * the fields must not belong to another node. Leaves must have no fields.
	 * @param simpleContext - Supplies schemas for this node and its descendants.
	 */
	public constructor(
		/**
		 * The {@link NodeData} for this node.
		 */
		public readonly data: NodeData,
		/**
		 * The retained {@link UnhydratedFlexTreeField} instances for this node.
		 * @remarks
		 * {@link UnhydratedObjectNode} retains declared fields which have been previously requested, even when empty.
		 * General nodes retain only non-empty fields and fields with pending defaults.
		 */
		protected readonly fieldsAll: Map<FieldKey, UnhydratedFlexTreeField>,
		/**
		 * The {@link Context} for this node.
		 * @remarks
		 * Provides access to all schemas reachable from this node.
		 * See {@link SchemaComponent.context}.
		 */
		public readonly simpleContext: Context,
	) {
		for (const field of this.fieldsAll.values()) {
			field.parent = this;
		}
	}

	/**
	 * The non-empty fields on this node.
	 * @remarks
	 * This is needed to implement {@link MapTreeNodeViewGeneric.fields}, which must omit empty fields.
	 * Due to having to detect if a field is empty, this forces the evaluation of any pending defaults in the fields.
	 * Use {@link allFieldsLazy} to avoid evaluating pending defaults.
	 */
	public readonly fields: MinimalFieldMap<UnhydratedFlexTreeField> = {
		get: (key: FieldKey): UnhydratedFlexTreeField | undefined => this.tryGetField(key),
		[Symbol.iterator]: (): IterableIterator<[FieldKey, UnhydratedFlexTreeField]> => {
			currentObserver?.observeNodeFields(this);
			return filterIterable(this.fieldsAll, ([, field]) => field.length > 0);
		},
	};

	public [Symbol.iterator](): IterableIterator<UnhydratedFlexTreeField> {
		return mapIterable(this.fields, ([, field]) => field)[Symbol.iterator]();
	}

	/**
	 * Gets all retained field instances, including any retained empty fields.
	 * @remarks
	 * Returns the live field map without evaluating pending defaults or making a copy.
	 * Evicted field instances are not included even if a caller still holds them.
	 */
	public get allFieldsLazy(): ReadonlyMap<FieldKey, UnhydratedFlexTreeField> {
		return this.fieldsAll;
	}

	public get type(): TreeNodeSchemaIdentifier {
		return this.data.type;
	}

	/**
	 * Gets a retained field or creates an empty one using this node's stored schema.
	 * @remarks
	 * Newly created fields are retained only when {@link UnhydratedFlexTreeNode.retainsEmptyField} allows it.
	 * This does not observe the field or evaluate pending defaults.
	 */
	protected getOrCreateField(key: FieldKey): UnhydratedFlexTreeField {
		const existing = this.fieldsAll.get(key);
		if (existing !== undefined) {
			return existing;
		}
		const stored = this.storedSchema.getFieldSchema(key).kind;
		const field = createField(this.context, stored, key, []);
		field.parent = this;
		if (this.retainsEmptyField(key)) {
			this.fieldsAll.set(key, field);
		}
		return field;
	}

	/**
	 * Gets the retained field at `key`, or undefined if none is retained.
	 * @remarks
	 * Does not create a field, observe its contents, or evaluate pending defaults.
	 */
	public getStoredField(key: FieldKey): UnhydratedFlexTreeField | undefined {
		return this.fieldsAll.get(key);
	}

	/**
	 * Updates field storage before change notifications.
	 * @param field - The current field instance for its key, parented to this node.
	 * @remarks
	 * Retains populated fields and pending defaults; empty fields are retained only when
	 * {@link UnhydratedFlexTreeNode.retainsEmptyField} allows it. Does not emit notifications.
	 */
	public updateField(field: UnhydratedFlexTreeField): void {
		if (field.pendingDefault || field.length > 0 || this.retainsEmptyField(field.key)) {
			this.fieldsAll.set(field.key, field);
		} else {
			this.fieldsAll.delete(field.key);
		}
	}

	/**
	 * Reports whether an empty field at `key` should be retained when it has no pending default.
	 */
	protected abstract retainsEmptyField(key: FieldKey): boolean;

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
		if (parent === undefined) {
			assert(
				this.location !== unparentedLocation,
				0xa09 /* Node may not be un-adopted if it does not have a parent */,
			);
			this.location = unparentedLocation;
		} else {
			assert(index !== undefined, 0xa08 /* Expected index */);
			if (this.location !== unparentedLocation) {
				throw new UsageError("A node may not be in more than one place in the tree");
			}
			let unhydratedNode: UnhydratedFlexTreeNode | undefined = parent.parent;
			while (unhydratedNode !== undefined) {
				if (unhydratedNode === this) {
					throw new UsageError(
						"A node may not be inserted into a location that is under itself",
					);
				}
				const parentNode: FlexTreeNode | undefined = unhydratedNode.parentField.parent.parent;
				assert(
					parentNode === undefined || parentNode instanceof UnhydratedFlexTreeNode,
					0xb77 /* Unhydrated node's parent should be an unhydrated node */,
				);
				unhydratedNode = parentNode;
			}
			this.location = { parent, index };
		}
	}

	/**
	 * The field this tree is in, and the index within that field.
	 * @remarks If this node is unparented, this method will return the special {@link unparentedLocation} as the parent.
	 */
	public get parentField(): LocationInField {
		currentObserver?.observeParentOf(this);
		return this.location;
	}

	public borrowCursor(): ITreeCursorSynchronous {
		return cursorForMapTreeNode<MapTreeNodeViewGeneric<UnhydratedFlexTreeNode>>(this);
	}

	public tryGetField(key: FieldKey): UnhydratedFlexTreeField | undefined {
		currentObserver?.observeNodeField(this, key);

		const field = this.fieldsAll.get(key);
		// Only return the field if it is not empty, in order to fulfill the contract of `tryGetField`.
		if (field !== undefined && field.length > 0) {
			return field;
		}
	}

	public getBoxed(key: string): UnhydratedFlexTreeField {
		const fieldKey: FieldKey = brand(key);

		currentObserver?.observeNodeField(this, fieldKey);

		return this.getOrCreateField(fieldKey);
	}

	public getFirstFieldChild(key: FieldKey): FlexTreeUnknownUnboxed | undefined {
		currentObserver?.observeNodeField(this, key);
		const child = this.fieldsAll.get(key)?.children[0];
		if (child === undefined) {
			return undefined;
		}
		const value = child.value;
		return value === undefined ? child : value;
	}

	public keys(): IterableIterator<FieldKey> {
		return Array.from(this.fields, ([key]) => key)[Symbol.iterator]();
	}

	public get value(): Value {
		return this.data.value;
	}

	/**
	 * Emit a `childrenChangedAfterBatch` event for this node, then propagate deep-change
	 * signals to ancestor array nodes and subtree-changed signals up the entire ancestor chain.
	 * @param key - The field key that changed.
	 * @param marks - Optional delta marks describing the change to the field. When provided, they
	 * are included in the `fieldMarks` payload so that array-node listeners can build a delta.
	 * When omitted (e.g. for non-sequence fields), `fieldMarks` is empty.
	 */
	public emitChangedEvent(key: FieldKey, marks?: readonly DeltaMark[]): void {
		this._events.emit("childrenChangedAfterBatch", {
			changedFields: new Set([key]),
			fieldMarks: marks === undefined ? new Map() : new Map([[key, marks]]),
		});

		// Emit subtree-changed events for this node and its non-array ancestors first,
		// so that node.treeChanged fires before any ancestor array.treeChanged.
		// Array ancestors and the nodes above them are handled by
		// #emitDeepChangesToAncestorArrays, which propagates subtree events above
		// each array boundary in the correct order.
		this.#emitSubtreeChangedEvents();

		// Mirrors the onlyDeepChanges block in anchorSet.ts for unhydrated nodes.
		this.#emitDeepChangesToAncestorArrays();
	}

	/**
	 * Emit `childrenChangedAfterBatch` on each ancestor array node with synthetic
	 * marks indicating a deep change at this node's position within the array.
	 * After emitting on each array ancestor, propagates subtree-changed events
	 * upward from that array so that ancestor nodes above the array receive their
	 * `treeChanged` events after the array's own event.
	 */
	#emitDeepChangesToAncestorArrays(): void {
		const location = this.parentField;
		const parentField = location.parent;
		const parentNode = parentField.parent;

		if (parentNode === undefined || !(parentNode instanceof UnhydratedFlexTreeNode)) {
			return;
		}

		// Only emit on array ancestors (EmptyKey); object/map ancestors don't carry delta payloads.
		if (parentField.key === EmptyKey) {
			const index = location.index;
			const syntheticMarks: DeltaMark[] = [];
			if (index > 0) {
				syntheticMarks.push({ count: index });
			}
			// `fields` presence (not content) signals a deep change to deltaMarksToArrayOps.
			syntheticMarks.push({ count: 1, fields: new Map([[EmptyKey, { marks: [] }]]) });

			parentNode._events.emit("childrenChangedAfterBatch", {
				changedFields: new Set([EmptyKey]),
				fieldMarks: new Map([[EmptyKey, syntheticMarks]]),
			});

			// Propagate subtree-changed events from the array upward so that
			// ancestors above this array receive treeChanged after the array itself.
			parentNode.#emitSubtreeChangedEvents();
		}

		parentNode.#emitDeepChangesToAncestorArrays();
	}

	/**
	 * Emit `subtreeChangedAfterBatch` on this node and propagate upward to
	 * ancestors, stopping before the first ancestor array node.
	 * Propagation stops at an array boundary because
	 * {@link UnhydratedFlexTreeNode.#emitDeepChangesToAncestorArrays} is
	 * responsible for emitting on array ancestors and the nodes above them
	 * in the correct order.
	 */
	#emitSubtreeChangedEvents(): void {
		this._events.emit("subtreeChangedAfterBatch");

		const parentField = this.parentField.parent;
		if (parentField.key === EmptyKey) {
			// This node is an array element; stop here so that array ancestor
			// events fire in the correct order relative to this node's treeChanged.
			return;
		}
		const parent = parentField.parent;
		assert(
			parent === undefined || parent instanceof UnhydratedFlexTreeNode,
			0xb76 /* Unhydrated node's parent should be an unhydrated node */,
		);
		if (parent !== undefined) {
			parent.#emitSubtreeChangedEvents();
		}
	}
}

/**
 * An unhydrated node for any stored schema, retaining only non-empty fields and fields with pending defaults.
 */
export class UnhydratedGeneralNode extends UnhydratedFlexTreeNode {
	/**
	 * Creates an unhydrated node, removing empty fields without pending defaults from its initial field map.
	 * @param data - Node type and value consistent with the context's schema.
	 * @param fields - Initial fields, owned by the new node. Fields must not belong to another node; leaves must have none.
	 * @param context - Supplies schemas for this node and its descendants.
	 */
	public constructor(
		data: NodeData,
		fields: Map<FieldKey, UnhydratedFlexTreeField>,
		context: Context,
	) {
		super(data, fields, context);
		for (const [key, field] of fields) {
			if (!field.pendingDefault && field.length === 0) {
				fields.delete(key);
			}
		}
	}

	protected override retainsEmptyField(_key: FieldKey): boolean {
		return false;
	}
}

/**
 * An unhydrated node for stored object schemas that retains declared field instances, even when empty.
 * @remarks
 * This is a specialized implementation of {@link UnhydratedGeneralNode} for object nodes:
 * {@link UnhydratedGeneralNode} also supports stored object schemas, but this implementation should have faster field access by retaining empty declared fields without pending defaults.
 */
export class UnhydratedObjectNode extends UnhydratedFlexTreeNode {
	protected override retainsEmptyField(key: FieldKey): boolean {
		const schema = this.storedSchema;
		assert(schema instanceof ObjectNodeStoredSchema, "Expected a stored object schema");
		return schema.objectNodeFields.has(key);
	}
}

/**
 * Implementation of `FlexTreeContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 */
export class UnhydratedContext implements FlexTreeContext {
	public readonly schema: TreeStoredSchema;

	/**
	 * @param nodeSchema - Node definitions to use when working with the tree.
	 * Unhydrated nodes have no document root, so the context uses a forbidden root field.
	 */
	public constructor(
		public readonly schemaPolicy: SchemaPolicy,
		nodeSchema: TreeStoredSchema["nodeSchema"],
	) {
		this.schema = {
			nodeSchema,
			rootFieldSchema: storedEmptyFieldSchema,
		};
	}

	public isDisposed(): boolean {
		return false;
	}

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
 *
 * TODO: make this make sense.
 */
const unparentedLocation: LocationInField = {
	parent: {
		key: dummyRoot,
		parent: undefined,
		schema: brand(FieldKinds.optional.identifier),
	},
	index: 0,
};

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeField}.
 */
export class UnhydratedFlexTreeField
	implements FlexTreeField, MapTreeFieldViewGeneric<UnhydratedFlexTreeNode>
{
	public [flexTreeMarker] = FlexTreeEntityKind.Field as const;

	public parent: UnhydratedFlexTreeNode | undefined = undefined;

	/**
	 * Creates a field and assigns parentage to any supplied children.
	 * @param context - Supplies the field's schema policy.
	 * @param schema - The stored field kind.
	 * @param key - The field key on its eventual parent.
	 * @param lazyChildren - Unparented children whose array ownership transfers to this field, or a pending contextual default.
	 */
	public constructor(
		public readonly context: FlexTreeContext,
		public readonly schema: FieldKindIdentifier,
		public readonly key: FieldKey,
		/**
		 * The children of this field.
		 * @remarks
		 * This is either an array of {@link UnhydratedFlexTreeNode}s or a {@link ContextualFieldProvider} that will be used to populate the children lazily (after which it will become an array).
		 * See {@link fillPendingDefaults}.
		 * Note that any fields using a {@link ConstantFieldProvider} should be evaluated before constructing the UnhydratedFlexTreeField.
		 */
		private lazyChildren: UnhydratedFlexTreeNode[] | ContextualFieldProvider,
	) {
		// When a field is created, its children become parented for the first time.
		// "Adopt" each child by updating its parent information to point to this field.
		if (Array.isArray(lazyChildren)) {
			for (const [i, child] of lazyChildren.entries()) {
				child.adoptBy(this, i);
			}
		}
	}

	public borrowCursor(): ITreeCursorSynchronous {
		return cursorForMapTreeField<MapTreeNodeViewGeneric<UnhydratedFlexTreeNode>>(
			this.children,
		);
	}

	private getPendingDefault(): ContextualFieldProvider | undefined {
		return Array.isArray(this.lazyChildren) ? undefined : this.lazyChildren;
	}

	/**
	 * Evaluates this field's pending default, if any, using the supplied hydrated context.
	 * @remarks
	 * Follows any replacement field instance and updates its parent's retained fields before returning.
	 * Does not recurse into children or emit change notifications.
	 * @see {@link pendingDefault}.
	 */
	public fillPendingDefaults(context: FlexTreeHydratedContextMinimal): void {
		const current = this.currentField;
		if (current !== this) {
			current.fillPendingDefaults(context);
			return;
		}
		const provider = this.getPendingDefault();
		if (provider) {
			const content = provider(context);
			this.lazyChildren = content;
			this.parent?.updateField(this);
		}
	}

	/**
	 * Reports whether the current field instance has an unevaluated {@link ContextualFieldProvider}.
	 * Does not evaluate the provider.
	 */
	public get pendingDefault(): boolean {
		const current = this.currentField;
		if (current !== this) {
			return current.pendingDefault;
		}
		return this.getPendingDefault() !== undefined;
	}

	/**
	 * The field instance to use for current content and edits.
	 * For general nodes, resolves any retained replacement at the same key after eviction.
	 * Returns this instance when no replacement exists; declared fields on {@link UnhydratedObjectNode} always keep their instance.
	 */
	protected get currentField(): UnhydratedFlexTreeField {
		const parent = this.parent;
		return parent === undefined || parent instanceof UnhydratedObjectNode
			? this
			: (parent.getStoredField(this.key) ?? this);
	}

	/**
	 * The current children, following any replacement field instance.
	 * Evaluates pending defaults using the global context and updates the parent's retained fields.
	 * Mutations must go through {@link UnhydratedFlexTreeField.edit} to maintain parentage and notifications.
	 */
	public get children(): UnhydratedFlexTreeNode[] {
		const current = this.currentField;
		if (current !== this) {
			return current.children;
		}
		const provider = this.getPendingDefault();
		if (provider) {
			const content = provider("UseGlobalContext");
			this.lazyChildren = content;
			this.parent?.updateField(this);
		}
		return this.lazyChildren as UnhydratedFlexTreeNode[];
	}

	public get length(): number {
		return this.children.length;
	}

	public is<TKind2 extends FlexFieldKind>(kind: TKind2): this is FlexTreeTypedField<TKind2> {
		return this.schema === kind.identifier;
	}

	public boxedAt(index: number): FlexTreeNode | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		const m = this.children[i];
		return m;
	}

	public [Symbol.iterator](): IterableIterator<UnhydratedFlexTreeNode> {
		return this.children[Symbol.iterator]();
	}

	/**
	 * Edits the current field instance, maintaining child parentage and notifying its parent.
	 * @param edit - Mutates the current child array in place or returns a replacement array.
	 * Children are unparented before the callback and adopted by the current field afterward.
	 * @remarks
	 * Follows any replacement field instance and updates the parent's retained fields before emitting notifications.
	 * All mutations to field content must use this method.
	 */
	protected edit(
		edit: (mapTrees: UnhydratedFlexTreeNode[]) => void | UnhydratedFlexTreeNode[],
		/**
		 * Delta marks describing this edit, forwarded to {@link UnhydratedFlexTreeNode.emitChangedEvent}.
		 * Sequence-field subclasses pass pre-computed marks so that array-node listeners receive a
		 * meaningful delta; other field kinds omit this parameter.
		 */
		marks?: readonly DeltaMark[],
	): void {
		const current = this.currentField;
		if (current !== this) {
			current.edit(edit, marks);
			return;
		}
		// Clear parents for all old map trees.
		const children = this.children;
		for (const tree of children) {
			tree.adoptBy(undefined);
		}

		const updatedChildren = edit(children) ?? children;
		this.lazyChildren = updatedChildren;

		// Set parents for all new map trees.
		for (const [index, tree] of updatedChildren.entries()) {
			tree.adoptBy(this, index);
		}

		this.parent?.updateField(this);
		this.parent?.emitChangedEvent(this.key, marks);
	}

	public getFieldPath(): NormalizedFieldUpPath {
		throw unsupportedUsageError("Editing an array");
	}

	/** Unboxes leaf nodes to their values */
	protected unboxed(index: number): TreeValue | UnhydratedFlexTreeNode {
		const child = this.children[index] ?? oob();
		const value = child.value;
		if (value !== undefined) {
			return value;
		}
		return child;
	}
}

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeOptionalField}.
 */
export class UnhydratedOptionalField
	extends UnhydratedFlexTreeField
	implements FlexTreeOptionalField
{
	public readonly editor = {
		set: (newContent: FlexibleNodeContent | undefined): void => {
			if (newContent !== undefined) {
				assert(
					newContent instanceof UnhydratedFlexTreeNode,
					0xbb7 /* Expected unhydrated node */,
				);
			}

			this.edit((mapTrees) => {
				if (newContent === undefined) {
					mapTrees.length = 0;
				} else {
					mapTrees[0] = newContent;
				}
			});
		},
	} satisfies OptionalFieldEditBuilder<FlexibleNodeContent> &
		ValueFieldEditBuilder<FlexibleNodeContent>;

	/**
	 * The current child with leaf values unboxed, or undefined if the field is empty.
	 */
	public get content(): FlexTreeUnknownUnboxed | undefined {
		const child = this.children[0];
		if (child !== undefined) {
			const value = child.value;
			return value === undefined ? child : value;
		}

		return undefined;
	}
}

/**
 * An unhydrated field containing exactly one child, returned with leaf values unboxed.
 */
class UnhydratedRequiredField
	extends UnhydratedOptionalField
	implements FlexTreeRequiredField
{
	/**
	 * The field's single child, with leaf values unboxed.
	 */
	public override get content(): FlexTreeUnknownUnboxed {
		// This cannot use ?? since null is a legal value here.
		const content = super.content;
		assert(
			content !== undefined,
			0xa57 /* Expected EagerMapTree required field to have a value */,
		);
		return content;
	}
}

/**
 * The {@link Unhydrated} implementation of {@link FlexTreeSequenceField}.
 */
export class UnhydratedSequenceField
	extends UnhydratedFlexTreeField
	implements FlexTreeSequenceField
{
	/**
	 * {@inheritDoc FlexTreeSequenceField.editor}
	 * @privateRemarks
	 * Resolves retained field instances to their replacements.
	 * Moves between two instances of the same field are treated as within-field moves.
	 */
	public readonly editor = {
		insert: (index, newContent): void => {
			for (const c of newContent) {
				assert(c !== undefined, 0xa0a /* Unexpected sparse array content */);
				assert(c instanceof UnhydratedFlexTreeNode, 0xbb8 /* Expected unhydrated node */);
			}
			const newContentChecked = newContent as readonly UnhydratedFlexTreeNode[];
			const insertCount = newContentChecked.length;
			const marks: DeltaMark[] = [];
			if (index > 0) marks.push({ count: index });
			marks.push({ count: insertCount, attach: syntheticDetachedNodeId });
			this.edit((mapTrees) => {
				if (newContent.length < 1000) {
					// For "smallish arrays" (`1000` is not empirically derived), the `splice` function is appropriate...
					mapTrees.splice(index, 0, ...newContentChecked);
				} else {
					// ...but we avoid using `splice` + spread for very large input arrays since there is a limit on how many elements can be spread (too many will overflow the stack).
					return [...mapTrees.slice(0, index), ...newContentChecked, ...mapTrees.slice(index)];
				}
			}, marks);
		},
		remove: (index, count): UnhydratedFlexTreeNode[] => {
			for (let i = index; i < index + count; i++) {
				const c = this.children[i];
				assert(c !== undefined, 0xa0b /* Unexpected sparse array */);
			}
			const marks: DeltaMark[] = [];
			if (index > 0) marks.push({ count: index });
			marks.push({ count, detach: syntheticDetachedNodeId });
			let removed: UnhydratedFlexTreeNode[] | undefined;
			this.edit((mapTrees) => {
				removed = mapTrees.splice(index, count);
			}, marks);
			return removed ?? fail(0xb4a /* Expected removed to be set by edit */);
		},
		move: (sourceIndex, count, destIndex, source?): void => {
			const destination = this.currentField;
			const sourceField = (source ?? this).currentField;
			assert(
				destination instanceof UnhydratedSequenceField &&
					sourceField instanceof UnhydratedSequenceField,
				"Sequence moves require sequence fields",
			);
			if (destination !== this) {
				destination.editor.move(sourceIndex, count, destIndex, sourceField);
				return;
			}
			if (sourceField === this) {
				// Within-field move: do both operations in a single edit to emit only one event
				const marks = buildUnhydratedMoveMarks(sourceIndex, count, destIndex);
				this.edit((mapTrees) => {
					if (destIndex > sourceIndex && destIndex < sourceIndex + count) {
						// The destination gap is inside the moved range.
						// This leaves the content unchanged, so we return early.
						// We still need the enclosing edit call to emit a change event with delta marks
						// matching hydrated editing behavior.
						return;
					}
					const removed = mapTrees.splice(sourceIndex, count);
					// Adjust destination index if it comes after the source
					const adjustedDest = destIndex > sourceIndex ? destIndex - count : destIndex;
					if (removed.length < 1000) {
						// For "smallish arrays" (`1000` is not empirically derived), the `splice` function is appropriate...
						mapTrees.splice(adjustedDest, 0, ...removed);
					} else {
						// ...but we avoid using `splice` + spread for very large arrays since there is a limit on how many elements can be spread (too many will overflow the stack).
						return [
							...mapTrees.slice(0, adjustedDest),
							...removed,
							...mapTrees.slice(adjustedDest),
						];
					}
				}, marks);
			} else {
				// Cross-field move: remove from source, insert into destination
				// Each field emits one event (correct behavior for different fields)
				const removed = sourceField.editor.remove(sourceIndex, count);
				this.editor.insert(destIndex, removed);
			}
		},
	} satisfies UnhydratedTreeSequenceFieldEditBuilder;

	public at(index: number): FlexTreeUnknownUnboxed | undefined {
		const i = indexForAt(index, this.length);
		if (i === undefined) {
			return undefined;
		}
		return this.atIndex(i);
	}

	public atIndex(index: number): FlexTreeUnknownUnboxed {
		return this.unboxed(index);
	}
	public map<U>(callbackfn: (value: FlexTreeUnknownUnboxed, index: number) => U): U[] {
		return Array.from({ length: this.length }, (_, index) =>
			callbackfn(this.atIndex(index), index),
		);
	}
}

// #endregion Fields

/**
 * Builds {@link DeltaMark}s describing a within-field move for use in
 * {@link UnhydratedFlexTreeNode.emitChangedEvent}.
 *
 * @param sourceIndex - The index of the first element to move in the pre-edit sequence.
 * @param count - The number of consecutive elements to move. Must be a positive integer.
 * @param destIndex - The destination gap in the pre-edit sequence, without adjustment for removal.
 * @returns Synthetic notification marks.
 * These marks use placeholder detached-node IDs and are not suitable for applying the move to a forest.
 * @remarks
 * The caller must provide nonnegative integer indices with the source range and destination gap
 * within the sequence bounds. The array API filters out empty moves before calling this helper.
 *
 * Content-preserving moves can still change insertion anchors.
 */
export function buildUnhydratedMoveMarks(
	sourceIndex: number,
	count: number,
	destIndex: number,
): readonly DeltaMark[] {
	debugAssert(
		() => (Number.isInteger(count) && count > 0) || "Expected a positive integer move count",
	);
	const marks: DeltaMark[] = [];

	const leadingRetain = Math.min(sourceIndex, destIndex);
	if (leadingRetain > 0) {
		marks.push({ count: leadingRetain });
	}

	if (destIndex > sourceIndex && destIndex < sourceIndex + count) {
		// Destination is strictly inside the source range.
		// This is a no-op as far as content changes go, but still needs to emit marks which match the hydrated event behavior.

		// The prefix is the part of the source range before the destination gap; the suffix is the part after it.
		// Detach the prefix, attach the whole range, then detach the suffix.
		// With real detached-node IDs, the suffix's ID would keep the prefix's major and increase its minor by prefixLength.
		const prefixLength = destIndex - sourceIndex;
		marks.push({ count: prefixLength, detach: syntheticDetachedNodeId });
		// Attach the whole range at the destination gap.
		marks.push({ count, attach: syntheticDetachedNodeId });
		marks.push({
			count: count - prefixLength,
			detach: syntheticDetachedNodeId,
		});
	} else if (sourceIndex < destIndex) {
		// Forward move, including to the source range's ending gap: detach before attaching.
		// Retain only the elements between the source range's end and the destination.
		marks.push({ count, detach: syntheticDetachedNodeId });
		const between = destIndex - sourceIndex - count;
		if (between > 0) marks.push({ count: between });
		marks.push({ count, attach: syntheticDetachedNodeId });
	} else {
		// Backward move, including to the source range's starting gap: attach before detaching.
		// This order matters for insertion anchors even when the destination equals the source.
		marks.push({ count, attach: syntheticDetachedNodeId });
		const between = sourceIndex - destIndex;
		if (between > 0) marks.push({ count: between });
		marks.push({ count, detach: syntheticDetachedNodeId });
	}
	return marks;
}

/** Creates a field with the given attributes */
export function createField(
	...args: ConstructorParameters<typeof UnhydratedFlexTreeField>
): UnhydratedFlexTreeField {
	switch (args[1]) {
		case FieldKinds.required.identifier:
		case FieldKinds.identifier.identifier: {
			return new UnhydratedRequiredField(...args);
		}
		case FieldKinds.optional.identifier: {
			return new UnhydratedOptionalField(...args);
		}
		case FieldKinds.sequence.identifier: {
			return new UnhydratedSequenceField(...args);
		}
		case FieldKinds.forbidden.identifier: {
			// TODO: this seems to used by unknown optional fields. They should probably use "optional" not "Forbidden" schema.
			return new UnhydratedFlexTreeField(...args);
		}
		default: {
			return fail(0xb9d /* unsupported field kind */);
		}
	}
}

export function unsupportedUsageError(message?: string): Error {
	return new UsageError(
		`${
			message ?? "Operation"
		} is not supported for content that has not yet been inserted into the tree`,
	);
}
