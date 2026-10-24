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
	inCursorField,
	iterateCursorField,
	mapCursorField,
	rootFieldKey,
} from "../../core/index.js";
import { disposeSymbol } from "../../util/index.js";
import { combineChunks } from "../chunked-forest/index.js";
import {
	FieldKinds,
	MappedEditBuilder,
	type IDefaultEditBuilder,
	type OptionalFieldEditBuilder,
	type SequenceFieldEditBuilder,
	type ValueFieldEditBuilder,
} from "../default-schema/index.js";
import { cursorForMapTreeField, cursorForMapTreeNode } from "../mapTreeCursor.js";
import type { FlexFieldKind } from "../modular-schema/index.js";

import type { Context } from "./context.js";
import {
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeNode,
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
import {
	type LazyMapNode,
	LazyTreeNode,
	getOrCreateHydratedFlexTreeNode,
} from "./lazyNode.js";
import { indexForAt, treeStatusFromAnchorCache } from "./utilities.js";

/**
 * Looks up a field without navigating a cursor.
 * The caller must validate the owning node's lifetime before using the result.
 */
export function getCachedField(node: LazyTreeNode, key: FieldKey): FlexTreeField | undefined {
	return node.fieldCache?.get(key);
}

/**
 * Gets a field wrapper, reusing the owning node's cache when appropriate.
 * @param context - Owns the field's lifetime and supplies its forest and schema policy.
 * @param schema - The field kind for the cursor's current field under the context's stored schema.
 * @param cursor - A cursor in the context's forest, positioned in fields mode.
 * Remains positioned on the same field; ownership stays with the caller.
 * @remarks
 * Fields without a parent node own their navigation resources and are not cached here.
 * Other fields use the parent node's storage policy, creating its wrapper if necessary.
 * Resource-owning field wrappers take ownership of the temporary parent anchor.
 * Cache hits and resource-free map fields release that temporary anchor instead.
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
 * Gets an in-document edit path after validating the field and its owning entity.
 */
function getFieldPathForEditing(
	field: LazyField | MapField,
	isFreed: boolean,
): NormalizedFieldUpPath {
	if (!isFreed) {
		const path = field.getFieldPath();
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

/**
 * Adapts field cursors to the checkout's chunk-based edit builder.
 */
function getEditor(context: Context): IDefaultEditBuilder<ITreeCursorSynchronous> {
	return new MappedEditBuilder(context.checkout.editor, (cursor: ITreeCursorSynchronous) =>
		combineChunks(context.checkout.forest.chunkField(cursor)),
	);
}

/**
 * An optional map field whose lifetime and navigation are provided by its parent.
 * Unlike {@link LazyField}, this wrapper owns no cursor, anchor, or lifetime registration.
 */
export class MapField implements FlexTreeOptionalField {
	public readonly [flexTreeMarker] = FlexTreeEntityKind.Field;
	public readonly schema = FieldKinds.optional.identifier;

	public constructor(
		private readonly parentNode: LazyMapNode,
		public readonly key: FieldKey,
	) {}

	public get context(): Context {
		return this.parentNode.context;
	}

	public get parent(): HydratedFlexTreeNode {
		this.getFieldPath();
		return this.parentNode;
	}

	public is<TKind extends FlexFieldKind>(kind: TKind): this is FlexTreeTypedField<TKind> {
		assert(
			this.context.schemaPolicy.fieldKinds.get(kind.identifier) === kind,
			"Narrowing must use a field kind from this context",
		);
		return this.schema === kind.identifier;
	}

	public get length(): number {
		return inCursorField(this.parentNode.cursor, this.key, (cursor) =>
			cursor.getFieldLength(),
		);
	}

	public get content(): FlexTreeUnknownUnboxed | undefined {
		return inCursorField(this.parentNode.cursor, this.key, (cursor) =>
			unboxedFlexField(this.context, cursor, {
				parent: this.parentNode.anchor,
				fieldKey: this.key,
			}),
		);
	}

	public boxedAt(index: number): HydratedFlexTreeNode | undefined {
		return inCursorField(this.parentNode.cursor, this.key, (cursor) => {
			const finalIndex = indexForAt(index, cursor.getFieldLength());
			return finalIndex === undefined
				? undefined
				: inCursorNode(cursor, finalIndex, (child) =>
						getOrCreateHydratedFlexTreeNode(this.context, child),
					);
		});
	}

	public *[Symbol.iterator](): IterableIterator<HydratedFlexTreeNode> {
		const child = this.boxedAt(0);
		if (child !== undefined) {
			yield child;
		}
	}

	public borrowCursor(): ITreeCursorSynchronous {
		this.getFieldPath();
		const cursor = cursorForMapTreeNode<FlexTreeNode>(this.parentNode);
		cursor.enterField(this.key);
		return cursor;
	}

	public getFieldPath(): { parent: AnchorNode; field: FieldKey } {
		return this.parentNode.getFieldPath(this.key);
	}

	public readonly editor: OptionalFieldEditBuilder<ExclusiveMapTree> = {
		set: (newContent, wasEmpty) => {
			const path = getFieldPathForEditing(this, this.parentNode.isFreed());
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
		return getFieldPathForEditing(this, this.isFreed());
	}
}

export class LazySequence extends LazyField implements FlexTreeSequenceField {
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
		return getEditor(this.context).sequenceField(fieldPath);
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
		const fieldEditor = getEditor(this.context).valueField(fieldPath);
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
		const fieldEditor = getEditor(this.context).optionalField(fieldPath);
		return fieldEditor;
	}

	public get content(): FlexTreeUnknownUnboxed | undefined {
		return unboxedFlexField(this.context, this.cursor, this.anchor);
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
 * Reads the first child of a field, unboxing leaf nodes.
 * The cursor must be in fields mode. Returns undefined if the field is empty.
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
