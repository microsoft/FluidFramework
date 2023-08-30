/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	Anchor,
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	FieldStoredSchema,
	TreeStoredSchema,
	ValueSchema,
	mapCursorField,
	CursorLocationType,
	FieldAnchor,
	inCursorNode,
	FieldUpPath,
	ITreeCursor,
	keyAsDetachedField,
	rootField,
} from "../../core";
import { FieldKind, Multiplicity } from "../modular-schema";
import {
	getFieldKind,
	getPrimaryField,
	isPrimitiveValue,
	ContextuallyTypedNodeData,
	arrayLikeMarkerSymbol,
	cursorFromContextualData,
	NewFieldContent,
	normalizeNewFieldContent,
} from "../contextuallyTyped";
import {
	FieldKinds,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
} from "../default-field-kinds";
import { assertValidIndex, fail, assertNonNegativeSafeInteger } from "../../util";
import {
	AdaptingProxyHandler,
	adaptWithProxy,
	isPrimitive,
	keyIsValidIndex,
	getOwnArrayKeys,
	treeStatusFromPath,
} from "./utilities";
import { ProxyContext } from "./editableTreeContext";
import {
	EditableField,
	EditableTree,
	TreeStatus,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	proxyTargetSymbol,
} from "./editableTreeTypes";
import { makeTree } from "./editableTree";
import { ProxyTarget } from "./ProxyTarget";

export function makeField(
	context: ProxyContext,
	fieldSchema: FieldStoredSchema,
	cursor: ITreeSubscriptionCursor,
): EditableField {
	const fieldAnchor = cursor.buildFieldAnchor();

	const targetSequence = new FieldProxyTarget(context, fieldSchema, cursor, fieldAnchor);
	const output = adaptWithProxy(targetSequence, fieldProxyHandler);
	// Fields currently live as long as their parent does.
	// For root fields, this means forever, but other cases can be cleaned up when their parent anchor is deleted.
	if (fieldAnchor.parent !== undefined) {
		const anchorNode =
			context.forest.anchors.locate(fieldAnchor.parent) ??
			fail("parent anchor node should always exist since field is under a node");
		anchorNode.on("afterDelete", () => {
			targetSequence.free();
		});
	}
	return output;
}

function isFieldProxyTarget(target: ProxyTarget<Anchor | FieldAnchor>): target is FieldProxyTarget {
	return target instanceof FieldProxyTarget;
}

/**
 * @returns the key, if any, of the primary array field.
 */
function getPrimaryArrayKey(
	type: TreeStoredSchema,
): { key: FieldKey; schema: FieldStoredSchema } | undefined {
	const primary = getPrimaryField(type);
	if (primary === undefined) {
		return undefined;
	}
	const kind = getFieldKind(primary.schema);
	if (kind.multiplicity === Multiplicity.Sequence) {
		// TODO: this could have issues if there are non-primary keys
		// that can collide with the array APIs (length or integers).
		return primary;
	}
	return undefined;
}

