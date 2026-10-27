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
} from "../../core/index.js";
import { disposeSymbol, getOrCreate } from "../../util/index.js";
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
import { LazyEntity } from "./lazyEntity.js";
import { type LazyTreeNode, getOrCreateHydratedFlexTreeNode } from "./lazyNode.js";
import { indexForAt, treeStatusFromAnchorCache } from "./utilities.js";

/**
 * Reuses field wrappers by parent node and field key.
 * @remarks
 * Each field under a node owns a cursor and is strongly referenced by its context's `withAnchors` set and its parent's `afterDestroy` listener.
 * Preparing for an edit clears the cursor, but does not dispose the wrapper or release its parent anchor and listener.
 * Without reuse, repeated boxing of the same field would accumulate wrappers, even across edits.
 * This cache limits that accumulation to one wrapper per field key on each cached parent.
 * Reuse is safe because these field wrappers remain alive until their parent is destroyed or their context is cleared.
 *
 * This does not bound retention by the current document size for map nodes:
 * public map `get`, `delete`, and `set` operations box fields even for missing keys.
 * When an entry is removed, its field wrapper remains cached and registered with the context and parent.
 * An empty map can therefore retain arbitrarily many wrappers for distinct keys accessed during its lifetime.
 * In contrast, `has` uses `tryGetField`, which does not box missing fields.
 * The outer WeakMap does not weaken references from the inner Map, context, or parent listener.
 *
 * Fixing this retention requires avoiding unnecessary boxing and addressing field disposal, not just evicting cache entries:
 * eviction alone leaves the context and listener references intact and permits duplicate wrappers on subsequent accesses.
 * Fields are disposed when their parent is destroyed or their context is cleared, not when they become empty.
 *
 * Fields without a parent node or a cached parent wrapper are not cached here.
 * `makeField` builds a field anchor even on cache hits; `getCachedField` avoids that work when the parent wrapper is already available.
 * Reuse also reduces repeated field-access costs by avoiding wrapper allocation, cursor creation, and listener registration.
 */
const fieldCache: WeakMap<LazyTreeNode, Map<FieldKey, FlexTreeField>> = new WeakMap();

/**
 * Looks up a field without navigating a cursor.
 * The caller must validate the owning node's lifetime before using the result.
 */
export function getCachedField(node: LazyTreeNode, key: FieldKey): FlexTreeField | undefined {
	return fieldCache.get(node)?.get(key);
}

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
	const cacheKey = anchorNode.slots.get(flexTreeSlot);

	// If there is no flex tree parent node, skip caching: this is not expected to be a hot path, but should probably be fixed at some point.
	if (cacheKey === undefined) {
		return makeFlexTreeField();
	}

	const innerCache = getOrCreate(
		fieldCache,
		cacheKey,
		() => new Map<FieldKey, FlexTreeField>(),
	);
	const result = getOrCreate(innerCache, fieldAnchor.fieldKey, makeFlexTreeField);
	if (!usedAnchor) {
		// The anchor must be disposed to avoid leaking. In the case of a cache hit,
		// we are not transferring ownership to a new FlexTreeField, so it must be disposed of here to avoid the leak.
		context.checkout.forest.anchors.forget(fieldAnchor.parent);
	}
	return result;
}

/**
 * Base type for fields implementing {@link FlexTreeField} using cursors.
 */
export abstract class LazyField extends LazyEntity<FieldAnchor> implements FlexTreeField {
	public get [flexTreeMarker](): FlexTreeEntityKind.Field {
		return FlexTreeEntityKind.Field;
	}
	public readonly key: FieldKey;

	/**
	 * If this field ends its lifetime before the Anchor does, this needs to be invoked to avoid a double free
	 * if/when the Anchor is destroyed.
	 */
	private readonly offAfterDestroy?: () => void;

