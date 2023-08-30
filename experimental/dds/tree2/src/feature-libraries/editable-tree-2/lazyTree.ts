/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import * as SchemaAware from "../schema-aware";
import {
	Value,
	Anchor,
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	TreeSchemaIdentifier,
	mapCursorFields,
	CursorLocationType,
	anchorSlot,
	AnchorNode,
	inCursorField,
	rootFieldKey,
	EmptyKey,
} from "../../core";
import { fail } from "../../util";
import { FieldKind } from "../modular-schema";
import {
	FieldSchema,
	SchemaBuilder,
	TreeSchema,
	MapSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
	FieldNodeSchema,
	LeafSchema,
	StructSchema,
} from "../typed-schema";
import { TreeStatus, treeStatusFromPath } from "../editable-tree";
import { EditableTreeEvents } from "../untypedTree";
import { ContextuallyTypedNodeData } from "../contextuallyTyped";
import { Context } from "./editableTreeContext";
import {
	FieldNode,
	FlexibleFieldContent,
	Leaf,
	MapNode,
	Struct,
	StructTyped,
	TypedField,
	TypedNode,
	UntypedField,
	UntypedTree,
} from "./editableTreeTypes";
import { makeField } from "./lazyField";
import { LazyEntity } from "./lazyEntity";

const lazyTreeSlot = anchorSlot<LazyTree>();

export function makeTree(context: Context, cursor: ITreeSubscriptionCursor): LazyTree {
	const anchor = cursor.buildAnchor();
	const anchorNode =
		context.forest.anchors.locate(anchor) ??
		fail("cursor should point to a node that is not the root of the AnchorSet");
	const cached = anchorNode.slots.get(lazyTreeSlot);
	if (cached !== undefined) {
		context.forest.anchors.forget(anchor);
		assert(cached.context === context, "contexts must match");
		return cached;
	}
	const schema = context.schema.treeSchema.get(cursor.type) ?? fail("missing schema");
	const output = buildSubclass(context, schema, cursor, anchorNode, anchor);
	anchorNode.slots.set(lazyTreeSlot, output);
	anchorNode.on("afterDelete", cleanupTree);
	return output;
}

function cleanupTree(anchor: AnchorNode): void {
	const cached = anchor.slots.get(lazyTreeSlot) ?? fail("tree should only be cleaned up once");
	cached.free();
}

function buildSubclass(
	context: Context,
	schema: TreeSchema,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
): LazyTree {
	if (schemaIsMap(schema)) {
		return new LazyMap(context, schema, cursor, anchorNode, anchor);
	}
	if (schemaIsLeaf(schema)) {
		return new LazyLeaf(context, schema, cursor, anchorNode, anchor);
	}
	if (schemaIsFieldNode(schema)) {
		return new LazyFieldNode(context, schema, cursor, anchorNode, anchor);
	}
	if (schemaIsStruct(schema)) {
		return buildLazyStruct(context, schema, cursor, anchorNode, anchor);
	}
	fail("unrecognized node kind");
}

/**
 * A Proxy target, which together with a `nodeProxyHandler` implements a basic access to
 * the fields of {@link EditableTree} by means of the cursors.
 */
