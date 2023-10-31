/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { StableId } from "@fluidframework/runtime-definitions";
import {
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	CursorLocationType,
	FieldAnchor,
	inCursorNode,
	FieldUpPath,
	ITreeCursor,
	keyAsDetachedField,
	iterateCursorField,
} from "../../core";
import { FieldKind } from "../modular-schema";
import { NewFieldContent, normalizeNewFieldContent } from "../contextuallyTyped";
import {
	FieldKinds,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
} from "../default-field-kinds";
import { assertValidIndex, assertValidRangeIndices, brand, disposeSymbol, fail } from "../../util";
import { AllowedTypes, TreeFieldSchema } from "../typed-schema";
import { LocalNodeKey, StableNodeKey, nodeKeyTreeIdentifier } from "../node-key";
import { Context } from "./context";
import {
	FlexibleNodeContent,
	OptionalField,
	Sequence,
	TypedField,
	TypedNodeUnion,
	UnboxNodeUnion,
	TreeField,
	TreeNode,
	RequiredField,
	boxedIterator,
	TreeStatus,
	NodeKeyField,
} from "./editableTreeTypes";
import { makeTree } from "./lazyTree";
import {
	LazyEntity,
	anchorSymbol,
	cursorSymbol,
	forgetAnchorSymbol,
	isFreedSymbol,
	makePropertyEnumerableOwn,
	makePropertyNotEnumerable,
	tryMoveCursorToAnchorSymbol,
} from "./lazyEntity";
import { unboxedUnion } from "./unboxed";
import { treeStatusFromAnchorCache, treeStatusFromDetachedField } from "./utilities";

export function makeField(
	context: Context,
	schema: TreeFieldSchema,
	cursor: ITreeSubscriptionCursor,
): TreeField {
	const fieldAnchor = cursor.buildFieldAnchor();

	const field = new (kindToClass.get(schema.kind) ?? fail("missing field implementation"))(
		context,
		schema,
		cursor,
		fieldAnchor,
	);

	// Fields currently live as long as their parent does.
	// For root fields, this means forever, but other cases can be cleaned up when their parent anchor is deleted.
	if (fieldAnchor.parent !== undefined) {
		const anchorNode =
			context.forest.anchors.locate(fieldAnchor.parent) ??
			fail("parent anchor node should always exist since field is under a node");
		anchorNode.on("afterDestroy", () => {
			field[disposeSymbol]();
		});
	}
	return field;
}

