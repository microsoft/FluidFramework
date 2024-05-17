/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	FieldAnchor,
	FieldKey,
	FieldUpPath,
	ITreeCursorSynchronous,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	inCursorNode,
	isCursor,
	iterateCursorField,
	keyAsDetachedField,
} from "../../core/index.js";
import {
	assertValidIndex,
	assertValidRangeIndices,
	disposeSymbol,
	fail,
} from "../../util/index.js";
// TODO: stop depending on contextuallyTyped
import { applyTypesFromContext, cursorFromContextualData } from "../contextuallyTyped.js";
import {
	FieldKinds,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
} from "../default-schema/index.js";
import { cursorForMapTreeField } from "../mapTreeCursor.js";
import { FlexFieldKind } from "../modular-schema/index.js";
import { FlexAllowedTypes, FlexFieldSchema } from "../typed-schema/index.js";

import { Context } from "./context.js";
import {
	FlexTreeEntityKind,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeTypedField,
	FlexTreeTypedNodeUnion,
	FlexTreeUnboxNodeUnion,
	FlexibleNodeContent,
	FlexibleNodeSubSequence,
	TreeStatus,
	flexTreeMarker,
} from "./flexTreeTypes.js";
import {
	LazyEntity,
	anchorSymbol,
	cursorSymbol,
	forgetAnchorSymbol,
	isFreedSymbol,
	tryMoveCursorToAnchorSymbol,
} from "./lazyEntity.js";
import { makeTree } from "./lazyNode.js";
import { unboxedUnion } from "./unboxed.js";
import { treeStatusFromAnchorCache, treeStatusFromDetachedField } from "./utilities.js";

/**
 * Indexing for {@link LazyField.at} and {@link LazyField.boxedAt} supports the
 * usage of negative indices, which regular indexing using `[` and `]` does not.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at
 * for additional context on the semantics.
 *
 * @returns A positive index that can be used in regular indexing. Returns
 * undefined if that index would be out-of-bounds.
 */
function indexForAt(index: number, length: number): number | undefined {
	let finalIndex = Math.trunc(+index);
	if (isNaN(finalIndex)) {
		finalIndex = 0;
	}
	if (finalIndex < -length || finalIndex >= length) {
		return undefined;
	}
	if (finalIndex < 0) {
		finalIndex = finalIndex + length;
	}
	return finalIndex;
}

export function makeField(
	context: Context,
	schema: FlexFieldSchema,
	cursor: ITreeSubscriptionCursor,
): FlexTreeField {
	const fieldAnchor = cursor.buildFieldAnchor();

	const field = new (kindToClass.get(schema.kind) ?? fail("missing field implementation"))(
		context,
		schema,
		cursor,
		fieldAnchor,
	);
	return field;
}

