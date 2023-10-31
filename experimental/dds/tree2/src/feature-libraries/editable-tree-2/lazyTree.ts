/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	Value,
	Anchor,
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	mapCursorFields,
	CursorLocationType,
	anchorSlot,
	AnchorNode,
	inCursorField,
	rootFieldKey,
	EmptyKey,
	TreeNodeSchemaIdentifier,
	forEachField,
	TreeValue,
} from "../../core";
import { capitalize, disposeSymbol, fail, getOrCreate } from "../../util";
import { ContextuallyTypedNodeData } from "../contextuallyTyped";
import {
	TreeFieldSchema,
	TreeNodeSchema,
	MapSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode as schemaIsObjectNode,
	FieldNodeSchema,
	LeafSchema,
	ObjectNodeSchema,
	Any,
	AllowedTypes,
} from "../typed-schema";
import { EditableTreeEvents, TreeEvent } from "../untypedTree";
import { FieldKinds } from "../default-field-kinds";
import { LocalNodeKey } from "../node-key";
import { Context } from "./context";
import {
	FieldNode,
	Leaf,
	MapNode,
	ObjectNode,
	ObjectNodeTyped,
	TypedField,
	TypedNode,
	UnboxField,
	TreeField,
	TreeNode,
	boxedIterator,
	TreeStatus,
	RequiredField,
	OptionalField,
} from "./editableTreeTypes";
import { LazyNodeKeyField, makeField } from "./lazyField";
import {
	LazyEntity,
	cursorSymbol,
	forgetAnchorSymbol,
	isFreedSymbol,
	makePropertyEnumerableOwn,
	tryMoveCursorToAnchorSymbol,
} from "./lazyEntity";
import { unboxedField } from "./unboxed";
import { treeStatusFromAnchorCache } from "./utilities";

const lazyTreeSlot = anchorSlot<LazyTreeNode>();

export function makeTree(context: Context, cursor: ITreeSubscriptionCursor): LazyTreeNode {
	const anchor = cursor.buildAnchor();
	const anchorNode =
		context.forest.anchors.locate(anchor) ??
		fail("cursor should point to a node that is not the root of the AnchorSet");
	const cached = anchorNode.slots.get(lazyTreeSlot);
	if (cached !== undefined) {
		context.forest.anchors.forget(anchor);
		assert(cached.context === context, 0x782 /* contexts must match */);
		return cached;
	}
	const schema = context.schema.nodeSchema.get(cursor.type) ?? fail("missing schema");
	const output = buildSubclass(context, schema, cursor, anchorNode, anchor);
	anchorNode.slots.set(lazyTreeSlot, output);
	anchorNode.on("afterDestroy", cleanupTree);
	return output;
}

function cleanupTree(anchor: AnchorNode): void {
	const cached = anchor.slots.get(lazyTreeSlot) ?? fail("tree should only be cleaned up once");
	cached[disposeSymbol]();
}

function buildSubclass(
	context: Context,
	schema: TreeNodeSchema,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
): LazyTreeNode {
	if (schemaIsMap(schema)) {
		return new LazyMap(context, schema, cursor, anchorNode, anchor);
	}
	if (schemaIsLeaf(schema)) {
		return new LazyLeaf(context, schema, cursor, anchorNode, anchor);
	}
	if (schemaIsFieldNode(schema)) {
		return new LazyFieldNode(context, schema, cursor, anchorNode, anchor);
	}
	if (schemaIsObjectNode(schema)) {
		return buildLazyObjectNode(context, schema, cursor, anchorNode, anchor);
	}
	fail("unrecognized node kind");
}

/**
 * Lazy implementation of {@link TreeNode}.
 */
