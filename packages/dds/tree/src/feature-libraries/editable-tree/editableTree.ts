/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	Value,
	Anchor,
	FieldKey,
	symbolIsFieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	FieldSchema,
	TreeSchemaIdentifier,
	TreeSchema,
	lookupTreeSchema,
	mapCursorFields,
	CursorLocationType,
	FieldAnchor,
	ITreeCursor,
	anchorSlot,
	AnchorNode,
	inCursorField,
} from "../../core";
import { brand, fail } from "../../util";
import { FieldKind, Multiplicity } from "../modular-schema";
import { singleMapTreeCursor } from "../mapTreeCursor";
import {
	getFieldKind,
	getFieldSchema,
	ContextuallyTypedNodeData,
	applyFieldTypesFromContext,
	typeNameSymbol,
	valueSymbol,
	allowsValue,
} from "../contextuallyTyped";
import { AdaptingProxyHandler, adaptWithProxy } from "./utilities";
import { ProxyContext } from "./editableTreeContext";
import {
	EditableField,
	EditableTree,
	EditableTreeEvents,
	UnwrappedEditableField,
	createField,
	getField,
	on,
	parentField,
	proxyTargetSymbol,
	replaceField,
	typeSymbol,
	contextSymbol,
} from "./editableTreeTypes";
import { makeField, unwrappedField } from "./editableField";
import { ProxyTarget } from "./ProxyTarget";

const editableTreeSlot = anchorSlot<EditableTree>();

export function makeTree(context: ProxyContext, cursor: ITreeSubscriptionCursor): EditableTree {
	const anchor = cursor.buildAnchor();
	const anchorNode =
		context.forest.anchors.locate(anchor) ??
		fail("cursor should point to a node that is not the root of the AnchorSet");
	const cached = anchorNode.slots.get(editableTreeSlot);
	if (cached !== undefined) {
		context.forest.anchors.forget(anchor);
		return cached;
	}
	const newTarget = new NodeProxyTarget(context, cursor, anchorNode, anchor);
	const output = adaptWithProxy(newTarget, nodeProxyHandler);
	anchorNode.slots.set(editableTreeSlot, output);
	anchorNode.on("afterDelete", cleanupTree);
	return output;
}

function cleanupTree(anchor: AnchorNode): void {
	const cached =
		anchor.slots.get(editableTreeSlot) ?? fail("tree should only be cleaned up once");
	(cached[proxyTargetSymbol] as NodeProxyTarget).free();
}

function isNodeProxyTarget(target: ProxyTarget<Anchor | FieldAnchor>): target is NodeProxyTarget {
	return target instanceof NodeProxyTarget;
}

/**
 * A Proxy target, which together with a `nodeProxyHandler` implements a basic access to
 * the fields of {@link EditableTree} by means of the cursors.
 */
export class NodeProxyTarget extends ProxyTarget<Anchor> {
	public readonly proxy: EditableTree;
	private readonly removeDeleteCallback: () => void;
	public constructor(
		context: ProxyContext,
		cursor: ITreeSubscriptionCursor,
		public readonly anchorNode: AnchorNode,
		anchor: Anchor,
	) {
		super(context, cursor, anchor);
		assert(cursor.mode === CursorLocationType.Nodes, 0x44c /* must be in nodes mode */);

		this.proxy = adaptWithProxy(this, nodeProxyHandler);
		anchorNode.slots.set(editableTreeSlot, this.proxy);
		this.removeDeleteCallback = anchorNode.on("afterDelete", cleanupTree);

		assert(
			this.context.schema.treeSchema.get(this.typeName) !== undefined,
			0x5b1 /* There is no explicit schema for this node type. Ensure that the type is correct and the schema for it was added to the SchemaData */,
		);
	}

	protected buildAnchor(): Anchor {
		return this.context.forest.anchors.track(this.anchorNode);
	}

	protected tryMoveCursorToAnchor(
		anchor: Anchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToNode(anchor, cursor);
	}

