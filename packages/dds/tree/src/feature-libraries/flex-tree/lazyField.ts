/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type AnchorNode,
	CursorLocationType,
	type ExclusiveMapTree,
	type FieldAnchor,
	type FieldKey,
	type FieldKindIdentifier,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	type NormalizedFieldUpPath,
	type TreeNavigationResult,
	inCursorNode,
	iterateCursorField,
	mapCursorField,
	rootFieldKey,
	topDownPath,
} from "../../core/index.js";
import { type IDisposable, disposeSymbol } from "../../util/index.js";
import { combineChunks } from "../chunked-forest/index.js";
import {
	FieldKinds,
	MappedEditBuilder,
	type IDefaultEditBuilder,
	type OptionalFieldEditBuilder,
	type SequenceFieldEditBuilder,
	type ValueFieldEditBuilder,
} from "../default-schema/index.js";
import { cursorForMapTreeField } from "../mapTreeCursor.js";
import type { FlexFieldKind } from "../modular-schema/index.js";

import type { Context } from "./context.js";
import {
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeOptionalField,
	type FlexTreeRequiredField,
	type FlexTreeSequenceField,
	type FlexTreeTypedField,
	type FlexTreeUnknownUnboxed,
	type FlexibleFieldContent,
	type FlexibleNodeContent,
	type HydratedFlexTreeNode,
	TreeStatus,
	flexTreeMarker,
	flexTreeSlot,
} from "./flexTreeTypes.js";
import { AnchoredEntity, LazyEntity } from "./lazyEntity.js";
import { LazyTreeNode, getOrCreateHydratedFlexTreeNode } from "./lazyNode.js";
import { indexForAt, treeStatusFromAnchorCache } from "./utilities.js";

/**
 * Looks up a field without navigating a cursor.
 * The caller must validate the owning node's lifetime before using the result.
 */
export function getCachedField(node: LazyTreeNode, key: FieldKey): FlexTreeField | undefined {
	return node.fieldCache?.get(key);
}

/**
 * Gets a FlexTree field instance, reusing the owning node's cache when appropriate.
 * @param context - Owns the field's lifetime and supplies its forest and schema policy.
 * @param schema - The field kind for the cursor's current field under the context's stored schema.
 * @param cursor - A cursor in the context's forest, positioned in fields mode.
 * Remains positioned on the same field; ownership stays with the caller.
 * @remarks
 * Fields without a parent node own their navigation resources and are not cached here.
 * Other fields use the parent node's field cache when appropriate, creating its FlexTree node instance if necessary.
 * Fields that own navigation resources take ownership of the temporary parent anchor.
 * Cache hits and fields that borrow their parent's navigation resources release that temporary anchor instead.
 */
export function makeField(
	context: Context,
	schema: FieldKindIdentifier,
	cursor: ITreeSubscriptionCursor,
): FlexTreeField {
	const fieldAnchor = cursor.buildFieldAnchor();
	let usedAnchor = false;

	const makeFlexTreeField = (): FlexTreeField => {
		usedAnchor = true;
		const field = new (
			kindToClass.get(schema) ?? fail(0xb0f /* missing field implementation */)
		)(context, schema, cursor, fieldAnchor);
		return field;
	};

	if (fieldAnchor.parent === undefined) {
		return makeFlexTreeField();
	}

	// For the common case (all but roots), cache field associated with its node's anchor and field key.
	const anchorNode =
		context.checkout.forest.anchors.locate(fieldAnchor.parent) ??
		fail(0xb10 /* missing anchor */);

	// Since anchor-set could be reused across a flex tree context getting disposed, key off the flex tree node not the anchor.
	let cacheKey = anchorNode.slots.get(flexTreeSlot);
	if (cacheKey === undefined) {
		cursor.exitField();
		cacheKey = getOrCreateHydratedFlexTreeNode(context, cursor);
		cursor.enterField(fieldAnchor.fieldKey);
	}
	assert(cacheKey instanceof LazyTreeNode, "Expected a lazy parent node");
	const result = cacheKey.getOrCreateField(cursor, makeFlexTreeField);
	if (!usedAnchor) {
		// The anchor must be disposed to avoid leaking. In the case of a cache hit,
		// or a field which borrows its parent's resources, no field takes ownership of it.
		context.checkout.forest.anchors.forget(fieldAnchor.parent);
	}
	return result;
}