export abstract class LazyTreeNode<TSchema extends TreeNodeSchema = TreeNodeSchema>
	extends LazyEntity<TSchema, Anchor>
	implements TreeNode
{
	/**
	 * Enumerable own property providing a more JS object friendly alternative to "schema".
	 */
	public readonly type: TreeNodeSchemaIdentifier;

	// Using JS private here prevents it from showing up as a enumerable own property, or conflicting with struct fields.
	readonly #removeDeleteCallback: () => void;

	readonly #anchorNode: AnchorNode;

	public constructor(
		context: Context,
		schema: TSchema,
		cursor: ITreeSubscriptionCursor,
		anchorNode: AnchorNode,
		anchor: Anchor,
	) {
		super(context, schema, cursor, anchor);
		this.#anchorNode = anchorNode;
		assert(cursor.mode === CursorLocationType.Nodes, 0x783 /* must be in nodes mode */);

		anchorNode.slots.set(lazyTreeSlot, this);
		this.#removeDeleteCallback = anchorNode.on("afterDestroy", cleanupTree);

		assert(
			this.context.schema.nodeSchema.get(this.schema.name) !== undefined,
			0x784 /* There is no explicit schema for this node type. Ensure that the type is correct and the schema for it was added to the TreeStoredSchema */,
		);

		// Setup JS Object API:
		// makePrivatePropertyNotEnumerable(this, "removeDeleteCallback");
		// makePrivatePropertyNotEnumerable(this, "anchorNode");
		this.type = schema.name;
	}

	public is<TSchemaInner extends TreeNodeSchema>(
		schema: TSchemaInner,
	): this is TypedNode<TSchemaInner> {
		assert(
			this.context.schema.nodeSchema.get(schema.name) === schema,
			0x785 /* Narrowing must be done to a schema that exists in this context */,
		);
		return (this.schema as TreeNodeSchema) === schema;
	}

	protected override [tryMoveCursorToAnchorSymbol](
		anchor: Anchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToNode(anchor, cursor);
	}

	protected override [forgetAnchorSymbol](anchor: Anchor): void {
		// This type unconditionally has an anchor, so `forgetAnchor` is always called and cleanup can be done here:
		// After this point this node will not be usable,
		// so remove it from the anchor incase a different context (or the same context later) uses this AnchorSet.
		this.#anchorNode.slots.delete(lazyTreeSlot);
		this.#removeDeleteCallback();
		this.context.forest.anchors.forget(anchor);
	}

	public get value(): Value {
		return this[cursorSymbol].value;
	}

	public tryGetField(fieldKey: FieldKey): TreeField | undefined {
		const schema = getFieldSchema(fieldKey, this.schema);
		return inCursorField(this[cursorSymbol], fieldKey, (cursor) => {
			if (cursor.getFieldLength() === 0) {
				return undefined;
			}
			return makeField(this.context, schema, cursor);
		});
	}

	public [boxedIterator](): IterableIterator<TreeField> {
		return mapCursorFields(this[cursorSymbol], (cursor) =>
			makeField(this.context, getFieldSchema(cursor.getFieldKey(), this.schema), cursor),
		).values();
	}

	public get parentField(): { readonly parent: TreeField; readonly index: number } {
		const cursor = this[cursorSymbol];
		const index = this.#anchorNode.parentIndex;
		assert(cursor.fieldIndex === index, 0x786 /* mismatched indexes */);
		const key = this.#anchorNode.parentField;

		cursor.exitNode();
		assert(key === cursor.getFieldKey(), 0x787 /* mismatched keys */);
		let fieldSchema: TreeFieldSchema;

		// Check if the current node is in a detached sequence.
		if (this.#anchorNode.parent === undefined) {
			// Parent field is a detached sequence, and thus needs special handling for its schema.
			// eslint-disable-next-line unicorn/prefer-ternary
			if (key === rootFieldKey) {
				fieldSchema = this.context.schema.rootFieldSchema;
			} else {
				// All fields (in the editable tree API) have a schema.
				// Since currently there is no known schema for detached field other than the special default root:
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
				fieldSchema = TreeFieldSchema.create(FieldKinds.sequence, [Any]);
			}
		} else {
			cursor.exitField();
			const parentType = cursor.type;
			cursor.enterField(key);
			fieldSchema = getFieldSchema(
				key,
				this.context.schema.nodeSchema.get(parentType) ??
					fail("requested schema that does not exist"),
			);
		}

		const proxifiedField = makeField(this.context, fieldSchema, cursor);
		cursor.enterNode(index);

		return { parent: proxifiedField, index };
	}

	public override treeStatus(): TreeStatus {
		if (this[isFreedSymbol]()) {
			return TreeStatus.Deleted;
		}
		return treeStatusFromAnchorCache(this.context.forest.anchors, this.#anchorNode);
	}

	public on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void {
		switch (eventName) {
			case "changing": {
				const unsubscribeFromChildrenChange = this.#anchorNode.on(
					"childrenChanging",
					(anchorNode: AnchorNode) =>
						// Ugly casting workaround because I can't figure out how to make TS understand that in this case block
						// the listener argument only needs to be an AnchorNode. Should go away if/when we make the listener signature
						// for changing and subtreeChanging match the one for beforeChange and afterChange.
						listener(anchorNode as unknown as AnchorNode & TreeEvent),
				);
				return unsubscribeFromChildrenChange;
			}
			case "subtreeChanging": {
				const unsubscribeFromSubtreeChange = this.#anchorNode.on(
					"subtreeChanging",
					(anchorNode: AnchorNode) =>
						// Ugly casting workaround because I can't figure out how to make TS understand that in this case block
						// the listener argument only needs to be an AnchorNode. Should go away if/when we make the listener signature
						// for changing and subtreeChanging match the one for beforeChange and afterChange.
						listener(anchorNode as unknown as AnchorNode & TreeEvent),
				);
				return unsubscribeFromSubtreeChange;
			}
			case "beforeChange": {
				const unsubscribeFromChildrenBeforeChange = this.#anchorNode.on(
					"beforeChange",
					(anchorNode: AnchorNode) => {
						const treeNode = anchorNode.slots.get(lazyTreeSlot);
						assert(
							treeNode !== undefined,
							0x7d3 /* tree node not found in anchor node slots */,
						);
						// Ugly casting workaround because I can't figure out how to make TS understand that in this case block
						// the listener argument only needs to be a TreeEvent. Should go away if/when we make the listener signature
						// for changing and subtreeChanging match the one for beforeChange and afterChange.
						listener({ target: treeNode } as unknown as AnchorNode & TreeEvent);
					},
				);
				return unsubscribeFromChildrenBeforeChange;
			}
			case "afterChange": {
				const unsubscribeFromChildrenAfterChange = this.#anchorNode.on(
					"afterChange",
					(anchorNode: AnchorNode) => {
						const treeNode = anchorNode.slots.get(lazyTreeSlot);
						assert(
							treeNode !== undefined,
							0x7d4 /* tree node not found in anchor node slots */,
						);
						// Ugly casting workaround because I can't figure out how to make TS understand that in this case block
						// the listener argument only needs to be a TreeEvent. Should go away if/when we make the listener signature
						// for changing and subtreeChanging match the one for beforeChange and afterChange.
						listener({ target: treeNode } as unknown as AnchorNode & TreeEvent);
					},
				);
				return unsubscribeFromChildrenAfterChange;
			}
			default:
				unreachableCase(eventName);
		}
	}
}