	protected forgetAnchor(anchor: Anchor): void {
		// This type unconditionally has an anchor, so `forgetAnchor` is always called and cleanup can be done here:
		// After this point this node will not be usable,
		// so remove it from the anchor incase a different context (or the same context later) uses this AnchorSet.
		this.anchorNode.slots.delete(editableTreeSlot);
		this.removeDeleteCallback();
		this.context.forest.anchors.forget(anchor);
	}

	public get typeName(): TreeSchemaIdentifier {
		return this.cursor.type;
	}

	public get type(): TreeSchema {
		return lookupTreeSchema(this.context.schema, this.typeName);
	}

	public get value(): Value {
		return this.cursor.value;
	}

	public set value(value: Value) {
		assert(
			allowsValue(this.type.value, value),
			0x5b2 /* Out of schema value can not be set on tree */,
		);
		this.context.setNodeValue(this.anchorNode, value);
	}

	public get currentIndex(): number {
		return this.cursor.fieldIndex;
	}

	public lookupFieldKind(field: FieldKey): FieldKind {
		return getFieldKind(this.getFieldSchema(field));
	}

	public getFieldSchema(field: FieldKey): FieldSchema {
		return getFieldSchema(field, this.context.schema, this.type);
	}

	public getFieldKeys(): FieldKey[] {
		return mapCursorFields(this.cursor, (c) => c.getFieldKey());
	}

	public has(field: FieldKey): boolean {
		// Make fields present only if non-empty.
		return this.fieldLength(field) !== 0;
	}

	public unwrappedField(field: FieldKey): UnwrappedEditableField {
		const schema = this.getFieldSchema(field);
		return inCursorField(this.cursor, field, (cursor) =>
			unwrappedField(this.context, schema, cursor),
		);
	}

	public getField(fieldKey: FieldKey): EditableField {
		const schema = this.getFieldSchema(fieldKey);
		return inCursorField(this.cursor, fieldKey, (cursor) =>
			makeField(this.context, schema, cursor),
		);
	}

	public [Symbol.iterator](): IterableIterator<EditableField> {
		const type = this.type;
		return mapCursorFields(this.cursor, (cursor) =>
			makeField(
				this.context,
				getFieldSchema(cursor.getFieldKey(), this.context.schema, type),
				cursor,
			),
		).values();
	}

	public createField(fieldKey: FieldKey, newContent: ITreeCursor | ITreeCursor[]): void {
		assert(!this.has(fieldKey), 0x44f /* The field already exists. */);
		const fieldKind = this.lookupFieldKind(fieldKey);
		const path = this.anchorNode;
		switch (fieldKind.multiplicity) {
			case Multiplicity.Optional: {
				assert(
					!Array.isArray(newContent),
					0x450 /* Use single cursor to create the optional field */,
				);
				this.context.setOptionalField(path, fieldKey, newContent, true);
				break;
			}
			case Multiplicity.Sequence: {
				this.context.insertNodes(path, fieldKey, 0, newContent);
				break;
			}
			case Multiplicity.Value:
				fail("It is invalid to create fields of kind `value` as they should always exist.");
			default:
				fail("`Forbidden` fields may not be created.");
		}
	}

	private fieldLength(field: FieldKey): number {
		return inCursorField(this.cursor, field, (cursor) => cursor.getFieldLength());
	}

	public deleteField(fieldKey: FieldKey): void {
		const fieldKind = this.lookupFieldKind(fieldKey);
		const path = this.anchorNode;
		switch (fieldKind.multiplicity) {
			case Multiplicity.Optional: {
				this.context.setOptionalField(path, fieldKey, undefined, false);
				break;
			}
			case Multiplicity.Sequence: {
				const length = this.fieldLength(fieldKey);
				this.context.deleteNodes(path, fieldKey, 0, length);
				break;
			}
			case Multiplicity.Value:
				fail("Fields of kind `value` may not be deleted.");
			default:
				fail("`Forbidden` fields may not be deleted.");
		}
	}