/**
 * A Proxy target, which together with a `fieldProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
export abstract class LazyField<TKind extends FlexFieldKind, TTypes extends FlexAllowedTypes>
	extends LazyEntity<FlexFieldSchema<TKind, TTypes>, FieldAnchor>
	implements FlexTreeField
{
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
		schema: FlexFieldSchema<TKind, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
		assert(cursor.mode === CursorLocationType.Fields, 0x77b /* must be in fields mode */);
		this.key = cursor.getFieldKey();
		// Fields currently live as long as their parent does.
		// For root fields, this means forever, but other cases can be cleaned up when their parent anchor is deleted.
		if (fieldAnchor.parent !== undefined) {
			const anchorNode =
				context.checkout.forest.anchors.locate(fieldAnchor.parent) ??
				fail("parent anchor node should always exist since field is under a node");
			this.offAfterDestroy = anchorNode.on("afterDestroy", () => {
				this[disposeSymbol]();
			});
		}
	}

	public is<TSchema extends FlexFieldSchema>(
		schema: TSchema,
	): this is FlexTreeTypedField<TSchema> {
		assert(
			this.context.schema.policy.fieldKinds.get(schema.kind.identifier) === schema.kind,
			0x77c /* Narrowing must be done to a kind that exists in this context */,
		);

		return this.schema.equals(schema);
	}

	public isSameAs(other: FlexTreeField): boolean {
		assert(
			other.context === this.context,
			0x77d /* Content from different flex trees should not be used together */,
		);
		return this.key === other.key && this.parent === other.parent;
	}

	public get parent(): FlexTreeNode | undefined {
		if (this[anchorSymbol].parent === undefined) {
			return undefined;
		}

		const cursor = this[cursorSymbol];
		cursor.exitField();
		const output = makeTree(this.context, cursor);
		cursor.enterField(this.key);
		return output;
	}

	protected override [tryMoveCursorToAnchorSymbol](
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.checkout.forest.tryMoveCursorToField(this[anchorSymbol], cursor);
	}

	protected override [forgetAnchorSymbol](): void {
		this.offAfterDestroy?.();
		if (this[anchorSymbol].parent === undefined) return;
		this.context.checkout.forest.anchors.forget(this[anchorSymbol].parent);
	}

	public get length(): number {
		return this[cursorSymbol].getFieldLength();
	}

	public atIndex(index: number): FlexTreeUnboxNodeUnion<TTypes> {
		return inCursorNode(this[cursorSymbol], index, (cursor) =>
			unboxedUnion(this.context, this.schema, cursor),
		);
	}

	public boxedAt(index: number): FlexTreeTypedNodeUnion<TTypes> | undefined {
		const finalIndex = indexForAt(index, this.length);

		if (finalIndex === undefined) {
			return undefined;
		}

		return inCursorNode(this[cursorSymbol], finalIndex, (cursor) =>
			makeTree(this.context, cursor),
		) as unknown as FlexTreeTypedNodeUnion<TTypes>;
	}

	public map<U>(callbackfn: (value: FlexTreeUnboxNodeUnion<TTypes>, index: number) => U): U[] {
		return Array.from(this, callbackfn);
	}

	public mapBoxed<U>(
		callbackfn: (value: FlexTreeTypedNodeUnion<TTypes>, index: number) => U,
	): U[] {
		return Array.from(this.boxedIterator(), callbackfn);
	}

	public boxedIterator(): IterableIterator<FlexTreeTypedNodeUnion<TTypes>> {
		return iterateCursorField(
			this[cursorSymbol],
			(cursor) => makeTree(this.context, cursor) as unknown as FlexTreeTypedNodeUnion<TTypes>,
		);
	}

	public [Symbol.iterator](): IterableIterator<FlexTreeUnboxNodeUnion<TTypes>> {
		return iterateCursorField(this[cursorSymbol], (cursor) =>
			unboxedUnion(this.context, this.schema, cursor),
		);
	}

	public treeStatus(): TreeStatus {
		if (this[isFreedSymbol]()) {
			return TreeStatus.Deleted;
		}
		const fieldAnchor = this[anchorSymbol];
		const parentAnchor = fieldAnchor.parent;
		// If the parentAnchor is undefined it is a detached field.
		if (parentAnchor === undefined) {
			return treeStatusFromDetachedField(keyAsDetachedField(fieldAnchor.fieldKey));
		}
		const parentAnchorNode = this.context.checkout.forest.anchors.locate(parentAnchor);

		// As the "parentAnchor === undefined" case is handled above, parentAnchorNode should exist.
		assert(parentAnchorNode !== undefined, 0x77e /* parentAnchorNode must exist. */);
		return treeStatusFromAnchorCache(parentAnchorNode);
	}

	public getFieldPath(): FieldUpPath {
		return this[cursorSymbol].getFieldPath();
	}

	/**
	 * Returns the path to this field to use for editing. Throws iff this path is not {@link TreeStatus#InDocument}.
	 * This path is not valid to hold onto across edits: this must be recalled for each edit.
	 */
	public getFieldPathForEditing(): FieldUpPath {
		assert(
			this.treeStatus() === TreeStatus.InDocument,
			0x77f /* Editing only allowed on fields with TreeStatus.InDocument status */,
		);
		return this.getFieldPath();
	}
}