/**
 * A Proxy target, which together with a `fieldProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
export class FieldProxyTarget extends ProxyTarget<FieldAnchor> implements EditableField {
	public readonly fieldKey: FieldKey;
	public readonly [arrayLikeMarkerSymbol]: true;
	public readonly kind: FieldKind;

	public constructor(
		context: ProxyContext,
		// TODO: use view schema typed in editableTree
		public readonly fieldSchema: FieldStoredSchema,
		cursor: ITreeSubscriptionCursor,
		fieldAnchor: FieldAnchor,
	) {
		super(context, cursor, fieldAnchor);
		assert(cursor.mode === CursorLocationType.Fields, 0x453 /* must be in fields mode */);
		this.fieldKey = cursor.getFieldKey();
		this[arrayLikeMarkerSymbol] = true;
		this.kind = getFieldKind(this.fieldSchema);
	}

	/**
	 * Check if this field is the same as a different field.
	 * This is defined to mean that both are in the same editable tree, and are the same field on the same node.
	 * This is more than just a reference comparison because unlike EditableTree nodes, fields are not cached on anchors and can be duplicated.
	 */
	private isSameAs(other: FieldProxyTarget): boolean {
		assert(
			other.context === this.context,
			0x6b6 /* Content from different editable trees should not be used together */,
		);
		return this.fieldKey === other.fieldKey && this.parent === other.parent;
	}

	public normalizeNewContent(content: NewFieldContent): readonly ITreeCursor[] {
		return normalizeNewFieldContent(this.context, this.fieldSchema, content);
	}

	public get [proxyTargetSymbol](): FieldProxyTarget {
		return this;
	}

	public get parent(): EditableTree | undefined {
		if (this.getAnchor().parent === undefined) {
			return undefined;
		}

		const cursor = this.cursor;
		cursor.exitField();
		const output = makeTree(this.context, cursor);
		cursor.enterField(this.fieldKey);
		return output;
	}

	protected tryMoveCursorToAnchor(
		anchor: FieldAnchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToField(anchor, cursor);
	}

	protected forgetAnchor(anchor: FieldAnchor): void {
		if (anchor.parent === undefined) return;
		this.context.forest.anchors.forget(anchor.parent);
	}

	[index: number]: UnwrappedEditableTree;

	public get length(): number {
		return this.cursor.getFieldLength();
	}

	/**
	 * Returns a node (unwrapped by default, see {@link UnwrappedEditableTree}) by its index.
	 */
	public unwrappedTree(index: number): UnwrappedEditableTree {
		return inCursorNode(this.cursor, index, (cursor) => unwrappedTree(this.context, cursor));
	}

	/**
	 * Gets a node by its index without unwrapping.
	 */
	public getNode(index: number): EditableTree {
		assert(
			keyIsValidIndex(index, this.length),
			0x454 /* A child node must exist at index to get it without unwrapping. */,
		);
		return inCursorNode(this.cursor, index, (cursor) => makeTree(this.context, cursor));
	}

	/**
	 * Gets array of unwrapped nodes.
	 */
	private asArray(): UnwrappedEditableTree[] {
		return mapCursorField(this.cursor, (cursor) => unwrappedTree(this.context, cursor));
	}

	public [Symbol.iterator](): IterableIterator<UnwrappedEditableTree> {
		return this.asArray().values();
	}

	/**
	 * Asserts this field is a sequence, and returns an editor for it.
	 */
	private sequenceEditor(): SequenceFieldEditBuilder {
		assert(
			this.kind === FieldKinds.sequence,
			0x6b9 /* Field kind must be a sequence to edit as a sequence. */,
		);
		const fieldPath = this.cursor.getFieldPath();
		const fieldEditor = this.context.editor.sequenceField(fieldPath);
		return fieldEditor;
	}

	/**
	 * Asserts this field is a sequence, and returns an editor for it.
	 */
	private optionalEditor(): OptionalFieldEditBuilder {
		assert(
			this.kind === FieldKinds.optional,
			0x6ba /* Field kind must be a optional to edit as optional. */,
		);
		const fieldPath = this.cursor.getFieldPath();
		const fieldEditor = this.context.editor.optionalField(fieldPath);
		return fieldEditor;
	}

	/**
	 * Asserts this field is a sequence, and returns an editor for it.
	 */
	private valueFieldEditor(): ValueFieldEditBuilder {
		assert(
			this.kind === FieldKinds.value,
			0x6bb /* Field kind must be a value to edit as a value. */,
		);
		const fieldPath = this.cursor.getFieldPath();
		const fieldEditor = this.context.editor.valueField(fieldPath);
		return fieldEditor;
	}

	public get content(): EditableTree | undefined | EditableField {
		switch (this.kind.multiplicity) {
			case Multiplicity.Optional: {
				if (this.length === 0) {
					return undefined;
				}
				return this.getNode(0);
			}
			case Multiplicity.Value: {
				return this.getNode(0);
			}
			case Multiplicity.Forbidden: {
				return undefined;
			}
			case Multiplicity.Sequence: {
				return this;
			}
			default:
				unreachableCase(this.kind.multiplicity);
		}
	}

	public setContent(newContent: NewFieldContent): void {
		const content = this.normalizeNewContent(newContent);

		switch (this.kind) {
			case FieldKinds.optional: {
				const fieldEditor = this.optionalEditor();
				assert(
					content.length <= 1,
					0x6bc /* optional field content should normalize at most one item */,
				);
				fieldEditor.set(content.length === 0 ? undefined : content[0], this.length === 0);
				break;
			}
			case FieldKinds.value: {
				const fieldEditor = this.valueFieldEditor();
				assert(
					content.length === 1,
					0x6bd /* value field content should normalize to one item */,
				);
				fieldEditor.set(content[0]);
				break;
			}
			case FieldKinds.sequence: {
				const fieldEditor = this.sequenceEditor();
				// TODO: this does not have the atomicity or merge semantics that are likely desired.
				// It should probably either be last write wins OR conflict if concurrently edited.
				// Current behavior results in concurrent sets concatenating.
				fieldEditor.delete(0, this.length);
				fieldEditor.insert(0, content);
				break;
			}
			case FieldKinds.nodeKey: {
				fail("Cannot set node key field: node keys are immutable.");
			}
			default:
				fail(`Cannot set content of fields of "${this.kind.identifier}" kind.`);
		}
	}

	public remove(): void {
		switch (this.kind.multiplicity) {
			case Multiplicity.Optional: {
				const fieldEditor = this.optionalEditor();
				fieldEditor.set(undefined, false);
				break;
			}
			case Multiplicity.Sequence: {
				const fieldEditor = this.sequenceEditor();
				fieldEditor.delete(0, this.length);
				break;
			}
			default:
				fail(`Cannot delete fields of "${this.kind.identifier}" kind.`);
		}
	}

	public insertNodes(index: number, newContent: NewFieldContent): void {
		const fieldEditor = this.sequenceEditor();
		const content = this.normalizeNewContent(newContent);
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length === 0 && (!Array.isArray(content) || content.length <= 1),
				0x455 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			keyIsValidIndex(index, this.length + 1),
			0x456 /* Index must be less than or equal to length. */,
		);
		fieldEditor.insert(index, content);
	}

	public moveNodes(
		sourceIndex: number,
		count: number,
		destinationIndex: number,
		destinationField?: EditableField,
	): void {
		const sourceFieldPath = this.cursor.getFieldPath();

		const destination =
			destinationField === undefined
				? this
				: (destinationField?.[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>);

		assert(
			isFieldProxyTarget(destination),
			0x684 /* destination must be a field proxy target */,
		);

		assert(this.kind === FieldKinds.sequence, 0x6be /* Move source must be a sequence. */);
		assert(
			destination.kind === FieldKinds.sequence,
			0x6bf /* Move destination must be a sequence. */,
		);

		assertNonNegativeSafeInteger(count);
		// This permits a move of 0 nodes starting at this.length, which does seem like it should be allowed.
		assertValidIndex(sourceIndex + count, this, true);

		let destinationLength = destination.length;
		if (this.isSameAs(destination)) {
			destinationLength -= count;
		}
		assertValidIndex(destinationIndex, { length: destinationLength }, true);

		const destinationFieldPath = destination.cursor.getFieldPath();

		this.context.editor.move(
			sourceFieldPath,
			sourceIndex,
			count,
			destinationFieldPath,
			destinationIndex,
		);
	}

	public treeStatus(): TreeStatus {
		if (this.isFreed()) {
			return TreeStatus.Deleted;
		}
		const fieldAnchor = this.getAnchor();
		const parentAnchor = fieldAnchor.parent;
		// If the parentAnchor is undefined it is a detached field.
		if (parentAnchor === undefined) {
			return keyAsDetachedField(fieldAnchor.fieldKey) === rootField
				? TreeStatus.InDocument
				: TreeStatus.Removed;
		}
		const parentAnchorNode = this.context.forest.anchors.locate(parentAnchor);

		// As the "parentAnchor === undefined" case is handled above, parentAnchorNode should exist.
		assert(parentAnchorNode !== undefined, 0x748 /* parentAnchorNode must exist. */);
		return treeStatusFromPath(parentAnchorNode);
	}

	public getfieldPath(): FieldUpPath {
		return this.cursor.getFieldPath();
	}

	public removeNodes(index: number, count?: number): void {
		const fieldEditor = this.sequenceEditor();
		assert(
			this.length === 0 || keyIsValidIndex(index, this.length),
			0x457 /* Index must be less than length. */,
		);
		if (count !== undefined) assert(count >= 0, 0x458 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const adjustedCount = count === undefined || count > maxCount ? maxCount : count;

		fieldEditor.delete(index, adjustedCount);
	}

	public replaceNodes(index: number, newContent: NewFieldContent, count?: number): void {
		const fieldEditor = this.sequenceEditor();
		const content = this.normalizeNewContent(newContent);
		assert(
			(this.length === 0 && index === 0) || keyIsValidIndex(index, this.length),
			0x4d1 /* Index must be less than length or, if the field is empty, be 0. */,
		);
		if (count !== undefined) assert(count >= 0, 0x4d2 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const adjustedCount = count === undefined || count > maxCount ? maxCount : count;

		fieldEditor.delete(index, adjustedCount);
		if (content.length > 0) {
			fieldEditor.insert(index, content);
		}
	}
}

const editableFieldPropertySetWithoutLength = new Set<string>([
	"fieldKey",
	"fieldSchema",
	"primaryType",
	"parent",
	"context",
	"content",
]);
/**
 * The set of `EditableField` properties exposed by `fieldProxyHandler`.
 * Any other properties are considered to be non-existing.
 */
const editableFieldPropertySet = new Set<string>([
	"length",
	...editableFieldPropertySetWithoutLength,
]);

/**
 * Returns a Proxy handler, which together with a {@link FieldProxyTarget} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
const fieldProxyHandler: AdaptingProxyHandler<FieldProxyTarget, EditableField> = {
	get: (target: FieldProxyTarget, key: string | symbol, receiver: object): unknown => {
		if (typeof key === "string") {
			if (editableFieldPropertySet.has(key)) {
				return Reflect.get(target, key);
			}
			// This maps the methods of the `EditableField` to their implementation in the `FieldProxyTarget`.
			// Expected are only the methods declared in the `EditableField` interface,
			// as only those are visible for the users of the public API.
			// Such implicit delegation is chosen for a future array implementation in case it will be needed.
			const reflected = Reflect.get(target, key);
			if (typeof reflected === "function") {
				return function (...args: unknown[]): unknown {
					return Reflect.apply(reflected, target, args);
				};
			}
			if (keyIsValidIndex(key, target.length)) {
				return target.unwrappedTree(Number(key));
			}
			return undefined;
		}
		switch (key) {
			case proxyTargetSymbol:
				return target;
			case Symbol.iterator:
				return target[Symbol.iterator].bind(target);
			case arrayLikeMarkerSymbol:
				return true;
			default:
		}
		return undefined;
	},
	set: (target: FieldProxyTarget, key: string, value: unknown, receiver: unknown): boolean => {
		switch (key) {
			case "content": {
				target.setContent(value as NewFieldContent);
				break;
			}
			default: {
				assert(
					keyIsValidIndex(key, target.length + 1),
					0x6c0 /* cannot assign to unexpected member of field. */,
				);

				const cursor = cursorFromContextualData(
					target.context,
					target.fieldSchema.types,
					value as ContextuallyTypedNodeData,
				);
				const index = Number(key);

				if (target.kind.multiplicity === Multiplicity.Sequence) {
					if (index < target.length) {
						target.replaceNodes(index, [cursor], 1);
					} else {
						target.insertNodes(index, [cursor]);
					}
				} else {
					assert(
						index === 0,
						0x6c1 /* Assignments to non-sequence field content by index must use index 0. */,
					);
					target.setContent(cursor);
				}
			}
		}

		return true;
	},
	deleteProperty: (target: FieldProxyTarget, key: string): boolean => {
		throw new Error("Not supported. Use `deleteNodes()` instead");
	},
	// Include documented symbols and all non-empty fields.
	has: (target: FieldProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "symbol") {
			switch (key) {
				case Symbol.iterator:
				case proxyTargetSymbol:
				case arrayLikeMarkerSymbol:
					return true;
				default:
			}
		} else {
			if (keyIsValidIndex(key, target.length) || editableFieldPropertySet.has(key)) {
				return true;
			}
		}
		return false;
	},
	ownKeys: (target: FieldProxyTarget): ArrayLike<keyof EditableField> => {
		// This includes 'length' property.
		const keys: string[] = getOwnArrayKeys(target.length);
		keys.push(...editableFieldPropertySetWithoutLength);
		return keys as ArrayLike<keyof EditableField>;
	},
	getOwnPropertyDescriptor: (
		target: FieldProxyTarget,
		key: string | symbol,
	): PropertyDescriptor | undefined => {
		// We generally don't want to allow users of the proxy to reconfigure all the properties,
		// but it is a TypeError to return non-configurable for properties that do not exist on target,
		// so they must return true.
		if (typeof key === "symbol") {
			switch (key) {
				case proxyTargetSymbol:
					return {
						configurable: true,
						enumerable: false,
						value: target,
						writable: false,
					};
				case Symbol.iterator:
					return {
						configurable: true,
						enumerable: false,
						value: target[Symbol.iterator].bind(target),
						writable: false,
					};
				default:
			}
		} else {
			if (editableFieldPropertySet.has(key)) {
				return {
					configurable: true,
					enumerable: false,
					value: Reflect.get(target, key),
					writable: false,
				};
			} else if (keyIsValidIndex(key, target.length)) {
				return {
					configurable: true,
					enumerable: true,
					value: target.unwrappedTree(Number(key)),
					writable: true,
				};
			}
		}
		return undefined;
	},
};