	public replaceField(
		fieldKey: FieldKey,
		newContent: undefined | ITreeCursor | ITreeCursor[],
	): void {
		const fieldKind = this.lookupFieldKind(fieldKey);
		const path = this.anchorNode;
		switch (fieldKind.multiplicity) {
			case Multiplicity.Optional: {
				assert(
					!Array.isArray(newContent),
					0x4cd /* It is invalid to replace the optional field using the array data. */,
				);
				this.context.setOptionalField(path, fieldKey, newContent, !this.has(fieldKey));
				break;
			}
			case Multiplicity.Sequence: {
				assert(
					Array.isArray(newContent),
					"It is invalid to replace the sequence field with a non array value.",
				);
				const length = this.fieldLength(fieldKey);
				/**
				 * `replaceNodes` has different merge semantics than the `replaceField` would ideally offer:
				 * `replaceNodes` should not overwrite concurrently inserted content while `replaceField` should.
				 * We currently use `replaceNodes` here because the low-level editing API
				 * for the desired `replaceField` semantics is not yet avaialble.
				 */
				// TODO: update implementation once the low-level editing API is available.
				this.context.replaceNodes(path, fieldKey, 0, length, newContent);
				break;
			}
			case Multiplicity.Value: {
				assert(
					!Array.isArray(newContent),
					0x4ce /* It is invalid to replace the value field using the array data. */,
				);
				assert(
					newContent !== undefined,
					"It is invalid to replace a value field with undefined",
				);
				this.context.setValueField(path, fieldKey, newContent);
				break;
			}
			default:
				fail("`Forbidden` fields may not be replaced as they never exist.");
		}
	}

	public get parentField(): { readonly parent: EditableField; readonly index: number } {
		const cursor = this.cursor;
		const index = cursor.fieldIndex;
		cursor.exitNode();
		const key = cursor.getFieldKey();
		cursor.exitField();
		const parentType = cursor.type;
		cursor.enterField(key);
		const fieldSchema = getFieldSchema(
			key,
			this.context.schema,
			lookupTreeSchema(this.context.schema, parentType),
		);
		const proxifiedField = makeField(this.context, fieldSchema, this.cursor);
		this.cursor.enterNode(index);

		return { parent: proxifiedField, index };
	}

	public on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void {
		switch (eventName) {
			case "changing": {
				const unsubscribeFromValueChange = this.anchorNode.on("valueChanging", listener);
				const unsubscribeFromChildrenChange = this.anchorNode.on(
					"childrenChanging",
					(anchorNode: AnchorNode) => listener(anchorNode, undefined),
				);
				return () => {
					unsubscribeFromValueChange();
					unsubscribeFromChildrenChange();
				};
			}
			case "subtreeChanging": {
				const unsubscribeFromSubtreeChange = this.anchorNode.on(
					"subtreeChanging",
					(anchorNode: AnchorNode) => listener(anchorNode, undefined),
				);
				return unsubscribeFromSubtreeChange;
			}
			default:
				unreachableCase(eventName);
		}
	}
}

/**
 * A Proxy handler together with a {@link NodeProxyTarget} implements a basic read/write access to the Forest
 * by means of the cursors.
 */