/**
 * Common base for hydrated FlexTree fields, independent of navigation-resource ownership.
 * @remarks
 * {@link NodeBackedField} identifies a field through a containing node without owning persistent navigation resources.
 * {@link AnchoredField} owns those resources and also supports fields without a containing node, including root fields.
 * Subclasses provide content access, traversal, and any supported editing operations.
 */
export abstract class LazyField extends LazyEntity implements FlexTreeField {
	/**
	 * Identifies this entity as a FlexTree field.
	 */
	public get [flexTreeMarker](): FlexTreeEntityKind.Field {
		return FlexTreeEntityKind.Field;
	}

	public abstract readonly key: FieldKey;

	public abstract readonly schema: FieldKindIdentifier;

	public abstract readonly length: number;

	public abstract readonly parent: HydratedFlexTreeNode | undefined;

	public abstract boxedAt(index: number): HydratedFlexTreeNode | undefined;

	/**
	 * Iterates over this field's children in order, without unboxing leaf nodes.
	 */
	public abstract [Symbol.iterator](): IterableIterator<HydratedFlexTreeNode>;

	/**
	 * {@inheritDoc FlexTreeField.getFieldPath}
	 * @privateRemarks
	 * Returns an anchor-derived path after validating the field's lifetime.
	 * The path must not be retained across edits; detached fields have no parent node.
	 */
	public abstract getFieldPath(): { parent: AnchorNode | undefined; field: FieldKey };

	/**
	 * {@inheritDoc FlexTreeField.is}
	 * @param kind - A field kind registered in this context's schema policy.
	 */
	public is<TKind extends FlexFieldKind>(kind: TKind): this is FlexTreeTypedField<TKind> {
		assert(
			this.context.schemaPolicy.fieldKinds.get(kind.identifier) === kind,
			"Narrowing must use a field kind from this context",
		);
		return this.schema === kind.identifier;
	}

	/**
	 * Gets an in-document edit path after validating the field's lifetime.
	 * The path must not be retained across edits.
	 * @throws A usage error if the field is freed or is not in the document.
	 */
	public getFieldPathForEditing(): NormalizedFieldUpPath {
		if (!this.isFreed()) {
			const path = this.getFieldPath();
			if (
				path.parent === undefined
					? path.field === rootFieldKey
					: treeStatusFromAnchorCache(path.parent) === TreeStatus.InDocument
			) {
				return path;
			}
		}
		throw new UsageError("Editing only allowed on fields with TreeStatus.InDocument status");
	}
}

/**
 * Adapts field cursors to the checkout's chunk-based edit builder.
 */
function getEditor(context: Context): IDefaultEditBuilder<ITreeCursorSynchronous> {
	return new MappedEditBuilder(context.checkout.editor, (cursor: ITreeCursorSynchronous) =>
		combineChunks(context.checkout.forest.chunkField(cursor)),
	);
}

/**
 * A hydrated field identified by a containing node and field key.
 * @remarks
 * This field owns no persistent cursor, anchor, event subscription, or context registration.
 * It obtains its context, lifetime, and current field path from the containing node.
 * Cache eviction requires no explicit resource cleanup; retained field instances remain usable while the node remains valid.
 * Fields without a containing node use {@link AnchoredField} instead.
 */
abstract class NodeBackedField extends LazyField {
	/**
	 * Creates a field whose navigation resources and lifetime come from its parent node.
	 * @param parentNode - The containing node, which must not be freed when accessing the field.
	 * @param key - The field key on that node, whether or not the field is populated.
	 */
	public constructor(
		protected readonly parentNode: LazyTreeNode,
		public override readonly key: FieldKey,
	) {
		super();
	}