export class LazySequence<TTypes extends FlexAllowedTypes>
	extends LazyField<typeof FieldKinds.sequence, TTypes>
	implements FlexTreeSequenceField<TTypes>
{
	public constructor(
		context: Context,
		schema: FlexFieldSchema<typeof FieldKinds.sequence, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
	}

	public at(index: number): FlexTreeUnboxNodeUnion<TTypes> | undefined {
		const finalIndex = indexForAt(index, this.length);

		if (finalIndex === undefined) {
			return undefined;
		}

		return inCursorNode(this[cursorSymbol], finalIndex, (cursor) =>
			unboxedUnion(this.context, this.schema, cursor),
		);
	}
	public get asArray(): readonly FlexTreeUnboxNodeUnion<TTypes>[] {
		return this.map((x) => x);
	}

	public sequenceEditor(): SequenceFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.checkout.editor.sequenceField(fieldPath);
		return fieldEditor;
	}

	public insertAt(index: number, value: FlexibleNodeSubSequence<TTypes>): void {
		assertValidIndex(index, this, true);
		const content: ITreeCursorSynchronous = isCursor(value)
			? prepareFieldCursorForInsert(value)
			: cursorForMapTreeField(
					Array.from(value, (item) =>
						applyTypesFromContext(this.context, this.schema.allowedTypeSet, item),
					),
			  );

		const fieldEditor = this.sequenceEditor();
		fieldEditor.insert(index, content);
	}

	public insertAtStart(value: FlexibleNodeSubSequence<TTypes>): void {
		this.insertAt(0, value);
	}

	public insertAtEnd(value: FlexibleNodeSubSequence<TTypes>): void {
		this.insertAt(this.length, value);
	}

	public removeAt(index: number): void {
		const fieldEditor = this.sequenceEditor();
		fieldEditor.remove(index, 1);
	}

	public moveToStart(sourceIndex: number): void;
	public moveToStart(sourceIndex: number, source: FlexTreeSequenceField<FlexAllowedTypes>): void;
	public moveToStart(
		sourceIndex: number,
		source?: FlexTreeSequenceField<FlexAllowedTypes>,
	): void {
		this._moveRangeToIndex(0, sourceIndex, sourceIndex + 1, source);
	}
	public moveToEnd(sourceIndex: number): void;
	public moveToEnd(sourceIndex: number, source: FlexTreeSequenceField<FlexAllowedTypes>): void;
	public moveToEnd(sourceIndex: number, source?: FlexTreeSequenceField<FlexAllowedTypes>): void {
		this._moveRangeToIndex(this.length, sourceIndex, sourceIndex + 1, source);
	}
	public moveToIndex(index: number, sourceIndex: number): void;
	public moveToIndex(
		index: number,
		sourceIndex: number,
		source: FlexTreeSequenceField<FlexAllowedTypes>,
	): void;
	public moveToIndex(
		index: number,
		sourceIndex: number,
		source?: FlexTreeSequenceField<FlexAllowedTypes>,
	): void {
		this._moveRangeToIndex(index, sourceIndex, sourceIndex + 1, source);
	}

	public moveRangeToStart(sourceStart: number, sourceEnd: number): void;
	public moveRangeToStart(
		sourceStart: number,
		sourceEnd: number,
		source: FlexTreeSequenceField<FlexAllowedTypes>,
	): void;
	public moveRangeToStart(
		sourceStart: number,
		sourceEnd: number,
		source?: FlexTreeSequenceField<FlexAllowedTypes>,
	): void {
		this._moveRangeToIndex(0, sourceStart, sourceEnd, source);
	}

	public moveRangeToEnd(sourceStart: number, sourceEnd: number): void;
	public moveRangeToEnd(
		sourceStart: number,
		sourceEnd: number,
		source: FlexTreeSequenceField<FlexAllowedTypes>,
	): void;
	public moveRangeToEnd(
		sourceStart: number,
		sourceEnd: number,
		source?: FlexTreeSequenceField<FlexAllowedTypes>,
	): void {
		this._moveRangeToIndex(this.length, sourceStart, sourceEnd, source);
	}

	public moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;
	public moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: FlexTreeSequenceField<FlexAllowedTypes>,
	): void;
	public moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: FlexTreeSequenceField<FlexAllowedTypes>,
	): void {
		this._moveRangeToIndex(index, sourceStart, sourceEnd, source);
	}

	private _moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: FlexTreeSequenceField<FlexAllowedTypes>,
	): void {
		const sourceField = source !== undefined ? (this.isSameAs(source) ? this : source) : this;

		// TODO: determine support for move across different sequence types
		assert(
			sourceField instanceof LazySequence,
			0x7b1 /* Unsupported sequence implementation. */,
		);
		assertValidRangeIndices(sourceStart, sourceEnd, sourceField);
		if (this.schema.types !== undefined && sourceField !== this) {
			for (let i = sourceStart; i < sourceEnd; i++) {
				const sourceNode =
					sourceField.boxedAt(sourceStart) ?? fail("impossible out of bounds index");
				if (!this.schema.types.has(sourceNode.schema.name)) {
					throw new Error("Type in source sequence is not allowed in destination.");
				}
			}
		}
		const movedCount = sourceEnd - sourceStart;
		assertValidIndex(index, this, true);
		const sourceFieldPath = sourceField.getFieldPath();
		const destinationFieldPath = this.getFieldPath();
		this.context.checkout.editor.move(
			sourceFieldPath,
			sourceStart,
			movedCount,
			destinationFieldPath,
			index,
		);
	}
}

export class ReadonlyLazyValueField<TTypes extends FlexAllowedTypes>
	extends LazyField<typeof FieldKinds.required, TTypes>
	implements FlexTreeRequiredField<TTypes>
{
	public constructor(
		context: Context,
		schema: FlexFieldSchema<typeof FieldKinds.required, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
	}

	public get content(): FlexTreeUnboxNodeUnion<TTypes> {
		return this.atIndex(0);
	}

	public set content(newContent: FlexibleNodeContent<TTypes>) {
		fail("cannot set content in readonly field");
	}

	public get boxedContent(): FlexTreeTypedNodeUnion<TTypes> {
		return this.boxedAt(0) ?? fail("value node must have 1 item");
	}
}