	public constructor(
		context: Context,
		public readonly schema: FieldKindIdentifier,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, cursor, fieldAnchor);
		assert(cursor.mode === CursorLocationType.Fields, 0x77b /* must be in fields mode */);
		this.key = cursor.getFieldKey();
		// Fields currently live as long as their parent does.
		// For root fields, this means forever, but other cases can be cleaned up when their parent anchor is deleted.
		if (fieldAnchor.parent !== undefined) {
			const anchorNode =
				context.checkout.forest.anchors.locate(fieldAnchor.parent) ??
				fail(0xb11 /* parent anchor node should always exist since field is under a node */);
			this.offAfterDestroy = anchorNode.events.on("afterDestroy", () => {
				this[disposeSymbol]();
			});
		}
	}

	public is<TKind2 extends FlexFieldKind>(kind: TKind2): this is FlexTreeTypedField<TKind2> {
		assert(
			this.context.schemaPolicy.fieldKinds.get(kind.identifier) === kind,
			0xa26 /* Narrowing must be done to a kind that exists in this context */,
		);

		return this.schema === kind.identifier;
	}

	public get parent(): HydratedFlexTreeNode | undefined {
		if (this.anchor.parent === undefined) {
			return undefined;
		}

		this.ensureValidForAccess();
		const parent = this.context.checkout.forest.anchors.locate(this.anchor.parent);
		const cached = parent?.slots.get(flexTreeSlot);
		if (cached !== undefined) {
			assert(cached.context === this.context, "Parent context must match field context");
			return cached;
		}

		const cursor = this.cursor;
		cursor.exitField();
		const output = getOrCreateHydratedFlexTreeNode(this.context, cursor);
		cursor.enterField(this.key);
		return output;
	}

	protected override tryMoveCursorToAnchor(
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.checkout.forest.tryMoveCursorToField(this.anchor, cursor);
	}

	protected override forgetAnchor(): void {
		this.offAfterDestroy?.();
		if (this.anchor.parent === undefined) return;
		this.context.checkout.forest.anchors.forget(this.anchor.parent);
	}

	public get length(): number {
		return this.cursor.getFieldLength();
	}

	public atIndex(index: number): FlexTreeUnknownUnboxed {
		return inCursorNode(this.cursor, index, (cursor) =>
			unboxedFlexNode(this.context, cursor, this.anchor),
		);
	}

	public boxedAt(index: number): HydratedFlexTreeNode | undefined {
		const finalIndex = indexForAt(index, this.length);

		if (finalIndex === undefined) {
			return undefined;
		}

		return inCursorNode(this.cursor, finalIndex, (cursor) =>
			getOrCreateHydratedFlexTreeNode(this.context, cursor),
		);
	}

	public map<U>(callbackfn: (value: FlexTreeUnknownUnboxed, index: number) => U): U[] {
		return mapCursorField(this.cursor, (cursor) =>
			callbackfn(unboxedFlexNode(this.context, cursor, this.anchor), cursor.fieldIndex),
		);
	}

	public [Symbol.iterator](): IterableIterator<HydratedFlexTreeNode> {
		return iterateCursorField(this.cursor, (cursor) =>
			getOrCreateHydratedFlexTreeNode(this.context, cursor),
		);
	}

	public getFieldPath(): { parent: AnchorNode | undefined; field: FieldKey } {
		this.ensureValidForAccess();
		const parent =
			this.anchor.parent === undefined
				? undefined
				: (this.context.checkout.forest.anchors.locate(this.anchor.parent) ??
					fail("Field parent anchor must exist"));
		return { parent, field: this.key };
	}

	/**
	 * Returns the path to this field to use for editing. Throws iff this path is not {@link TreeStatus#InDocument}.
	 * This path is not valid to hold onto across edits: this must be recalled for each edit.
	 */
	public getFieldPathForEditing(): NormalizedFieldUpPath {
		if (!this.isFreed()) {
			const path = this.getFieldPath();
			if (
				path.parent === undefined
					? // Only allow editing if we are the root document field...
						path.field === rootFieldKey
					: // ...or are under a node in the document.
						treeStatusFromAnchorCache(path.parent) === TreeStatus.InDocument
			) {
				return path;
			}
		}

		throw new UsageError("Editing only allowed on fields with TreeStatus.InDocument status");
	}

	protected getEditor(): IDefaultEditBuilder<ITreeCursorSynchronous> {
		return new MappedEditBuilder(
			this.context.checkout.editor,
			(cursor: ITreeCursorSynchronous) =>
				combineChunks(this.context.checkout.forest.chunkField(cursor)),
		);
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

export class LazySequence extends LazyField implements FlexTreeSequenceField {
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

	protected override forgetAnchor(): void {
		this.lengthCache?.unsubscribe();
		this.lengthCache = undefined;
		super.forgetAnchor();
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

	private sequenceEditor(): SequenceFieldEditBuilder<ITreeCursorSynchronous> {
		const fieldPath = this.getFieldPathForEditing();
		return this.getEditor().sequenceField(fieldPath);
	}
}

export class LazyValueField extends LazyField implements FlexTreeRequiredField {
	public editor: ValueFieldEditBuilder<FlexibleNodeContent> = {
		set: (newContent) => {
			this.valueFieldEditor().set(cursorForMapTreeField([newContent]));
		},
	};

	private valueFieldEditor(): ValueFieldEditBuilder<ITreeCursorSynchronous> {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.getEditor().valueField(fieldPath);
		return fieldEditor;
	}

	public get content(): FlexTreeUnknownUnboxed {
		return this.atIndex(0);
	}
}

export class LazyOptionalField extends LazyField implements FlexTreeOptionalField {
	public editor: OptionalFieldEditBuilder<ExclusiveMapTree> = {
		set: (newContent, wasEmpty) => {
			this.optionalEditor().set(
				newContent === undefined ? newContent : cursorForMapTreeField([newContent]),
				wasEmpty,
			);
		},
	};

	private optionalEditor(): OptionalFieldEditBuilder<ITreeCursorSynchronous> {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.getEditor().optionalField(fieldPath);
		return fieldEditor;
	}

	public get content(): FlexTreeUnknownUnboxed | undefined {
		return this.length === 0 ? undefined : this.atIndex(0);
	}
}

export class LazyForbiddenField extends LazyField {}

type Builder = new (
	context: Context,
	// Correct use of these builders requires the builder of the matching type to be used.
	schema: FieldKindIdentifier,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
) => LazyField;

const builderList: [FieldKindIdentifier, Builder][] = [
	[FieldKinds.forbidden.identifier, LazyForbiddenField],
	[FieldKinds.optional.identifier, LazyOptionalField],
	[FieldKinds.sequence.identifier, LazySequence],
	[FieldKinds.required.identifier, LazyValueField],
	[FieldKinds.identifier.identifier, LazyValueField],
];

const kindToClass: ReadonlyMap<FieldKindIdentifier, Builder> = new Map(builderList);

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