	public override get context(): Context {
		return this.parentNode.context;
	}

	public override get parent(): HydratedFlexTreeNode {
		this.getFieldPath();
		return this.parentNode;
	}

	public override isFreed(): boolean {
		return this.parentNode.isFreed();
	}

	public override borrowCursor(): ITreeCursorSynchronous {
		// TODO: Convert borrowCursor to a synchronous callback API so this can reuse and restore the parent's tracked cursor,
		// avoiding an unregistered cursor and the root-path walk. The callback contract need not guarantee recovery after exceptions.
		const { parent, field } = this.getFieldPath();
		// Use an independent, unregistered forest cursor to avoid boxing children or moving the parent's cursor.
		const cursor = this.context.checkout.forest.getCursorAboveDetachedFields();
		for (const step of topDownPath(parent)) {
			cursor.enterField(step.parentField);
			cursor.enterNode(step.parentIndex);
		}
		cursor.enterField(field);
		return cursor;
	}

	public override getFieldPath(): { parent: AnchorNode; field: FieldKey } {
		return this.parentNode.getFieldPath(this.key);
	}
}

/**
 * A forbidden field with constant empty results that do not access the parent's state.
 * @remarks
 * These results remain available after the parent node is freed.
 */
export class UncachedForbiddenField extends NodeBackedField {
	public override get schema(): FieldKindIdentifier {
		return FieldKinds.forbidden.identifier;
	}

	// eslint-disable-next-line @typescript-eslint/class-literal-property-style -- Avoid a per-instance slot for the constant length.
	public override get length(): number {
		return 0;
	}

	public override boxedAt(_index: number): undefined {
		return undefined;
	}

	public override [Symbol.iterator](): IterableIterator<HydratedFlexTreeNode> {
		return [].values();
	}
}

/**
 * A field that reads its contents using the parent node's cursor.
 * No cursor, anchor, event subscription, or context registration is retained by these fields.
 * @remarks
 * Iteration and {@link NodeBackedSequenceField.map} restart indexed navigation for each child so the parent cursor is restored before callbacks or yields.
 * Each lookup can scan preceding chunks, making traversal quadratic when a sequence contains many one-node chunks.
 * This is a deliberate fallback: public schemas cannot create sequence-valued maps, and public arrays use {@link LazySequence}, which owns a cursor.
 * Keeping this path simple avoids managing an additional cursor across callbacks or yields.
 * Revisit this tradeoff if sequence-valued maps become public or node-backed sequence fields are used on a performance-sensitive path.
 */
abstract class NodeBackedCursorField extends NodeBackedField {
	/**
	 * Reads this field using the parent node's cursor, restoring nodes mode afterward.
	 * @param read - A synchronous callback that must leave the cursor on this field,
	 * must not retain it, and must not edit the tree or access this node through another API while it is borrowed.
	 */
	protected withCursor<T>(read: (cursor: ITreeSubscriptionCursor) => T): T {
		const cursor = this.parentNode.cursor;
		cursor.enterField(this.key);
		try {
			return read(cursor);
		} finally {
			cursor.exitField();
		}
	}

	public override get length(): number {
		return this.withCursor((cursor) => cursor.getFieldLength());
	}

	/**
	 * {@inheritDoc FlexTreeSequenceField.atIndex}
	 */
	public atIndex(index: number): FlexTreeUnknownUnboxed {
		return this.withCursor((cursor) =>
			inCursorNode(cursor, index, (child) =>
				unboxedFlexNode(this.context, child, {
					parent: this.parentNode.anchor,
					fieldKey: this.key,
				}),
			),
		);
	}

	public override boxedAt(index: number): HydratedFlexTreeNode | undefined {
		return this.withCursor((cursor) => {
			const finalIndex = indexForAt(index, cursor.getFieldLength());
			return finalIndex === undefined
				? undefined
				: inCursorNode(cursor, finalIndex, (child) =>
						getOrCreateHydratedFlexTreeNode(this.context, child),
					);
		});
	}