const nodeProxyHandler: AdaptingProxyHandler<NodeProxyTarget, EditableTree> = {
	get: (target: NodeProxyTarget, key: string | symbol): unknown => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			// All string keys are fields
			return target.unwrappedField(brand(key));
		}
		// utility symbols
		switch (key) {
			case typeSymbol:
				return target.type;
			case typeNameSymbol:
				return target.typeName;
			case valueSymbol:
				return target.value;
			case proxyTargetSymbol:
				return target;
			case Symbol.iterator:
				return target[Symbol.iterator].bind(target);
			case getField:
				return target.getField.bind(target);
			case createField:
				return target.createField.bind(target);
			case replaceField:
				return target.replaceField.bind(target);
			case parentField:
				return target.parentField;
			case contextSymbol:
				return target.context;
			case on:
				return target.on.bind(target);
			default:
				return undefined;
		}
	},
	set: (
		target: NodeProxyTarget,
		key: string | symbol,
		value: ContextuallyTypedNodeData,
		receiver: NodeProxyTarget,
	): boolean => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			const fieldKey: FieldKey = brand(key);
			const fieldSchema = target.getFieldSchema(fieldKey);
			const multiplicity = target.lookupFieldKind(fieldKey).multiplicity;
			const content = applyFieldTypesFromContext(target.context.schema, fieldSchema, value);
			const cursors = content.map(singleMapTreeCursor);
			// This unconditionally uses `replaceField`, which differs from `createField`
			// only for sequence fields while using `insertNodes` instead of `replaceNodes`
			// (plus some difference in assertions, which is ignored here for a sake of a better
			// consistency with the low-level editing API).
			// Since `insertNodes` and `replaceNodes` have same merge semantics with `replaceNodes`
			// being a bit more general purpose function, it's ok to just use that.
			if (multiplicity !== Multiplicity.Sequence) {
				assert(cursors.length <= 1, "more than one top level node in non-sequence filed");
				target.replaceField(fieldKey, cursors.length === 0 ? undefined : cursors[0]);
			} else {
				target.replaceField(fieldKey, cursors);
			}
			return true;
		} else if (key === valueSymbol) {
			target.value = value;
			return true;
		}
		return false;
	},
	deleteProperty: (target: NodeProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			const fieldKey: FieldKey = brand(key);
			target.deleteField(fieldKey);
			return true;
		}
		return false;
	},
	// Include documented symbols (except value when value is undefined) and all non-empty fields.
	has: (target: NodeProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "string" || symbolIsFieldKey(key)) {
			return target.has(brand(key));
		}
		// utility symbols
		switch (key) {
			case proxyTargetSymbol:
			case typeSymbol:
			case typeNameSymbol:
			case Symbol.iterator:
			case getField:
			case createField:
			case replaceField:
			case parentField:
			case on:
			case contextSymbol:
				return true;
			case valueSymbol:
				// Could do `target.value !== ValueSchema.Nothing`
				// instead if values which could be modified should report as existing.
				return target.value !== undefined;
			default:
				return false;
		}
	},
	// Includes all non-empty fields, which are the enumerable fields.
	ownKeys: (target: NodeProxyTarget): FieldKey[] => {
		return target.getFieldKeys();
	},
	getOwnPropertyDescriptor: (
		target: NodeProxyTarget,
		key: string | symbol,
	): PropertyDescriptor | undefined => {
		// We generally don't want to allow users of the proxy to reconfigure all the properties,
		// but it is an TypeError to return non-configurable for properties that do not exist on target,
		// so they must return true.

		if ((typeof key === "string" || symbolIsFieldKey(key)) && target.has(brand(key))) {
			const field = target.unwrappedField(brand(key));
			return {
				configurable: true,
				enumerable: true,
				value: field,
				writable: true,
			};
		}
		// utility symbols
		switch (key) {
			case proxyTargetSymbol:
				return { configurable: true, enumerable: false, value: target, writable: false };
			case typeSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.type,
					writable: false,
				};
			case typeNameSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.typeName,
					writable: false,
				};
			case valueSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.value,
					writable: false,
				};
			case Symbol.iterator:
				return {
					configurable: true,
					enumerable: false,
					value: target[Symbol.iterator].bind(target),
					writable: false,
				};
			case getField:
				return {
					configurable: true,
					enumerable: false,
					value: target.getField.bind(target),
					writable: false,
				};
			case createField:
				return {
					configurable: true,
					enumerable: false,
					value: target.createField.bind(target),
					writable: false,
				};
			case replaceField:
				return {
					configurable: true,
					enumerable: false,
					value: target.replaceField.bind(target),
					writable: false,
				};
			case parentField:
				return {
					configurable: true,
					enumerable: false,
					value: target.parentField,
					writable: false,
				};
			case contextSymbol:
				return {
					configurable: true,
					enumerable: false,
					value: target.context,
					writable: false,
				};
			case on:
				return {
					configurable: true,
					enumerable: false,
					value: target.on.bind(target),
					writable: false,
				};
			default:
				return undefined;
		}
	},
};

/**
 * Checks the type of an UnwrappedEditableField.
 * @alpha
 */
export function isUnwrappedNode(field: UnwrappedEditableField): field is EditableTree {
	return (
		typeof field === "object" &&
		isNodeProxyTarget(field[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
	);
}