/**
 * A Proxy target, which together with a `fieldProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
export abstract class LazyField<TKind extends FieldKind, TTypes extends AllowedTypes>
	extends LazyEntity<TreeFieldSchema<TKind, TTypes>, FieldAnchor>
	implements TreeField
{
	public readonly key: FieldKey;

	public constructor(
		context: Context,
		schema: TreeFieldSchema<TKind, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
		assert(cursor.mode === CursorLocationType.Fields, 0x77b /* must be in fields mode */);
		this.key = cursor.getFieldKey();

		makePropertyNotEnumerable(this, "key");
	}

	public is<TSchema extends TreeFieldSchema>(schema: TSchema): this is TypedField<TSchema> {
		assert(
			this.context.schema.policy.fieldKinds.get(schema.kind.identifier) === schema.kind,
			0x77c /* Narrowing must be done to a kind that exists in this context */,
		);

		return this.schema.equals(schema);
	}

	public isSameAs(other: TreeField): boolean {
		assert(
			other.context === this.context,
			0x77d /* Content from different editable trees should not be used together */,
		);
		return this.key === other.key && this.parent === other.parent;
	}

	public normalizeNewContent(content: NewFieldContent): readonly ITreeCursor[] {
		return normalizeNewFieldContent(this.context, this.schema, content);
	}

	public get parent(): TreeNode | undefined {
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
		anchor: FieldAnchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToField(anchor, cursor);
	}

	protected override [forgetAnchorSymbol](anchor: FieldAnchor): void {
		if (anchor.parent === undefined) return;
		this.context.forest.anchors.forget(anchor.parent);
	}

	public get length(): number {
		return this[cursorSymbol].getFieldLength();
	}

	public at(index: number): UnboxNodeUnion<TTypes> {
		return inCursorNode(this[cursorSymbol], index, (cursor) =>
			unboxedUnion(this.context, this.schema, cursor),
		);
	}

	public boxedAt(index: number): TypedNodeUnion<TTypes> {
		return inCursorNode(this[cursorSymbol], index, (cursor) =>
			makeTree(this.context, cursor),
		) as TypedNodeUnion<TTypes>;
	}

	public map<U>(callbackfn: (value: UnboxNodeUnion<TTypes>, index: number) => U): U[] {
		return Array.from(this, callbackfn);
	}

	public mapBoxed<U>(callbackfn: (value: TypedNodeUnion<TTypes>, index: number) => U): U[] {
		return Array.from(this[boxedIterator](), callbackfn);
	}

	public [boxedIterator](): IterableIterator<TypedNodeUnion<TTypes>> {
		return iterateCursorField(
			this[cursorSymbol],
			(cursor) => makeTree(this.context, cursor) as TypedNodeUnion<TTypes>,
		);
	}

	public [Symbol.iterator](): IterableIterator<UnboxNodeUnion<TTypes>> {
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
		const parentAnchorNode = this.context.forest.anchors.locate(parentAnchor);

		// As the "parentAnchor === undefined" case is handled above, parentAnchorNode should exist.
		assert(parentAnchorNode !== undefined, 0x77e /* parentAnchorNode must exist. */);
		return treeStatusFromAnchorCache(this.context.forest.anchors, parentAnchorNode);
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

export class LazySequence<TTypes extends AllowedTypes>
	extends LazyField<typeof FieldKinds.sequence, TTypes>
	implements Sequence<TTypes>
{
	public constructor(
		context: Context,
		schema: TreeFieldSchema<typeof FieldKinds.sequence, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);

		makePropertyEnumerableOwn(this, "asArray", LazySequence.prototype);
	}

	public get asArray(): readonly UnboxNodeUnion<TTypes>[] {
		return this.map((x) => x);
	}

	private sequenceEditor(): SequenceFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.editor.sequenceField(fieldPath);
		return fieldEditor;
	}

	public insertAt(index: number, value: Iterable<FlexibleNodeContent<TTypes>>): void {
		const fieldEditor = this.sequenceEditor();
		const content = this.normalizeNewContent(Array.isArray(value) ? value : Array.from(value));
		assertValidIndex(index, this, true);
		fieldEditor.insert(index, content);
	}

	public insertAtStart(value: Iterable<FlexibleNodeContent<TTypes>>): void {
		this.insertAt(0, value);
	}

	public insertAtEnd(value: Iterable<FlexibleNodeContent<TTypes>>): void {
		this.insertAt(this.length, value);
	}

	public removeAt(index: number): void {
		const fieldEditor = this.sequenceEditor();
		fieldEditor.delete(index, 1);
	}

	public removeRange(start?: number, end?: number): void {
		const fieldEditor = this.sequenceEditor();
		const { length } = this;
		const removeStart = start ?? 0;
		const removeEnd = Math.min(length, end ?? length);
		assertValidRangeIndices(removeStart, removeEnd, this);
		fieldEditor.delete(removeStart, removeEnd - removeStart);
	}

	public moveToStart(sourceIndex: number): void;
	public moveToStart(sourceIndex: number, source: Sequence<AllowedTypes>): void;
	public moveToStart(sourceIndex: number, source?: Sequence<AllowedTypes>): void {
		this._moveRangeToIndex(0, sourceIndex, sourceIndex + 1, source);
	}
	public moveToEnd(sourceIndex: number): void;
	public moveToEnd(sourceIndex: number, source: Sequence<AllowedTypes>): void;
	public moveToEnd(sourceIndex: number, source?: Sequence<AllowedTypes>): void {
		this._moveRangeToIndex(this.length, sourceIndex, sourceIndex + 1, source);
	}
	public moveToIndex(index: number, sourceIndex: number): void;
	public moveToIndex(index: number, sourceIndex: number, source: Sequence<AllowedTypes>): void;
	public moveToIndex(index: number, sourceIndex: number, source?: Sequence<AllowedTypes>): void {
		this._moveRangeToIndex(index, sourceIndex, sourceIndex + 1, source);
	}

	public moveRangeToStart(sourceStart: number, sourceEnd: number): void;
	public moveRangeToStart(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<AllowedTypes>,
	): void;
	public moveRangeToStart(
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<AllowedTypes>,
	): void {
		this._moveRangeToIndex(0, sourceStart, sourceEnd, source);
	}

	public moveRangeToEnd(sourceStart: number, sourceEnd: number): void;
	public moveRangeToEnd(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<AllowedTypes>,
	): void;
	public moveRangeToEnd(
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<AllowedTypes>,
	): void {
		this._moveRangeToIndex(this.length, sourceStart, sourceEnd, source);
	}

	public moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;
	public moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<AllowedTypes>,
	): void;
	public moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<AllowedTypes>,
	): void {
		this._moveRangeToIndex(index, sourceStart, sourceEnd, source);
	}

	private _moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<AllowedTypes>,
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
				const sourceNode = sourceField.boxedAt(sourceStart);
				if (!this.schema.types.has(sourceNode.schema.name)) {
					throw new Error("Type in source sequence is not allowed in destination.");
				}
			}
		}
		const movedCount = sourceEnd - sourceStart;
		let destinationIndex = index;
		if (sourceField === this) {
			if (destinationIndex > sourceStart) {
				destinationIndex =
					destinationIndex < sourceEnd
						? sourceStart // destination overlaps with source range -> slide to left
						: (destinationIndex -= movedCount); // destination after source range -> subtract moved count
			}
		}
		assertValidIndex(destinationIndex, this, true);
		const sourceFieldPath = sourceField.getFieldPath();
		const destinationFieldPath = this.getFieldPath();
		this.context.editor.move(
			sourceFieldPath,
			sourceStart,
			movedCount,
			destinationFieldPath,
			destinationIndex,
		);
	}
}