	public override *[Symbol.iterator](): IterableIterator<HydratedFlexTreeNode> {
		const length = this.length;
		for (let index = 0; index < length; index++) {
			yield this.withCursor((cursor) =>
				inCursorNode(cursor, index, (child) =>
					getOrCreateHydratedFlexTreeNode(this.context, child),
				),
			);
		}
	}
}

/**
 * An optional field that reads its child using the containing node's cursor.
 */
class NodeBackedOptionalField extends NodeBackedCursorField implements FlexTreeOptionalField {
	public override get schema(): FieldKindIdentifier {
		return FieldKinds.optional.identifier;
	}

	/**
	 * The child with leaf values unboxed, or undefined if the field is empty.
	 */
	public get content(): FlexTreeUnknownUnboxed | undefined {
		return this.withCursor((cursor) =>
			unboxedFlexField(this.context, cursor, {
				parent: this.parentNode.anchor,
				fieldKey: this.key,
			}),
		);
	}

	/**
	 * Replaces or clears this field's content. The field must be in the document.
	 */
	public readonly editor: OptionalFieldEditBuilder<ExclusiveMapTree> = {
		set: (newContent, wasEmpty) => {
			const path = this.getFieldPathForEditing();
			getEditor(this.context)
				.optionalField(path)
				.set(
					newContent === undefined ? undefined : cursorForMapTreeField([newContent]),
					wasEmpty,
				);
		},
	};
}

/**
 * A required or identifier field that reads its single child using the containing node's cursor.
 */
class NodeBackedValueField extends NodeBackedCursorField implements FlexTreeRequiredField {
	/**
	 * Creates a single-child field that borrows its parent's navigation resources.
	 * @param parent - The containing node.
	 * @param key - The field key on that node.
	 * @param kind - The required or identifier field kind, matching the parent's stored schema at `key`.
	 */
	public constructor(
		parent: LazyTreeNode,
		key: FieldKey,
		private readonly kind: FieldKindIdentifier,
	) {
		super(parent, key);
	}

	public override get schema(): FieldKindIdentifier {
		return this.kind;
	}

	/**
	 * The field's single child, with leaf values unboxed.
	 */
	public get content(): FlexTreeUnknownUnboxed {
		return this.atIndex(0);
	}

	/**
	 * Replaces this field's child. The field must be in the document.
	 */
	public readonly editor: ValueFieldEditBuilder<FlexibleNodeContent> = {
		set: (newContent) => {
			const path = this.getFieldPathForEditing();
			getEditor(this.context)
				.valueField(path)
				.set(cursorForMapTreeField([newContent]));
		},
	};
}

/**
 * A sequence field that reads its children using the containing node's cursor.
 */
class NodeBackedSequenceField extends NodeBackedCursorField implements FlexTreeSequenceField {
	public override get schema(): FieldKindIdentifier {
		return FieldKinds.sequence.identifier;
	}

	public at(index: number): FlexTreeUnknownUnboxed | undefined {
		const finalIndex = indexForAt(index, this.length);
		return finalIndex === undefined ? undefined : this.atIndex(finalIndex);
	}

	public map<U>(callback: (value: FlexTreeUnknownUnboxed, index: number) => U): U[] {
		// User callbacks run after restoring the parent cursor, permitting reentrant reads.
		return Array.from({ length: this.length }, (_, index) =>
			callback(this.atIndex(index), index),
		);
	}

	public readonly editor: SequenceFieldEditBuilder<FlexibleFieldContent> = {
		insert: (index, newContent) => {
			const path = this.getFieldPathForEditing();
			getEditor(this.context)
				.sequenceField(path)
				.insert(index, cursorForMapTreeField(newContent));
		},
		remove: (index, count) => {
			const path = this.getFieldPathForEditing();
			getEditor(this.context).sequenceField(path).remove(index, count);
		},
	};
}