export class LazyValueField<TTypes extends FlexAllowedTypes>
	extends ReadonlyLazyValueField<TTypes>
	implements FlexTreeRequiredField<TTypes>
{
	public constructor(
		context: Context,
		schema: FlexFieldSchema<typeof FieldKinds.required, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
	}

	private valueFieldEditor(): ValueFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.checkout.editor.valueField(fieldPath);
		return fieldEditor;
	}

	public override get content(): FlexTreeUnboxNodeUnion<TTypes> {
		return this.atIndex(0);
	}

	public override set content(newContent: FlexibleNodeContent<TTypes>) {
		const content: ITreeCursorSynchronous[] = isCursor(newContent)
			? prepareNodeCursorForInsert(newContent)
			: [cursorFromContextualData(this.context, this.schema.allowedTypeSet, newContent)];
		const fieldEditor = this.valueFieldEditor();
		assert(content.length === 1, 0x780 /* value field content should normalize to one item */);
		fieldEditor.set(content[0]);
	}

	public override get boxedContent(): FlexTreeTypedNodeUnion<TTypes> {
		return this.boxedAt(0) ?? fail("value node must have 1 item");
	}
}

export class LazyIdentifierField<TTypes extends FlexAllowedTypes>
	extends ReadonlyLazyValueField<TTypes>
	implements FlexTreeRequiredField<TTypes>
{
	public constructor(
		context: Context,
		schema: FlexFieldSchema<typeof FieldKinds.required, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
	}
}

export class LazyOptionalField<TTypes extends FlexAllowedTypes>
	extends LazyField<typeof FieldKinds.optional, TTypes>
	implements FlexTreeOptionalField<TTypes>
{
	public constructor(
		context: Context,
		schema: FlexFieldSchema<typeof FieldKinds.optional, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
	}

	private optionalEditor(): OptionalFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.checkout.editor.optionalField(fieldPath);
		return fieldEditor;
	}

	public get content(): FlexTreeUnboxNodeUnion<TTypes> | undefined {
		return this.length === 0 ? undefined : this.atIndex(0);
	}

	public set content(newContent: FlexibleNodeContent<TTypes> | undefined) {
		const content: ITreeCursorSynchronous[] =
			newContent === undefined
				? []
				: isCursor(newContent)
				? prepareNodeCursorForInsert(newContent)
				: [cursorFromContextualData(this.context, this.schema.allowedTypeSet, newContent)];
		const fieldEditor = this.optionalEditor();
		assert(
			content.length <= 1,
			0x781 /* optional field content should normalize at most one item */,
		);
		fieldEditor.set(content.length === 0 ? undefined : content[0], this.length === 0);
	}

	public get boxedContent(): FlexTreeTypedNodeUnion<TTypes> | undefined {
		return this.length === 0 ? undefined : this.boxedAt(0);
	}
}

export class LazyForbiddenField<TTypes extends FlexAllowedTypes> extends LazyField<
	typeof FieldKinds.forbidden,
	TTypes
> {}

type Builder = new <TTypes extends FlexAllowedTypes>(
	context: Context,
	// TODO: use something other than `any`
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	schema: FlexFieldSchema<any, TTypes>,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
	// TODO: use something other than `any`
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => LazyField<any, TTypes>;

const builderList: [FlexFieldKind, Builder][] = [
	[FieldKinds.forbidden, LazyForbiddenField],
	[FieldKinds.optional, LazyOptionalField],
	[FieldKinds.sequence, LazySequence],
	[FieldKinds.required, LazyValueField],
	[FieldKinds.identifier, LazyIdentifierField],
];

const kindToClass: ReadonlyMap<FlexFieldKind, Builder> = new Map(builderList);

/**
 * Prepare a fields cursor (holding a sequence of nodes) for inserting.
 */
function prepareFieldCursorForInsert(cursor: ITreeCursorSynchronous): ITreeCursorSynchronous {
	// TODO: optionally validate content against schema.

	assert(cursor.mode === CursorLocationType.Fields, 0x8cb /* should be in fields mode */);
	return cursor;
}

/**
 * Prepare a node cursor (holding a single node) for inserting.
 */
function prepareNodeCursorForInsert(cursor: ITreeCursorSynchronous): ITreeCursorSynchronous[] {
	// TODO: optionally validate content against schema.

	assert(cursor.mode === CursorLocationType.Nodes, 0x805 /* should be in nodes mode */);
	return [cursor];
}