/**
 * See {@link UnwrappedEditableTree} for documentation on what unwrapping this performs.
 */
function unwrappedTree(
	context: ProxyContext,
	cursor: ITreeSubscriptionCursor,
): UnwrappedEditableTree {
	const nodeTypeName = cursor.type;
	const nodeType =
		context.schema.treeSchema.get(nodeTypeName) ??
		fail("requested type does not exist in schema");
	// Unwrap primitives or nodes having a primary field. Sequences unwrap nodes on their own.
	if (isPrimitive(nodeType)) {
		const nodeValue = cursor.value;
		if (isPrimitiveValue(nodeValue)) {
			return nodeValue;
		}
		assert(
			nodeType.leafValue === ValueSchema.Serializable,
			0x3c7 /* `undefined` values not allowed for primitive fields */,
		);
	}

	const primary = getPrimaryArrayKey(nodeType);
	if (primary !== undefined) {
		cursor.enterField(primary.key);
		const primaryField = makeField(context, primary.schema, cursor);
		cursor.exitField();
		return primaryField;
	}
	return makeTree(context, cursor);
}

/**
 * @param context - the common context of the field.
 * @param fieldSchema - the FieldStoredSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 */
export function unwrappedField(
	context: ProxyContext,
	fieldSchema: FieldStoredSchema,
	cursor: ITreeSubscriptionCursor,
): UnwrappedEditableField {
	const fieldKind = getFieldKind(fieldSchema);
	if (fieldKind.multiplicity === Multiplicity.Sequence) {
		return makeField(context, fieldSchema, cursor);
	}
	const length = cursor.getFieldLength();
	assert(length <= 1, 0x3c8 /* invalid non sequence */);
	if (length === 1) {
		return inCursorNode(cursor, 0, (innerCursor) => unwrappedTree(context, innerCursor));
	}
	assert(
		fieldKind.multiplicity === Multiplicity.Optional ||
			fieldKind.multiplicity === Multiplicity.Forbidden,
		0x59a /* invalid empty field */,
	);
	return undefined;
}

/**
 * Checks the type of an UnwrappedEditableField.
 * @alpha
 */
export function isEditableField(field: UnwrappedEditableField): field is EditableField {
	return (
		typeof field === "object" &&
		isFieldProxyTarget(field[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
	);
}
