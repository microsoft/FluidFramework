/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	mapCursorField,
	CursorLocationType,
	FieldAnchor,
	inCursorNode,
	FieldUpPath,
	ITreeCursor,
	keyAsDetachedField,
	rootField,
	EmptyKey,
	forEachNode,
} from "../../core";
import { FieldKind } from "../modular-schema";
import { NewFieldContent, normalizeNewFieldContent } from "../contextuallyTyped";
import {
	FieldKindTypes,
	FieldKinds,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
} from "../default-field-kinds";
import { compareSets, disposeSymbol, fail, oneFromSet } from "../../util";
import {
	AllowedTypes,
	FieldSchema,
	TreeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
} from "../typed-schema";
import { TreeStatus, treeStatusFromPath } from "../editable-tree";
import { Context } from "./context";
import {
	FlexibleNodeContent,
	OptionalField,
	Sequence,
	TypedField,
	TypedNodeUnion,
	UnboxField,
	UnboxNode,
	UnboxNodeUnion,
	TreeField,
	TreeNode,
	RequiredField,
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

export function makeField(
	context: Context,
	schema: FieldSchema,
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
		anchorNode.on("afterDelete", () => {
			field[disposeSymbol]();
		});
	}
	return field;
}

/**
 * A Proxy target, which together with a `fieldProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
export abstract class LazyField<TKind extends FieldKindTypes, TTypes extends AllowedTypes>
	extends LazyEntity<FieldSchema<TKind, TTypes>, FieldAnchor>
	implements TreeField
{
	public readonly key: FieldKey;

	public constructor(
		context: Context,
		schema: FieldSchema<TKind, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);
		assert(cursor.mode === CursorLocationType.Fields, "must be in fields mode");
		this.key = cursor.getFieldKey();

		makePropertyNotEnumerable(this, "key");
	}

	public is<TSchema extends FieldSchema>(schema: TSchema): this is TypedField<TSchema> {
		assert(
			this.context.schema.policy.fieldKinds.get(schema.kind.identifier) === schema.kind,
			"Narrowing must be done to a kind that exists in this context",
		);

		if (schema.kind !== this.schema.kind) {
			return false;
		}
		if (schema.types === undefined) {
			return this.schema.types === undefined;
		}
		if (this.schema.types === undefined) {
			return false;
		}
		return compareSets({ a: this.schema.types, b: schema.types });
	}

	public isSameAs(other: TreeField): boolean {
		assert(
			other.context === this.context,
			"Content from different editable trees should not be used together",
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

	public map<U>(
		callbackfn: (value: UnboxNodeUnion<TTypes>, index: number, array: this) => U,
	): U[] {
		return mapCursorField(this[cursorSymbol], (cursor) =>
			callbackfn(unboxedUnion(this.context, this.schema, cursor), cursor.fieldIndex, this),
		);
	}

	public indexOf(searchElement: UnboxNodeUnion<TTypes>, fromIndex = 0): number {
		return (
			forEachNode(this[cursorSymbol], (cursor) => {
				if (cursor.fieldIndex >= fromIndex) {
					const element = unboxedUnion(this.context, this.schema, cursor);
					if (searchElement === element) {
						return cursor.fieldIndex;
					}
				}
			}) ?? -1
		);
	}

	public includes(
		searchElement: UnboxNodeUnion<TTypes>,
		fromIndex?: number | undefined,
	): boolean {
		return this.indexOf(searchElement, fromIndex) !== -1;
	}

	public forEach(
		callbackFn: (element: UnboxNodeUnion<TTypes>, index: number, sequence: this) => void,
	): void {
		forEachNode(this[cursorSymbol], (cursor) => {
			const element = unboxedUnion(this.context, this.schema, cursor);
			callbackFn(element, cursor.fieldIndex, this);
		});
	}

	public find(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): UnboxNodeUnion<TTypes> | undefined;
	public find<T extends UnboxNodeUnion<TTypes>>(
		predicate: (element: UnboxNodeUnion<TTypes>, index: number, sequence: this) => element is T,
	): T | undefined;
	public find<T extends UnboxNodeUnion<TTypes>>(
		predicate: (element: UnboxNodeUnion<TTypes>, index: number, sequence: this) => element is T,
	): T | undefined {
		return forEachNode(this[cursorSymbol], (cursor) => {
			const element = unboxedUnion(this.context, this.schema, cursor);
			if (predicate(element, cursor.fieldIndex, this)) {
				return element;
			}
		});
	}

	public findLast(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): UnboxNodeUnion<TTypes> | undefined;
	public findLast<T extends UnboxNodeUnion<TTypes>>(
		predicate: (element: UnboxNodeUnion<TTypes>, index: number, sequence: this) => element is T,
	): T | undefined;
	public findLast<T extends UnboxNodeUnion<TTypes>>(
		predicate: (element: UnboxNodeUnion<TTypes>, index: number, sequence: this) => element is T,
	): UnboxNodeUnion<TTypes> | T | undefined {
		let lastElement: UnboxNodeUnion<TTypes> | undefined;
		// TODO: Optimize when cursors can iterate backwards
		forEachNode(this[cursorSymbol], (cursor) => {
			const element = unboxedUnion(this.context, this.schema, cursor);
			if (predicate(element, cursor.fieldIndex, this)) {
				lastElement = element;
			}
		});
		return lastElement;
	}

	public findIndex(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): number {
		return (
			forEachNode(this[cursorSymbol], (cursor) => {
				const element = unboxedUnion(this.context, this.schema, cursor);
				if (predicate(element, cursor.fieldIndex, this)) {
					return cursor.fieldIndex;
				}
			}) ?? -1
		);
	}

	public findLastIndex(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): number {
		let lastIndex = -1;
		// TODO: Optimize when cursors can iterate backwards
		forEachNode(this[cursorSymbol], (cursor) => {
			const element = unboxedUnion(this.context, this.schema, cursor);
			if (predicate(element, cursor.fieldIndex, this)) {
				lastIndex = cursor.fieldIndex;
			}
		});
		return lastIndex;
	}

	public reduce(
		callbackfn: (
			previousValue: UnboxNodeUnion<TTypes>,
			currentValue: UnboxNodeUnion<TTypes>,
			currentIndex: number,
			sequence: this,
		) => UnboxNodeUnion<TTypes>,
		initialValue?: UnboxNodeUnion<TTypes> | undefined,
	): UnboxNodeUnion<TTypes>;
	public reduce<U>(
		callbackfn: (
			previousValue: U,
			currentValue: UnboxNodeUnion<TTypes>,
			currentIndex: number,
			sequence: this,
		) => UnboxNodeUnion<TTypes>,
		initialValue: U | undefined,
	): U;
	public reduce<U>(
		callbackfn: (
			previousValue: U,
			currentValue: UnboxNodeUnion<TTypes>,
			currentIndex: number,
			sequence: this,
		) => U,
		initialValue?: U | undefined,
	): UnboxNodeUnion<TTypes> | U {
		if (initialValue !== undefined) {
			let accumulation: U = initialValue;
			forEachNode(this[cursorSymbol], (cursor) => {
				const element = unboxedUnion(this.context, this.schema, cursor);
				accumulation = callbackfn(accumulation, element, cursor.fieldIndex, this);
			});
			return accumulation;
		} else {
			// Given the possible overloads: if initialValue === undefined, then U == UnboxNodeUnion<TTypes> and casts between the two are safe.
			let accumulation: UnboxNodeUnion<TTypes> | undefined;
			forEachNode(this[cursorSymbol], (cursor) => {
				const element = unboxedUnion(this.context, this.schema, cursor);
				accumulation =
					accumulation !== undefined
						? (callbackfn(
								accumulation as U,
								element,
								cursor.fieldIndex,
								this,
						  ) as UnboxNodeUnion<TTypes>)
						: element;
			});
			return accumulation ?? fail("Reduce called on empty sequence with no initial value");
		}
	}

	public filter(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): UnboxNodeUnion<TTypes>[] {
		const filteredElements: UnboxNodeUnion<TTypes>[] = [];
		forEachNode(this[cursorSymbol], (cursor) => {
			const element = unboxedUnion(this.context, this.schema, cursor);
			if (predicate(element, cursor.fieldIndex, this)) {
				filteredElements.push(element);
			}
		});
		return filteredElements;
	}

	public some(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): boolean {
		return (
			forEachNode(this[cursorSymbol], (cursor) => {
				const element = unboxedUnion(this.context, this.schema, cursor);
				if (predicate(element, cursor.fieldIndex, this)) {
					return true;
				}
			}) ?? false
		);
	}

	public every(
		predicate: (value: UnboxNodeUnion<TTypes>, index: number, sequence: this) => boolean,
	): boolean {
		return (
			forEachNode(this[cursorSymbol], (cursor) => {
				const element = unboxedUnion(this.context, this.schema, cursor);
				if (!predicate(element, cursor.fieldIndex, this)) {
					return false;
				}
			}) ?? true
		);
	}

	/**
	 * Calls the provided callback function on each child of this sequence, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts the child, its index, and this field.
	 */
	private mapBoxed<U>(
		callbackfn: (value: TypedNodeUnion<TTypes>, index: number, array: this) => U,
	): U[] {
		return mapCursorField(this[cursorSymbol], (cursor) =>
			callbackfn(
				makeTree(this.context, cursor) as TypedNodeUnion<TTypes>,
				cursor.fieldIndex,
				this,
			),
		);
	}

	public *keys(): IterableIterator<number> {
		const cursor = this[cursorSymbol];
		let index = 0;
		for (let node = cursor.firstNode(); node; node = cursor.nextNode()) {
			yield index++;
		}
	}

	public *values(): IterableIterator<UnboxNodeUnion<TTypes>> {
		const cursor = this[cursorSymbol];
		for (let node = cursor.firstNode(); node; node = cursor.nextNode()) {
			yield unboxedUnion(this.context, this.schema, cursor);
		}
	}

	public *entries(): IterableIterator<[number, UnboxNodeUnion<TTypes>]> {
		const cursor = this[cursorSymbol];
		let index = 0;
		for (let node = cursor.firstNode(); node; node = cursor.nextNode()) {
			yield [index++, unboxedUnion(this.context, this.schema, cursor)];
		}
	}

	public [Symbol.iterator](): IterableIterator<TypedNodeUnion<TTypes>> {
		return this.mapBoxed((x) => x)[Symbol.iterator]();
	}

	public treeStatus(): TreeStatus {
		if (this[isFreedSymbol]()) {
			return TreeStatus.Deleted;
		}
		const fieldAnchor = this[anchorSymbol];
		const parentAnchor = fieldAnchor.parent;
		// If the parentAnchor is undefined it is a detached field.
		if (parentAnchor === undefined) {
			return keyAsDetachedField(fieldAnchor.fieldKey) === rootField
				? TreeStatus.InDocument
				: TreeStatus.Removed;
		}
		const parentAnchorNode = this.context.forest.anchors.locate(parentAnchor);

		// As the "parentAnchor === undefined" case is handled above, parentAnchorNode should exist.
		assert(parentAnchorNode !== undefined, "parentAnchorNode must exist.");
		return treeStatusFromPath(parentAnchorNode);
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
			"Editing only allowed on fields with TreeStatus.InDocument status",
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
		schema: FieldSchema<typeof FieldKinds.sequence, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);

		makePropertyEnumerableOwn(this, "asArray", LazySequence.prototype);
	}

	private sequenceEditor(): SequenceFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.editor.sequenceField(fieldPath);
		return fieldEditor;
	}

	public replaceRange(
		index: number,
		count: number,
		newContent: Iterable<FlexibleNodeContent<TTypes>>,
	): void {
		const fieldEditor = this.sequenceEditor();
		const content = this.normalizeNewContent([...newContent]);

		fieldEditor.delete(index, count);
		fieldEditor.insert(index, content);
	}

	public get asArray(): readonly UnboxNodeUnion<TTypes>[] {
		return this.map((x) => x);
	}
}