/**
 * Creates a FlexTree field instance for any supported stored field kind, borrowing navigation resources from its parent node.
 * @param parent - The containing node.
 * @param key - The field key on that node.
 * @param kind - A supported field kind matching the parent's stored schema at `key`.
 * @remarks
 * Always creates a new instance; the caller decides whether to cache it.
 */
export function makeNodeBackedField(
	parent: LazyTreeNode,
	key: FieldKey,
	kind: FieldKindIdentifier,
): FlexTreeField {
	switch (kind) {
		case FieldKinds.forbidden.identifier: {
			return new UncachedForbiddenField(parent, key);
		}
		case FieldKinds.optional.identifier: {
			return new NodeBackedOptionalField(parent, key);
		}
		case FieldKinds.required.identifier:
		case FieldKinds.identifier.identifier: {
			return new NodeBackedValueField(parent, key, kind);
		}
		case FieldKinds.sequence.identifier: {
			return new NodeBackedSequenceField(parent, key);
		}
		default: {
			return fail("Unsupported field kind");
		}
	}
}

/**
 * A hydrated field with its own persistent cursor, anchor, and disposal registration.
 * @remarks
 * Supports root fields as well as fields within nodes.
 * The optimization for stored object schemas caches these field instances for declared keys, including empty fields.
 * This retains their navigation resources for repeated access.
 * Resource management is composed rather than inherited so all hydrated fields share {@link LazyField}.
 */
export abstract class AnchoredField extends LazyField implements IDisposable {
	public override readonly key: FieldKey;
	private readonly resources: FieldResources;

	/**
	 * Creates a field with its own cursor and anchor ownership.
	 * @param context - The context whose forest contains the field.
	 * @param schema - The stored field kind, matching the selected field implementation.
	 * @param cursor - A current cursor on the field. It is forked; ownership stays with the caller.
	 * @param anchor - An anchor for that field. Ownership of its parent anchor transfers to this instance.
	 */
	public constructor(
		public override readonly context: Context,
		public override readonly schema: FieldKindIdentifier,
		cursor: ITreeSubscriptionCursor,
		public readonly anchor: FieldAnchor,
	) {
		super();
		assert(cursor.mode === CursorLocationType.Fields, 0x77b /* must be in fields mode */);
		this.key = cursor.getFieldKey();
		this.resources = new FieldResources(this, cursor);
	}

	/**
	 * Gets the owned cursor positioned on this field, recovering it from the anchor after edits.
	 * The field must not be freed. Callers must restore its position before using other tree APIs.
	 */
	public get cursor(): ITreeSubscriptionCursor {
		return this.resources.cursor;
	}

	public override borrowCursor(): ITreeCursorSynchronous {
		return this.resources.borrowCursor();
	}

	public override isFreed(): boolean {
		return this.resources.isFreed();
	}

	/**
	 * Clears this field's cursor before an edit, retaining its anchor for later recovery.
	 * The field must not be freed.
	 */
	public prepareForEdit(): void {
		this.resources.prepareForEdit();
	}

	/**
	 * Frees this field's navigation resources and removes its context and destruction registrations.
	 * Must be called at most once.
	 */
	public [disposeSymbol](): void {
		this.resources.disposeFromOwner();
	}

	/**
	 * {@inheritDoc AnchoredEntity.ensureValidForAccess}
	 */
	protected ensureValidForAccess(): void {
		this.resources.ensureValidForAccess();
	}

	public override get parent(): HydratedFlexTreeNode | undefined {
		if (this.anchor.parent === undefined) {
			return undefined;
		}

		this.ensureValidForAccess();
		const parent = this.context.checkout.forest.anchors.locate(this.anchor.parent);
		const cached = parent?.slots.get(flexTreeSlot);
		if (cached !== undefined) {
			assert(
				cached.context === this.context,
				0xd94 /* Parent context must match field context */,
			);
			return cached;
		}

		const cursor = this.cursor;
		cursor.exitField();
		const output = getOrCreateHydratedFlexTreeNode(this.context, cursor);
		cursor.enterField(this.key);
		return output;
	}

