/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
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
	rootField,
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
import {
	assertValidIndex,
	assertValidRangeIndices,
	compareSets,
	disposeSymbol,
	fail,
} from "../../util";
import { AllowedTypes, FieldSchema } from "../typed-schema";
import { TreeStatus, treeStatusFromPath } from "../editable-tree";
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
	CheckTypesOverlap,
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
export abstract class LazyField<TKind extends FieldKind, TTypes extends AllowedTypes>
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
		assert(cursor.mode === CursorLocationType.Fields, 0x77b /* must be in fields mode */);
		this.key = cursor.getFieldKey();

		makePropertyNotEnumerable(this, "key");
	}

	public is<TSchema extends FieldSchema>(schema: TSchema): this is TypedField<TSchema> {
		assert(
			this.context.schema.policy.fieldKinds.get(schema.kind.identifier) === schema.kind,
			0x77c /* Narrowing must be done to a kind that exists in this context */,
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
			return keyAsDetachedField(fieldAnchor.fieldKey) === rootField
				? TreeStatus.InDocument
				: TreeStatus.Removed;
		}
		const parentAnchorNode = this.context.forest.anchors.locate(parentAnchor);

		// As the "parentAnchor === undefined" case is handled above, parentAnchorNode should exist.
		assert(parentAnchorNode !== undefined, 0x77e /* parentAnchorNode must exist. */);
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
		schema: FieldSchema<typeof FieldKinds.sequence, TTypes>,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, schema, cursor, fieldAnchor);

		return new Proxy(this, {
			get: (target, key) => {
				if (typeof key === "string") {
					const asNumber = Number(key);

					if (Number.isInteger(asNumber)) {
						return 0 <= asNumber && asNumber < target.length
							? target.at(asNumber)
							: undefined;
					}
				}

				return Reflect.get(target, key);
			},
			set: (target, key, newValue) => {
				if (typeof key === "string") {
					const asNumber = Number(key);

					if (Number.isInteger(asNumber)) {
						// For MVP, we disallow set.
						return false;
					}
				}

				return Reflect.set(target, key, newValue);
			},
			has: (target, key) => {
				if (typeof key === "string") {
					const asNumber = Number(key);
					if (Number.isInteger(asNumber)) {
						return 0 <= asNumber && asNumber < target.length;
					}
				}

				return Reflect.has(target, key);
			},
			ownKeys: (target) => {
				return Array.from({ length: target.length }, (_, index) => `${index}`);
			},
			getOwnPropertyDescriptor: (target, key) => {
				if (typeof key === "string") {
					const asNumber = Number(key);
					if (Number.isInteger(asNumber)) {
						if (0 <= asNumber && asNumber < target.length) {
							return {
								value: target.at(asNumber),
								// For MVP, disallow set.
								writable: false,
								enumerable: true,
								configurable: true,
							};
						}
					} else if (key === "length") {
						return {
							value: target.length,
							// For MVP, length is readonly.
							writable: false,
							enumerable: false,
							configurable: false,
						};
					}
				}
				return undefined;
			},
		});
	}

	private sequenceEditor(): SequenceFieldEditBuilder {
		const fieldPath = this.getFieldPathForEditing();
		const fieldEditor = this.context.editor.sequenceField(fieldPath);
		return fieldEditor;
	}

	public insertAt(index: number, value: readonly FlexibleNodeContent<TTypes>[]): void {
		const fieldEditor = this.sequenceEditor();
		const content = this.normalizeNewContent(Array.isArray(value) ? value : [value]);
		assertValidIndex(index, this, true);
		fieldEditor.insert(index, content);
	}

	public insertAtStart(value: readonly FlexibleNodeContent<TTypes>[]): void {
		this.insertAt(0, value);
	}

	public insertAtEnd(value: readonly FlexibleNodeContent<TTypes>[]): void {
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

	public moveToStart(sourceStart: number, sourceEnd: number): void;
	public moveToStart<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;
	public moveToStart<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void {
		this._moveToIndex(0, sourceStart, sourceEnd, source);
	}

	public moveToEnd(sourceStart: number, sourceEnd: number): void;
	public moveToEnd<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;
	public moveToEnd<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void {
		this._moveToIndex(this.length, sourceStart, sourceEnd, source);
	}

	public moveToIndex(index: number, sourceStart: number, sourceEnd: number): void;
	public moveToIndex<TTypesSource extends AllowedTypes>(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;
	public moveToIndex<TTypesSource extends AllowedTypes>(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void {
		this._moveToIndex(index, sourceStart, sourceEnd, source);
	}

	private _moveToIndex<TTypesSource extends AllowedTypes>(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source?: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void {
		const sourceField = source !== undefined ? (this.isSameAs(source) ? this : source) : this;
		assertValidRangeIndices(sourceStart, sourceEnd, sourceField);
		if (this.schema.types !== undefined && sourceField !== this) {
			for (let i = sourceStart; i < sourceEnd; i++) {
				const sourceNode = sourceField.at(sourceStart);
				if (!this.schema.types.has(sourceNode.schema.name)) {
					throw new Error("Type in source sequence is not allowed in destination.");
				}
			}
		}
		const count = sourceEnd - sourceStart;
		let destinationIndex = index;
		if (sourceField === this) {
			destinationIndex -= count;
		}
		assertValidIndex(destinationIndex, this, true);
		// TODO: determine support for move across different sequence types
		assert(source instanceof LazySequence, "Unsupported sequence implementation.");
		const sourceFieldPath = (sourceField as LazySequence<TTypesSource>).getFieldPath();
		const destinationFieldPath = this.getFieldPath();
		this.context.editor.move(
			sourceFieldPath,
			sourceStart,
			count,
			destinationFieldPath,
			destinationIndex,
		);
	}

	public override toString(): string {
		return Array.prototype.toString.call(this);
	}

	public override toLocaleString(): string {
		return Array.prototype.toLocaleString.call(this);
	}

	public concat(...items: ConcatArray<UnboxNodeUnion<TTypes>>[]): UnboxNodeUnion<TTypes>[];
	public concat(
		...items: (UnboxNodeUnion<TTypes> | ConcatArray<UnboxNodeUnion<TTypes>>)[]
	): UnboxNodeUnion<TTypes>[] {
		return Array.prototype.concat.apply(this, items) as UnboxNodeUnion<TTypes>[];
	}

	public join(separator?: string): string {
		return Array.prototype.join.call(this, separator);
	}

	public slice(start?: number, end?: number): UnboxNodeUnion<TTypes>[] {
		return Array.prototype.slice.call(this, start, end) as UnboxNodeUnion<TTypes>[];
	}

	public indexOf(searchElement: UnboxNodeUnion<TTypes>, fromIndex?: number): number {
		return Array.prototype.indexOf.call(this, searchElement, fromIndex);
	}

	public lastIndexOf(searchElement: UnboxNodeUnion<TTypes>, fromIndex?: number): number {
		// eslint-disable-next-line prefer-rest-params -- arguments.length distinguishes overloads
		return Array.prototype.lastIndexOf.apply(this, arguments as any);
	}

	public every<S extends UnboxNodeUnion<TTypes>>(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => value is S,
		thisArg?: any,
	): this is readonly S[];

	public every(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => unknown,
		thisArg?: any,
	): boolean {
		return Array.prototype.every.call(this, predicate, thisArg);
	}

	public some(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => unknown,
		thisArg?: any,
	): boolean {
		return Array.prototype.some.call(this, predicate, thisArg);
	}

	public forEach(
		callbackfn: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => void,
		thisArg?: any,
	): void {
		return Array.prototype.forEach.call(this, callbackfn, thisArg);
	}

	public override map<U>(
		callbackfn: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => U,
		thisArg?: any,
	): U[] {
		return Array.prototype.map.call(this, callbackfn, thisArg) as U[];
	}

	public filter<S extends UnboxNodeUnion<TTypes>>(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => value is S,
		thisArg?: any,
	): UnboxNodeUnion<TTypes>[];

	public filter(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => unknown,
		thisArg?: any,
	): UnboxNodeUnion<TTypes>[] {
		return Array.prototype.filter.call(this, predicate, thisArg) as UnboxNodeUnion<TTypes>[];
	}

	public find<S extends UnboxNodeUnion<TTypes>>(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			obj: readonly UnboxNodeUnion<TTypes>[],
		) => value is S,
		thisArg?: any,
	): S | undefined;

	public find(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			obj: readonly UnboxNodeUnion<TTypes>[],
		) => unknown,
		thisArg?: any,
	): UnboxNodeUnion<TTypes> | undefined {
		return Array.prototype.find.call(this, predicate, thisArg) as
			| UnboxNodeUnion<TTypes>
			| undefined;
	}

	public findIndex(
		predicate: (
			value: UnboxNodeUnion<TTypes>,
			index: number,
			obj: readonly UnboxNodeUnion<TTypes>[],
		) => unknown,
		thisArg?: any,
	): number {
		return Array.prototype.findIndex.call(this, predicate, thisArg);
	}

	public reduce<U>(
		callbackfn: (
			previousValue: U,
			currentValue: UnboxNodeUnion<TTypes>,
			currentIndex: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => U,
		initialValue?: U,
	): U {
		// eslint-disable-next-line prefer-rest-params -- arguments.length distinguishes overloads
		return Array.prototype.reduce.apply(this, arguments as any) as U;
	}

	public reduceRight<U>(
		callbackfn: (
			previousValue: U,
			currentValue: UnboxNodeUnion<TTypes>,
			currentIndex: number,
			array: readonly UnboxNodeUnion<TTypes>[],
		) => U,
		initialValue?: U,
	): U {
		// eslint-disable-next-line prefer-rest-params -- arguments.length distinguishes overloads
		return Array.prototype.reduceRight.apply(this, arguments as any) as U;
	}

	/**
	 * Returns an iterable of key, value pairs for every entry in the array
	 */
	public entries(): IterableIterator<[number, UnboxNodeUnion<TTypes>]> {
		return Array.prototype.entries.call(this) as IterableIterator<
			[number, UnboxNodeUnion<TTypes>]
		>;
	}

	public keys(): IterableIterator<number> {
		return Array.prototype.keys.call(this);
	}

	public values(): IterableIterator<UnboxNodeUnion<TTypes>> {
		return Array.prototype.values.call(this) as IterableIterator<UnboxNodeUnion<TTypes>>;
	}

	public includes(searchElement: UnboxNodeUnion<TTypes>, fromIndex?: number): boolean {
		return Array.prototype.includes.call(this, searchElement, fromIndex);
	}

	public flatMap<U, This = undefined>(
		callback: (
			this: This,
			value: UnboxNodeUnion<TTypes>,
			index: number,
			array: UnboxNodeUnion<TTypes>[],
		) => U | readonly U[],
		thisArg?: This,
	): U[] {
		return Array.prototype.flatMap.call(this, callback as any, thisArg) as U[];
	}

	public flat<A, D extends number = 1>(this: A, depth?: D): FlatArray<A, D>[] {
		return Array.prototype.flat.call(this, depth) as FlatArray<A, D>[];
	}

	public get [Symbol.unscopables](): {
		[K in keyof (readonly any[])]?: boolean;
	} {
		return Array.prototype[Symbol.unscopables];
	}

	readonly [n: number]: UnboxNodeUnion<TTypes>;
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
		assert(content.length === 1, 0x780 /* value field content should normalize to one item */);
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
		assert(
			content.length <= 1,
			0x781 /* optional field content should normalize at most one item */,
		);
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
