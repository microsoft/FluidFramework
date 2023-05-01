/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Anchor,
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	FieldSchema,
	LocalFieldKey,
	TreeSchema,
	ValueSchema,
	lookupTreeSchema,
	mapCursorField,
	CursorLocationType,
	FieldAnchor,
	ITreeCursor,
	inCursorNode,
} from "../../core";
import { Multiplicity } from "../modular-schema";
import {
	getFieldKind,
	getPrimaryField,
	isPrimitiveValue,
	ContextuallyTypedNodeData,
	arrayLikeMarkerSymbol,
	cursorFromContextualData,
} from "../contextuallyTyped";
import {
	AdaptingProxyHandler,
	adaptWithProxy,
	isPrimitive,
	keyIsValidIndex,
	getOwnArrayKeys,
} from "./utilities";
import { ProxyContext } from "./editableTreeContext";
import {
	EditableField,
	EditableTree,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	proxyTargetSymbol,
} from "./editableTreeTypes";
import { makeTree } from "./editableTree";
import { ProxyTarget } from "./ProxyTarget";

export function makeField(
	context: ProxyContext,
	fieldSchema: FieldSchema,
	cursor: ITreeSubscriptionCursor,
): EditableField {
	const targetSequence = new FieldProxyTarget(context, fieldSchema, cursor);
	return adaptWithProxy(targetSequence, fieldProxyHandler);
}

function isFieldProxyTarget(target: ProxyTarget<Anchor | FieldAnchor>): target is FieldProxyTarget {
	return target instanceof FieldProxyTarget;
}

/**
 * @returns the key, if any, of the primary array field.
 */
function getPrimaryArrayKey(
	type: TreeSchema,
): { key: LocalFieldKey; schema: FieldSchema } | undefined {
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

	public constructor(
		context: ProxyContext,
		public readonly fieldSchema: FieldSchema,
		cursor: ITreeSubscriptionCursor,
	) {
		super(context, cursor);
		assert(cursor.mode === CursorLocationType.Fields, 0x453 /* must be in fields mode */);
		this.fieldKey = cursor.getFieldKey();
		this[arrayLikeMarkerSymbol] = true;
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

	protected buildAnchor(): FieldAnchor {
		return this.cursor.buildFieldAnchor();
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

	public insertNodes(index: number, newContent: ITreeCursor | ITreeCursor[]): void {
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length === 0 && (!Array.isArray(newContent) || newContent.length <= 1),
				0x455 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			keyIsValidIndex(index, this.length + 1),
			0x456 /* Index must be less than or equal to length. */,
		);
		const fieldPath = this.cursor.getFieldPath();
		this.context.insertNodes(fieldPath, index, newContent);
	}

	public deleteNodes(index: number, count?: number): void {
		// TODO: currently for all field kinds the nodes can be deleted by editor using `sequenceField.delete()`.
		// Uncomment when the editor will become more schema-aware.
		// const fieldKind = getFieldKind(this.fieldSchema);
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		assert(
			this.length === 0 || keyIsValidIndex(index, this.length),
			0x457 /* Index must be less than length. */,
		);
		if (count !== undefined) assert(count >= 0, 0x458 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const _count = count === undefined || count > maxCount ? maxCount : count;
		const fieldPath = this.cursor.getFieldPath();
		this.context.deleteNodes(fieldPath, index, _count);
	}

	public replaceNodes(
		index: number,
		newContent: ITreeCursor | ITreeCursor[],
		count?: number,
	): void {
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length <= 1 && (!Array.isArray(newContent) || newContent.length <= 1),
				0x4d0 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			(this.length === 0 && index === 0) || keyIsValidIndex(index, this.length),
			0x4d1 /* Index must be less than length or, if the field is empty, be 0. */,
		);
		if (count !== undefined) assert(count >= 0, 0x4d2 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const _count = count === undefined || count > maxCount ? maxCount : count;
		const fieldPath = this.cursor.getFieldPath();
		this.context.replaceNodes(fieldPath, index, _count, newContent);
	}
}

const editableFieldPropertySetWithoutLength = new Set<string>([
	"fieldKey",
	"fieldSchema",
	"primaryType",
	"parent",
	"context",
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
			} else if (keyIsValidIndex(key, target.length)) {
				return target.unwrappedTree(Number(key));
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
	set: (
		target: FieldProxyTarget,
		key: string,
		value: ContextuallyTypedNodeData,
		receiver: unknown,
	): boolean => {
		const cursor = cursorFromContextualData(
			target.context.schema,
			target.fieldSchema.types,
			value,
		);
		// This is just a cheap way to check if there might be a node at the given index.
		// An implementation of the target methods holds all relevant key assertions.
		// TODO: maybe refactor this to add a real node existence check if desired,
		// but it might be costly regarding performance.
		if (keyIsValidIndex(key, target.length)) {
			target.replaceNodes(Number(key), cursor, 1);
		} else {
			target.insertNodes(Number(key), cursor);
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
	const nodeType = lookupTreeSchema(context.schema, nodeTypeName);
	// Unwrap primitives or nodes having a primary field. Sequences unwrap nodes on their own.
	if (isPrimitive(nodeType)) {
		const nodeValue = cursor.value;
		if (isPrimitiveValue(nodeValue)) {
			return nodeValue;
		}
		assert(
			nodeType.value === ValueSchema.Serializable,
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
 * @param fieldSchema - the FieldSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 */
export function unwrappedField(
	context: ProxyContext,
	fieldSchema: FieldSchema,
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