	public override get length(): number {
		return this.cursor.getFieldLength();
	}

	/**
	 * {@inheritDoc FlexTreeSequenceField.atIndex}
	 */
	public atIndex(index: number): FlexTreeUnknownUnboxed {
		return inCursorNode(this.cursor, index, (cursor) =>
			unboxedFlexNode(this.context, cursor, this.anchor),
		);
	}

	public override boxedAt(index: number): HydratedFlexTreeNode | undefined {
		const finalIndex = indexForAt(index, this.length);

		if (finalIndex === undefined) {
			return undefined;
		}

		return inCursorNode(this.cursor, finalIndex, (cursor) =>
			getOrCreateHydratedFlexTreeNode(this.context, cursor),
		);
	}

	/**
	 * {@inheritDoc FlexTreeSequenceField.map}
	 */
	public map<U>(callbackfn: (value: FlexTreeUnknownUnboxed, index: number) => U): U[] {
		return mapCursorField(this.cursor, (cursor) =>
			callbackfn(unboxedFlexNode(this.context, cursor, this.anchor), cursor.fieldIndex),
		);
	}

	public override [Symbol.iterator](): IterableIterator<HydratedFlexTreeNode> {
		return iterateCursorField(this.cursor, (cursor) =>
			getOrCreateHydratedFlexTreeNode(this.context, cursor),
		);
	}

	public override getFieldPath(): { parent: AnchorNode | undefined; field: FieldKey } {
		this.ensureValidForAccess();
		const parent =
			this.anchor.parent === undefined
				? undefined
				: (this.context.checkout.forest.anchors.locate(this.anchor.parent) ??
					fail(0xd95 /* Field parent anchor must exist */));
		return { parent, field: this.key };
	}
}

/**
 * Navigation resources owned by an {@link AnchoredField}.
 * Context and parent-destruction cleanup is routed through the field so subclasses also release their state.
 * The field then calls {@link FieldResources.disposeFromOwner} to release this component.
 */
class FieldResources extends AnchoredEntity<FieldAnchor> {
	private readonly offAfterDestroy?: () => void;

	/**
	 * Creates resources owned by a field and registers for its parent's destruction.
	 * @param field - The owning field, whose anchor ownership transfers to this component.
	 * @param cursor - A current cursor on the field. It is forked; ownership stays with the caller.
	 */
	public constructor(
		private readonly field: AnchoredField,
		cursor: ITreeSubscriptionCursor,
	) {
		super(field.context, cursor, field.anchor);
		if (this.anchor.parent !== undefined) {
			const anchorNode =
				this.context.checkout.forest.anchors.locate(this.anchor.parent) ??
				fail("A field's parent anchor must exist");
			this.offAfterDestroy = anchorNode.events.on("afterDestroy", () => {
				this.field[disposeSymbol]();
			});
		}
	}

	public override [disposeSymbol](): void {
		this.field[disposeSymbol]();
	}

	/**
	 * Releases navigation resources without calling back into the owner.
	 * Called once by the owning field's disposal method.
	 */
	public disposeFromOwner(): void {
		super[disposeSymbol]();
	}

	public override ensureValidForAccess(): void {
		super.ensureValidForAccess();
	}

	protected override tryMoveCursorToAnchor(
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.checkout.forest.tryMoveCursorToField(this.anchor, cursor);
	}

	protected override forgetAnchor(): void {
		this.offAfterDestroy?.();
		if (this.anchor.parent !== undefined) {
			this.context.checkout.forest.anchors.forget(this.anchor.parent);
		}
	}
}

/**
 * Minimum observed field length for activating a {@link LazySequence} length cache.
 * @remarks
 * Computing a field's length can require scanning its chunks.
 * For small sequences, avoiding that work may not justify allocating cache state and an event subscription.
 * The threshold limits those costs to larger sequences without adding storage to chunks.
 * Once activated, caching continues until disposal, even if the sequence shrinks.
 * This is a heuristic, not a change to the field's length semantics.
 */