export class LazyValueField<TTypes extends AllowedTypes>
	extends LazyField<typeof FieldKinds.value, TTypes>
	implements RequiredField<TTypes>
{
	public constructor(
		context: Context,
		schema: FieldSchema<typeof FieldKinds.value, TTypes>,
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

	public get boxedContent(): TypedNodeUnion<TTypes> {
		return this.boxedAt(0);
	}

	public setContent(newContent: FlexibleNodeContent<TTypes>): void {
		const content = this.normalizeNewContent(newContent);
		const fieldEditor = this.valueFieldEditor();
		assert(content.length === 1, "value field content should normalize to one item");
		fieldEditor.set(content[0]);
	}
}

export class LazyOptionalField<TTypes extends AllowedTypes>
	extends LazyField<typeof FieldKinds.optional, TTypes>
	implements OptionalField<TTypes>
{
	public constructor(
		context: Context,
		schema: FieldSchema<typeof FieldKinds.optional, TTypes>,
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

	public get boxedContent(): TypedNodeUnion<TTypes> | undefined {
		return this.length === 0 ? undefined : this.boxedAt(0);
	}

	public setContent(newContent: FlexibleNodeContent<TTypes> | undefined): void {
		const content = this.normalizeNewContent(newContent);
		const fieldEditor = this.optionalEditor();
		assert(content.length <= 1, "optional field content should normalize at most one item");
		fieldEditor.set(content.length === 0 ? undefined : content[0], this.length === 0);
	}
}

export class LazyForbiddenField<TTypes extends AllowedTypes> extends LazyField<
	typeof FieldKinds.forbidden,
	TTypes
> {}

type Builder = new <TTypes extends AllowedTypes>(
	context: Context,
	schema: FieldSchema<any, TTypes>,
	cursor: ITreeSubscriptionCursor,
	fieldAnchor: FieldAnchor,
) => LazyField<any, TTypes>;

const builderList: [FieldKind, Builder][] = [
	[FieldKinds.forbidden, LazyForbiddenField],
	[FieldKinds.nodeKey, LazyOptionalField], // TODO
	[FieldKinds.optional, LazyOptionalField],
	[FieldKinds.sequence, LazySequence],
	[FieldKinds.value, LazyValueField],
];

const kindToClass: ReadonlyMap<FieldKind, Builder> = new Map(builderList);

/**
 * See {@link UnboxNode} for documentation on what unwrapping this performs.
 */
function unboxedTree<TSchema extends TreeSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
): UnboxNode<TSchema> {
	if (schemaIsLeaf(schema)) {
		return cursor.value as UnboxNode<TSchema>;
	}
	if (schemaIsFieldNode(schema)) {
		cursor.enterField(EmptyKey);
		const primaryField = makeField(
			context,
			schema.structFields.get(EmptyKey) ?? fail("invalid schema"),
			cursor,
		);
		cursor.exitField();
		return primaryField as UnboxNode<TSchema>;
	}

	return makeTree(context, cursor) as UnboxNode<TSchema>;
}

/**
 * See {@link UnboxNodeUnion} for documentation on what unwrapping this performs.
 */
function unboxedUnion<TTypes extends AllowedTypes>(
	context: Context,
	schema: FieldSchema<FieldKindTypes, TTypes>,
	cursor: ITreeSubscriptionCursor,
): UnboxNodeUnion<TTypes> {
	const type = oneFromSet(schema.types);
	if (type !== undefined) {
		return unboxedTree(
			context,
			context.schema.treeSchema.get(type) ?? fail("missing schema"),
			cursor,
		) as UnboxNodeUnion<TTypes>;
	}
	return makeTree(context, cursor) as UnboxNodeUnion<TTypes>;
}

/**
 * @param context - the common context of the field.
 * @param schema - the FieldStoredSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 */
export function unboxedField<TSchema extends FieldSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
): UnboxField<TSchema> {
	const kind = schema.kind;
	if (kind === FieldKinds.value) {
		return inCursorNode(cursor, 0, (innerCursor) =>
			unboxedUnion(context, schema, innerCursor),
		) as UnboxField<TSchema>;
	}
	if (kind === FieldKinds.optional) {
		if (cursor.getFieldLength() === 0) {
			return undefined as UnboxField<TSchema>;
		}
		return inCursorNode(cursor, 0, (innerCursor) =>
			unboxedUnion(context, schema, innerCursor),
		) as UnboxField<TSchema>;
	}

	// TODO: forbidden and nodeKey
	return makeField(context, schema, cursor) as UnboxField<TSchema>;
}