export abstract class LazyTree<TSchema extends TreeSchema = TreeSchema>
	extends LazyEntity<TSchema, Anchor>
	implements UntypedTree
{
	private readonly removeDeleteCallback: () => void;
	public constructor(
		context: Context,
		schema: TSchema,
		cursor: ITreeSubscriptionCursor,
		public readonly anchorNode: AnchorNode,
		anchor: Anchor,
	) {
		super(context, schema, cursor, anchor);
		assert(cursor.mode === CursorLocationType.Nodes, 0x44c /* must be in nodes mode */);

		anchorNode.slots.set(lazyTreeSlot, this);
		this.removeDeleteCallback = anchorNode.on("afterDelete", cleanupTree);

		assert(
			this.context.schema.treeSchema.get(this.typeName) !== undefined,
			0x5b1 /* There is no explicit schema for this node type. Ensure that the type is correct and the schema for it was added to the SchemaData */,
		);
	}

	public is<TSchemaInner extends TreeSchema>(
		schema: TSchemaInner,
	): this is TypedNode<TSchemaInner> {
		assert(
			this.context.schema.treeSchema.get(schema.name) === schema,
			"Narrowing must be done to a schema that exists in this context",
		);
		return (this.schema as TreeSchema) === schema;
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
		this.anchorNode.slots.delete(lazyTreeSlot);
		this.removeDeleteCallback();
		this.context.forest.anchors.forget(anchor);
	}

	public get typeName(): TreeSchemaIdentifier {
		return this.cursor.type;
	}

	public get type(): TreeSchema {
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
		return this.getFieldSchema(field).kind;
	}

	public getFieldSchema(field: FieldKey): FieldSchema {
		return getFieldSchema(field, this.schema);
	}

	public has(field: FieldKey): boolean {
		// Make fields present only if non-empty.
		return this.fieldLength(field) !== 0;
	}

	// public unwrappedField(field: FieldKey): UnwrappedEditableField {
	// 	const schema = this.getFieldSchema(field);
	// 	return inCursorField(this.cursor, field, (cursor) =>
	// 		unboxedField(this.context, schema, cursor),
	// 	);
	// }

	public getField(fieldKey: FieldKey): UntypedField {
		const schema = this.getFieldSchema(fieldKey);
		return inCursorField(this.cursor, fieldKey, (cursor) =>
			makeField(this.context, schema, cursor),
		);
	}

	public tryGetField(fieldKey: FieldKey): UntypedField | undefined {
		const schema = this.getFieldSchema(fieldKey);
		return inCursorField(this.cursor, fieldKey, (cursor) => {
			if (cursor.getFieldLength() === 0) {
				return undefined;
			}
			return makeField(this.context, schema, cursor);
		});
	}

	public [Symbol.iterator](): IterableIterator<UntypedField> {
		return mapCursorFields(this.cursor, (cursor) =>
			makeField(this.context, this.getFieldSchema(cursor.getFieldKey()), cursor),
		).values();
	}

	private fieldLength(field: FieldKey): number {
		return inCursorField(this.cursor, field, (cursor) => cursor.getFieldLength());
	}

	public get parentField(): { readonly parent: UntypedField; readonly index: number } {
		const cursor = this.cursor;
		const index = this.anchorNode.parentIndex;
		assert(this.cursor.fieldIndex === index, 0x714 /* mismatched indexes */);
		const key = this.anchorNode.parentField;

		cursor.exitNode();
		assert(key === cursor.getFieldKey(), 0x715 /* mismatched keys */);
		let fieldSchema: FieldSchema;

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
				fieldSchema = SchemaBuilder.fieldSequence();
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

	public override treeStatus(): TreeStatus {
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

class LazyMap<TSchema extends MapSchema> extends LazyTree<TSchema> implements MapNode<TSchema> {
	public get(key: FieldKey): TypedField<TSchema["mapFields"]> {
		return this.getField(key) as TypedField<TSchema["mapFields"]>;
	}
	public set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void {
		const field = this.get(key);
		if (field.is(SchemaBuilder.fieldOptional(...this.schema.mapFields.allowedTypes))) {
			field.setContent(content);
		} else {
			assert(
				field.is(SchemaBuilder.fieldSequence(...this.schema.mapFields.allowedTypes)),
				"unexpected map field kind",
			);
			// TODO: fix merge semantics.
			field.replaceRange(0, field.length, content as Iterable<ContextuallyTypedNodeData>);
		}
	}

	public [Symbol.iterator](): IterableIterator<TypedField<TSchema["mapFields"]>> {
		return super[Symbol.iterator]() as IterableIterator<TypedField<TSchema["mapFields"]>>;
	}
}

class LazyLeaf<TSchema extends LeafSchema> extends LazyTree<TSchema> implements Leaf<TSchema> {
	public override get value(): SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]> {
		return super.value as SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]>;
	}
}

class LazyFieldNode<TSchema extends FieldNodeSchema>
	extends LazyTree<TSchema>
	implements FieldNode<TSchema>
{
	public get content(): TypedField<TSchema["structFieldsObject"][""]> {
		return this.getField(EmptyKey) as TypedField<TSchema["structFieldsObject"][""]>;
	}
}

abstract class LazyStruct<TSchema extends StructSchema>
	extends LazyTree<TSchema>
	implements Struct {}

function buildLazyStruct<TSchema extends StructSchema>(
	context: Context,
	schema: TreeSchema,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
): LazyStruct<TSchema> & StructTyped<TSchema> {
	fail("todo");
}

export function getFieldSchema(field: FieldKey, schema: TreeSchema): FieldSchema {
	return schema.structFields.get(field) ?? schema.mapFields ?? FieldSchema.empty;
}