export const sequenceLengthCacheThreshold = 128;

/**
 * State retained from activation of a {@link LazySequence} length cache until the field is disposed.
 * @remarks
 * Allocated only when the field reaches {@link sequenceLengthCacheThreshold}, to avoid cache and subscription overhead for small sequences.
 * Invalidating the cached length does not remove the subscription.
 */
interface SequenceLengthCache {
	/**
	 * The cached field length, or `undefined` if invalidated by a change to the parent's direct children.
	 * The next length read recomputes and stores the value.
	 */
	length: number | undefined;
	/**
	 * Unregisters the parent anchor's `childrenChanging` listener when the field is disposed.
	 */
	readonly unsubscribe: () => void;
}

/**
 * A sequence field with its own cursor and anchor, with lazy length caching for large fields.
 */
export class LazySequence extends AnchoredField implements FlexTreeSequenceField {
	/**
	 * Length-cache state, or `undefined` if caching has not been activated.
	 * @remarks
	 * Each sequence has a property slot, but the cache entry and subscription are allocated only when
	 * the field reaches {@link sequenceLengthCacheThreshold}, since caching short sequences may cost more than recomputing their lengths.
	 * An own property avoids a WeakMap lookup on every length read without adding storage to chunks.
	 * Activated entries and their subscriptions are retained until field disposal, even if the field shrinks.
	 */
	private lengthCache: SequenceLengthCache | undefined;

	public override get length(): number {
		const cached = this.lengthCache;
		if (cached?.length !== undefined) {
			return cached.length;
		}

		const length = super.length;
		// Detached fields have no parent anchor, and their creation/destruction does not
		// consistently emit childrenChanging. Leave these (including the root) uncached.
		if (
			cached === undefined &&
			length >= sequenceLengthCacheThreshold &&
			this.anchor.parent !== undefined
		) {
			const parent = this.context.checkout.forest.anchors.locate(this.anchor.parent);
			assert(
				parent !== undefined,
				0xd7a /* A sequence field must have a live parent anchor */,
			);
			const entry: SequenceLengthCache = {
				length,
				unsubscribe: parent.events.on("childrenChanging", () => {
					// Descendant edits may change chunk layout but cannot change this field's length.
					entry.length = undefined;
				}),
			};
			this.lengthCache = entry;
		} else if (cached !== undefined) {
			cached.length = length;
		}
		return length;
	}

	public override [disposeSymbol](): void {
		this.lengthCache?.unsubscribe();
		this.lengthCache = undefined;
		super[disposeSymbol]();
	}

	public at(index: number): FlexTreeUnknownUnboxed | undefined {
		const finalIndex = indexForAt(index, this.length);

		if (finalIndex === undefined) {
			return undefined;
		}

		return this.atIndex(finalIndex);
	}
	public get asArray(): readonly FlexTreeUnknownUnboxed[] {
		return this.map((x) => x);
	}

	public editor: SequenceFieldEditBuilder<FlexibleFieldContent> = {
		insert: (index, newContent) => {
			this.sequenceEditor().insert(index, cursorForMapTreeField(newContent));
		},
		remove: (index, count) => {
			this.sequenceEditor().remove(index, count);
		},
	};

	/**
	 * Gets a sequence editor at this field's current in-document path.
	 */
	private sequenceEditor(): SequenceFieldEditBuilder<ITreeCursorSynchronous> {
		const fieldPath = this.getFieldPathForEditing();
		return getEditor(this.context).sequenceField(fieldPath);
	}
}

/**
 * A required or identifier field with its own cursor and anchor.
 */
export class LazyValueField extends AnchoredField implements FlexTreeRequiredField {
	public editor: ValueFieldEditBuilder<FlexibleNodeContent> = {
		set: (newContent) => {
			this.valueFieldEditor().set(cursorForMapTreeField([newContent]));
		},
	};

