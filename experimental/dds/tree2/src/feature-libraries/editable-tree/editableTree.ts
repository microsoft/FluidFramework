/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	Value,
	Anchor,
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	FieldStoredSchema,
	TreeSchemaIdentifier,
	TreeStoredSchema,
	mapCursorFields,
	CursorLocationType,
	FieldAnchor,
	anchorSlot,
	AnchorNode,
	inCursorField,
	rootFieldKey,
} from "../../core";
import { brand, fail } from "../../util";
import { FieldKind } from "../modular-schema";
import {
	getFieldKind,
	NewFieldContent,
	getFieldSchema,
	typeNameSymbol,
	valueSymbol,
} from "../contextuallyTyped";
import { LocalNodeKey } from "../node-key";
import { FieldKinds } from "../default-field-kinds";
import {
	EditableTreeEvents,
	getField,
	on,
	parentField,
	typeSymbol,
	contextSymbol,
	treeStatus,
} from "../untypedTree";
import {
	AdaptingProxyHandler,
	adaptWithProxy,
	getStableNodeKey,
	treeStatusFromPath,
} from "./utilities";
import { ProxyContext } from "./editableTreeContext";
import {
	EditableField,
	EditableTree,
	UnwrappedEditableField,
	proxyTargetSymbol,
	localNodeKeySymbol,
	setField,
	TreeStatus,
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

	public get type(): TreeStoredSchema {
		return (
			this.context.schema.treeSchema.get(this.typeName) ??
			fail("requested type does not exist in schema")
		);
	}

	public get value(): Value {
		return this.cursor.value;
	}

	public get currentIndex(): number {
		return this.cursor.fieldIndex;
	}

	public lookupFieldKind(field: FieldKey): FieldKind {
		return getFieldKind(this.getFieldSchema(field));
	}

	public getFieldSchema(field: FieldKey): FieldStoredSchema {
		return getFieldSchema(field, this.type);
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

	public setField(fieldKey: FieldKey, content: NewFieldContent): void {
		this.getField(fieldKey).setContent(content);
	}

	public [Symbol.iterator](): IterableIterator<EditableField> {
		const type = this.type;
		return mapCursorFields(this.cursor, (cursor) =>
			makeField(this.context, getFieldSchema(cursor.getFieldKey(), type), cursor),
		).values();
	}

	private fieldLength(field: FieldKey): number {
		return inCursorField(this.cursor, field, (cursor) => cursor.getFieldLength());
	}

	public get parentField(): { readonly parent: EditableField; readonly index: number } {
		const cursor = this.cursor;
		const index = this.anchorNode.parentIndex;
		assert(this.cursor.fieldIndex === index, 0x714 /* mismatched indexes */);
		const key = this.anchorNode.parentField;

		cursor.exitNode();
		assert(key === cursor.getFieldKey(), 0x715 /* mismatched keys */);
		let fieldSchema: FieldStoredSchema;

		// Check if the current node is in a detached sequence.
		if (this.anchorNode.parent === undefined) {
			// Parent field is a detached sequence, and thus needs special handling for its schema.
			// eslint-disable-next-line unicorn/prefer-ternary
			if (key === rootFieldKey) {
				fieldSchema = this.context.schema.rootFieldSchema;
			} else {
				// All fields (in the editable tree API) have a schema.
				// Since currently there is no known schema for detached sequences other than the special default root:
				// give all other detached fields a schema of sequence of any.
				// That schema is the only one that is safe since its the only field schema that allows any possible field content.
				//
				// TODO:
				// if any of the following are done this schema will need to be more specific:
				// 1. Editing APIs start exposing user created detached sequences.
				// 2. Remove (and its inverse) start working on subsequences or fields contents (like everything in a sequence or optional field) and not just single nodes.
				// 3. Possibly other unknown cases.
				// Additionally this approach makes it possible for a user to take an EditableTree node, get its parent, check its schema, down cast based on that, then edit that detached field (ex: removing the node in it).
				// This MIGHT work properly with existing merge resolution logic (it must keep client in sync and be unable to violate schema), but this either needs robust testing or to be explicitly banned (error before s3ending the op).
				// Issues like replacing a node in the a removed sequenced then undoing the remove could easily violate schema if not everything works exactly right!
				fieldSchema = { kind: FieldKinds.sequence };
			}
		} else {
			cursor.exitField();
			const parentType = cursor.type;
			cursor.enterField(key);
			fieldSchema = getFieldSchema(
				key,
				this.context.schema.treeSchema.get(parentType) ??
					fail("requested schema that does not exist"),
			);
		}

		const proxifiedField = makeField(this.context, fieldSchema, this.cursor);
		this.cursor.enterNode(index);

		return { parent: proxifiedField, index };
	}

	public treeStatus(): TreeStatus {
		if (this.isFreed()) {
			return TreeStatus.Deleted;
		}
		const path = this.anchorNode;
		return treeStatusFromPath(path);
	}

	public on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void {
		switch (eventName) {
			case "changing": {
				const unsubscribeFromChildrenChange = this.anchorNode.on(
					"childrenChanging",
					(anchorNode: AnchorNode) => listener(anchorNode),
				);
				return unsubscribeFromChildrenChange;
			}
			case "subtreeChanging": {
				const unsubscribeFromSubtreeChange = this.anchorNode.on(
					"subtreeChanging",
					(anchorNode: AnchorNode) => listener(anchorNode),
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
		if (typeof key === "string") {
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
			case setField:
				return target.setField.bind(target);
			case treeStatus:
				return target.treeStatus.bind(target);
			case parentField:
				return target.parentField;
			case contextSymbol:
				return target.context;
			case on:
				return target.on.bind(target);
			case localNodeKeySymbol:
				return getLocalNodeKey(target);
			default:
				return undefined;
		}
	},
	set: (
		target: NodeProxyTarget,
		key: string | symbol,
		value: NewFieldContent,
		receiver: NodeProxyTarget,
	): boolean => {
		assert(
			key !== valueSymbol,
			0x703 /* The value of a node can only be changed by replacing the node */,
		);
		if (typeof key === "string") {
			const fieldKey: FieldKey = brand(key);
			target.setField(fieldKey, value);
			return true;
		}
		return false;
	},
	deleteProperty: (target: NodeProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "string") {
			const fieldKey: FieldKey = brand(key);
			target.getField(fieldKey).remove();
			return true;
		}
		return false;
	},
	// Include documented symbols (except value when value is undefined) and all non-empty fields.
	has: (target: NodeProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "string") {
			return target.has(brand(key));
		}
		// utility symbols
		switch (key) {
			case proxyTargetSymbol:
			case typeSymbol:
			case typeNameSymbol:
			case Symbol.iterator:
			case getField:
			case parentField:
			case on:
			case contextSymbol:
				return true;
			case localNodeKeySymbol:
				return target.context.nodeKeyFieldKey !== undefined;
			case valueSymbol:
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

		if (typeof key === "string" && target.has(brand(key))) {
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
			case setField:
				return {
					configurable: true,
					enumerable: false,
					value: target.setField.bind(target),
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
			case localNodeKeySymbol:
				return {
					configurable: true,
					enumerable: false,
					value: getLocalNodeKey(target),
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
export function isEditableTree(field: UnwrappedEditableField): field is EditableTree {
	return (
		typeof field === "object" &&
		isNodeProxyTarget(field[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
	);
}

/**
 * Retrieves the {@link LocalNodeKey} for the given node.
 * @remarks TODO: Optimize this to be a fast path that gets a {@link LocalNodeKey} directly from the
 * forest rather than getting the {@link StableNodeKey} and the compressing it.
 */
function getLocalNodeKey(target: NodeProxyTarget): LocalNodeKey | undefined {
	if (target.context.nodeKeyFieldKey === undefined) {
		return undefined;
	}

	const stableNodeKey = getStableNodeKey(target.context.nodeKeyFieldKey, target.proxy);
	if (stableNodeKey === undefined) {
		return undefined;
	}

	return target.context.nodeKeys.localizeNodeKey(stableNodeKey);
}