export class LazyValueField<TTypes extends AllowedTypes>
	extends LazyField<typeof FieldKinds.required, TTypes>
	implements RequiredField<TTypes>
{
	public constructor(
		context: Context,
		schema: TreeFieldSchema<typeof FieldKinds.required, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);

		makePropertyEnumerableOwn(this, "content", LazyValueField.prototype);
	}

	private valueFieldEditor(): ValueFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.editor.valueField(fieldPath);
		return fieldEditor;
	}

	public get content(): UnboxNodeUnion<TTypes> {
		return this.at(0);
	}

	public set content(newContent: FlexibleNodeContent<TTypes>) {
		const content = this.normalizeNewContent(newContent);
		const fieldEditor = this.valueFieldEditor();
		assert(content.length === 1, 0x780 /* value field content should normalize to one item */);
		fieldEditor.set(content[0]);
	}

	public get boxedContent(): TypedNodeUnion<TTypes> {
		return this.boxedAt(0);
	}
}

export class LazyOptionalField<TTypes extends AllowedTypes>
	extends LazyField<typeof FieldKinds.optional, TTypes>
	implements OptionalField<TTypes>
{
	public constructor(
		context: Context,
		schema: TreeFieldSchema<typeof FieldKinds.optional, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);

		makePropertyEnumerableOwn(this, "content", LazyOptionalField.prototype);
	}

	private optionalEditor(): OptionalFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.editor.optionalField(fieldPath);
		return fieldEditor;
	}

	public get content(): UnboxNodeUnion<TTypes> | undefined {
		return this.length === 0 ? undefined : this.at(0);
	}

	public set content(newContent: FlexibleNodeContent<TTypes> | undefined) {
		const content = this.normalizeNewContent(newContent);
		const fieldEditor = this.optionalEditor();
		assert(
			content.length <= 1,
			0x781 /* optional field content should normalize at most one item */,
		);
		fieldEditor.set(content.length === 0 ? undefined : content[0], this.length === 0);
	}

	public get boxedContent(): TypedNodeUnion<TTypes> | undefined {
		return this.length === 0 ? undefined : this.boxedAt(0);
	}
}

export class LazyNodeKeyField<TTypes extends AllowedTypes>
	extends LazyField<typeof FieldKinds.nodeKey, TTypes>
	implements NodeKeyField
{
	public constructor(
		context: Context,
		schema: TreeFieldSchema<typeof FieldKinds.nodeKey, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);

		makePropertyEnumerableOwn(this, "stableNodeKey", LazyNodeKeyField.prototype);
	}

	public get localNodeKey(): LocalNodeKey {
		// TODO: Optimize this to be a fast path that gets a LocalNodeKey directly from the
		// forest rather than getting the StableNodeKey and the compressing it.
		return this.context.nodeKeys.localize(this.stableNodeKey);
	}

	public get stableNodeKey(): StableNodeKey {
		const cursor = this[cursorSymbol];
		cursor.enterNode(0);
		assert(cursor.type === nodeKeyTreeIdentifier, 0x7b2 /* invalid node key type */);
		const stableKey = cursor.value;
		assert(typeof stableKey === "string", 0x7b3 /* invalid node key type */);
		cursor.exitNode();
		return brand(stableKey as StableId);
	}
}

export class LazyForbiddenField<TTypes extends AllowedTypes> extends LazyField<
	typeof FieldKinds.forbidden,
	TTypes
> {}

type Builder = new <TTypes extends AllowedTypes>(
	context: Context,
	schema: TreeFieldSchema<any, TTypes>,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
) => LazyField<any, TTypes>;

const builderList: [FieldKind, Builder][] = [
	[FieldKinds.forbidden, LazyForbiddenField],
	[FieldKinds.nodeKey, LazyNodeKeyField],
	[FieldKinds.optional, LazyOptionalField],
	[FieldKinds.sequence, LazySequence],
	[FieldKinds.required, LazyValueField],
];

const kindToClass: ReadonlyMap<FieldKind, Builder> = new Map(builderList);