	/**
	 * Gets a single-child editor at this field's current in-document path.
	 */
	private valueFieldEditor(): ValueFieldEditBuilder<ITreeCursorSynchronous> {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = getEditor(this.context).valueField(fieldPath);
		return fieldEditor;
	}

	public get content(): FlexTreeUnknownUnboxed {
		return this.atIndex(0);
	}
}

/**
 * An optional field with its own cursor and anchor.
 */
export class LazyOptionalField extends AnchoredField implements FlexTreeOptionalField {
	public editor: OptionalFieldEditBuilder<ExclusiveMapTree> = {
		set: (newContent, wasEmpty) => {
			this.optionalEditor().set(
				newContent === undefined ? newContent : cursorForMapTreeField([newContent]),
				wasEmpty,
			);
		},
	};

	/**
	 * Gets an optional-field editor at this field's current in-document path.
	 */
	private optionalEditor(): OptionalFieldEditBuilder<ITreeCursorSynchronous> {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = getEditor(this.context).optionalField(fieldPath);
		return fieldEditor;
	}

	public get content(): FlexTreeUnknownUnboxed | undefined {
		return this.length === 0 ? undefined : this.atIndex(0);
	}
}

/**
 * A forbidden field with its own cursor and anchor, including support for detached fields.
 */
export class LazyForbiddenField extends AnchoredField {}

type Builder = new (
	context: Context,
	// Correct use of these builders requires the builder of the matching type to be used.
	schema: FieldKindIdentifier,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
) => AnchoredField;

const builderList: [FieldKindIdentifier, Builder][] = [
	[FieldKinds.forbidden.identifier, LazyForbiddenField],
	[FieldKinds.optional.identifier, LazyOptionalField],
	[FieldKinds.sequence.identifier, LazySequence],
	[FieldKinds.required.identifier, LazyValueField],
	[FieldKinds.identifier.identifier, LazyValueField],
];

const kindToClass: ReadonlyMap<FieldKindIdentifier, Builder> = new Map(builderList);

/**
 * Reads the first child of a field, unboxing leaf nodes.
 * @param context - The context whose forest contains the field.
 * @param cursor - A current cursor positioned on the field in fields mode. Its position and ownership are unchanged.
 * @param fieldAnchor - An anchor for the same field, borrowed without transferring ownership.
 * @returns The first child, with leaf values unboxed, or undefined if the field is empty.
 */
export function unboxedFlexField(
	context: Context,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
): FlexTreeUnknownUnboxed | undefined {
	return cursor.getFieldLength() === 0
		? undefined
		: inCursorNode(cursor, 0, (child) => unboxedFlexNode(context, child, fieldAnchor));
}

/**
 * Returns the flex tree node, or the value if it has one.
 */
export function unboxedFlexNode(
	context: Context,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
): FlexTreeUnknownUnboxed {
	const value = cursor.value;
	if (value !== undefined) {
		return value;
	}

	// Try accessing cached child node via anchors.
	// This avoids O(depth) related costs from getOrCreateHydratedFlexTreeNode in the cached case.
	const anchor = fieldAnchor.parent;
	let child: AnchorNode | undefined;
	if (anchor === undefined) {
		child = context.checkout.forest.anchors.find({
			parent: undefined,
			parentField: fieldAnchor.fieldKey,
			parentIndex: cursor.fieldIndex,
		});
	} else {
		const anchorNode = context.checkout.forest.anchors.locate(anchor);
		assert(anchorNode !== undefined, 0xa4c /* missing anchor */);
		child = anchorNode.childIfAnchored(fieldAnchor.fieldKey, cursor.fieldIndex);
	}

	if (child !== undefined) {
		const cached = child.slots.get(flexTreeSlot);
		if (cached !== undefined) {
			return cached;
		}
	}

	return getOrCreateHydratedFlexTreeNode(context, cursor);
}