export class LazyMap<TSchema extends MapSchema>
	extends LazyTreeNode<TSchema>
	implements MapNode<TSchema>
{
	public constructor(
		context: Context,
		schema: TSchema,
		cursor: ITreeSubscriptionCursor,
		anchorNode: AnchorNode,
		anchor: Anchor,
	) {
		super(context, schema, cursor, anchorNode, anchor);

		// Setup JS Object API:
		makePropertyEnumerableOwn(this, "asObject", LazyMap.prototype);
	}

	public get size(): number {
		let fieldCount = 0;
		forEachField(this[cursorSymbol], () => (fieldCount += 1));
		return fieldCount;
	}

	public keys(): IterableIterator<FieldKey> {
		return mapCursorFields(this[cursorSymbol], (cursor) => cursor.getFieldKey()).values();
	}

	public values(): IterableIterator<UnboxField<TSchema["mapFields"], "notEmpty">> {
		return mapCursorFields(
			this[cursorSymbol],
			(cursor) =>
				unboxedField(this.context, this.schema.mapFields, cursor) as UnboxField<
					TSchema["mapFields"],
					"notEmpty"
				>,
		).values();
	}

	public entries(): IterableIterator<[FieldKey, UnboxField<TSchema["mapFields"], "notEmpty">]> {
		return mapCursorFields(this[cursorSymbol], (cursor) => {
			const entry: [FieldKey, UnboxField<TSchema["mapFields"], "notEmpty">] = [
				cursor.getFieldKey(),
				unboxedField(this.context, this.schema.mapFields, cursor) as UnboxField<
					TSchema["mapFields"],
					"notEmpty"
				>,
			];
			return entry;
		}).values();
	}

	public forEach(
		callbackFn: (
			value: UnboxField<TSchema["mapFields"], "notEmpty">,
			key: FieldKey,
			map: MapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void {
		const fn = thisArg !== undefined ? callbackFn.bind(thisArg) : callbackFn;
		for (const [key, value] of this.entries()) {
			fn(value, key, this);
		}
	}

	public has(key: FieldKey): boolean {
		return this.tryGetField(key) !== undefined;
	}

	public get(key: FieldKey): UnboxField<TSchema["mapFields"]> {
		return inCursorField(this[cursorSymbol], key, (cursor) =>
			unboxedField(this.context, this.schema.mapFields, cursor),
		) as UnboxField<TSchema["mapFields"]>;
	}

	public getBoxed(key: FieldKey): TypedField<TSchema["mapFields"]> {
		return inCursorField(this[cursorSymbol], key, (cursor) =>
			makeField(this.context, this.schema.mapFields, cursor),
		) as TypedField<TSchema["mapFields"]>;
	}

	// TODO: when appropriate add setter that delegates to field kind specific setter.
	// public set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void {
	// 	const field = this.get(key);
	// 	if (field.is(SchemaBuilder.optional(this.schema.mapFields.allowedTypes))) {
	// 		field.setContent(content);
	// 	} else {
	// 		assert(
	// 			field.is(SchemaBuilder.sequence(this.schema.mapFields.allowedTypes)),
	// 			"unexpected map field kind",
	// 		);
	// 		// TODO: fix merge semantics.
	// 		field.replaceRange(0, field.length, content as Iterable<ContextuallyTypedNodeData>);
	// 	}
	// }

	public override [boxedIterator](): IterableIterator<TypedField<TSchema["mapFields"]>> {
		return super[boxedIterator]() as IterableIterator<TypedField<TSchema["mapFields"]>>;
	}

	public [Symbol.iterator](): IterableIterator<
		[FieldKey, UnboxField<TSchema["mapFields"], "notEmpty">]
	> {
		return this.entries();
	}

	public get asObject(): {
		readonly [P in FieldKey]?: UnboxField<TSchema["mapFields"], "notEmpty">;
	} {
		const record: Record<FieldKey, UnboxField<TSchema["mapFields"], "notEmpty"> | undefined> =
			Object.create(null);

		forEachField(this[cursorSymbol], (cursor) => {
			Object.defineProperty(record, cursor.getFieldKey(), {
				value: unboxedField(this.context, this.schema.mapFields, cursor),
				configurable: true,
				enumerable: true,
			});
		});
		return record;
	}
}

export class LazyLeaf<TSchema extends LeafSchema>
	extends LazyTreeNode<TSchema>
	implements Leaf<TSchema>
{
	public constructor(
		context: Context,
		schema: TSchema,
		cursor: ITreeSubscriptionCursor,
		anchorNode: AnchorNode,
		anchor: Anchor,
	) {
		super(context, schema, cursor, anchorNode, anchor);

		// Setup JS Object API:
		makePropertyEnumerableOwn(this, "value", LazyTreeNode.prototype);
	}

	public override get value(): TreeValue<TSchema["leafValue"]> {
		return super.value as TreeValue<TSchema["leafValue"]>;
	}
}

export class LazyFieldNode<TSchema extends FieldNodeSchema>
	extends LazyTreeNode<TSchema>
	implements FieldNode<TSchema>
{
	public get content(): UnboxField<TSchema["objectNodeFieldsObject"][""]> {
		return inCursorField(this[cursorSymbol], EmptyKey, (cursor) =>
			unboxedField(
				this.context,
				this.schema.objectNodeFields.get(EmptyKey) ?? fail("missing field schema"),
				cursor,
			),
		) as UnboxField<TSchema["objectNodeFieldsObject"][""]>;
	}

	public get boxedContent(): TypedField<TSchema["objectNodeFieldsObject"][""]> {
		return inCursorField(this[cursorSymbol], EmptyKey, (cursor) =>
			makeField(
				this.context,
				this.schema.objectNodeFields.get(EmptyKey) ?? fail("missing field schema"),
				cursor,
			),
		) as TypedField<TSchema["objectNodeFieldsObject"][""]>;
	}
}

export abstract class LazyObjectNode<TSchema extends ObjectNodeSchema>
	extends LazyTreeNode<TSchema>
	implements ObjectNode
{
	public get localNodeKey(): LocalNodeKey | undefined {
		// TODO: Optimize this to be in the derived class so it can cache schema lookup.
		// TODO: Optimize this to avoid allocating the field object.

		const key = this.context.nodeKeyFieldKey;
		const fieldSchema = this.schema.objectNodeFields.get(key);

		if (fieldSchema === undefined) {
			return undefined;
		}

		const field = this.tryGetField(key);
		assert(field instanceof LazyNodeKeyField, 0x7b4 /* unexpected node key field */);
		// TODO: ideally we would do something like this, but that adds dependencies we can't have here:
		// assert(
		// 	field.is(TreeFieldSchema.create(FieldKinds.nodeKey, [nodeKeyTreeSchema])),
		// 	"invalid node key field",
		// );

		if (this.context.nodeKeyFieldKey === undefined) {
			return undefined;
		}

		return field.localNodeKey;
	}
}

export function buildLazyObjectNode<TSchema extends ObjectNodeSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
): LazyObjectNode<TSchema> & ObjectNodeTyped<TSchema> {
	const objectNodeClass = getOrCreate(cachedStructClasses, schema, () =>
		buildStructClass(schema),
	);
	return new objectNodeClass(context, cursor, anchorNode, anchor) as LazyObjectNode<TSchema> &
		ObjectNodeTyped<TSchema>;
}

const cachedStructClasses = new WeakMap<
	ObjectNodeSchema,
	new (
		context: Context,
		cursor: ITreeSubscriptionCursor,
		anchorNode: AnchorNode,
		anchor: Anchor,
	) => LazyObjectNode<ObjectNodeSchema>
>();

export function getBoxedField(
	objectNode: LazyTreeNode,
	key: FieldKey,
	fieldSchema: TreeFieldSchema,
): TreeField {
	return inCursorField(objectNode[cursorSymbol], key, (cursor) => {
		return makeField(objectNode.context, fieldSchema, cursor);
	});
}

function buildStructClass<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
): new (
	context: Context,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
) => LazyObjectNode<TSchema> {
	const propertyDescriptorMap: PropertyDescriptorMap = {};
	const ownPropertyMap: PropertyDescriptorMap = {};

	for (const [key, fieldSchema] of schema.objectNodeFields) {
		let setter: ((newContent: ContextuallyTypedNodeData) => void) | undefined;
		switch (fieldSchema.kind) {
			case FieldKinds.optional: {
				setter = function (
					this: CustomStruct,
					newContent: ContextuallyTypedNodeData,
				): void {
					const field = getBoxedField(
						this,
						key,
						fieldSchema,
					) as RequiredField<AllowedTypes>;
					field.content = newContent;
				};
				break;
			}
			case FieldKinds.required: {
				setter = function (
					this: CustomStruct,
					newContent: ContextuallyTypedNodeData,
				): void {
					const field = getBoxedField(
						this,
						key,
						fieldSchema,
					) as OptionalField<AllowedTypes>;
					field.content = newContent;
				};
				break;
			}
			default:
				setter = undefined;
				break;
		}

		// Create getter and setter (when appropriate) for property
		ownPropertyMap[key] = {
			enumerable: true,
			get(this: CustomStruct): unknown {
				return inCursorField(this[cursorSymbol], key, (cursor) =>
					unboxedField(this.context, fieldSchema, cursor),
				);
			},
			set: setter,
		};

		// Create set method for property (when appropriate)
		if (setter !== undefined) {
			propertyDescriptorMap[`set${capitalize(key)}`] = {
				enumerable: false,
				get(this: CustomStruct) {
					return setter;
				},
			};
		}

		propertyDescriptorMap[`boxed${capitalize(key)}`] = {
			enumerable: false,
			get(this: CustomStruct) {
				return getBoxedField(this, key, fieldSchema);
			},
		};
	}

	// This must implement `StructTyped<TSchema>`, but TypeScript can't constrain it to do so.
	class CustomStruct extends LazyObjectNode<TSchema> {
		public constructor(
			context: Context,
			cursor: ITreeSubscriptionCursor,
			anchorNode: AnchorNode,
			anchor: Anchor,
		) {
			super(context, schema, cursor, anchorNode, anchor);
			Object.defineProperties(this, ownPropertyMap);
		}
	}

	Object.defineProperties(CustomStruct.prototype, propertyDescriptorMap);

	return CustomStruct;
}

export function getFieldSchema(field: FieldKey, schema: TreeNodeSchema): TreeFieldSchema {
	return schema.objectNodeFields.get(field) ?? schema.mapFields ?? TreeFieldSchema.empty;
}
