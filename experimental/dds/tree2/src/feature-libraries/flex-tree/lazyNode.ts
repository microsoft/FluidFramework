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
import { brand, capitalize, disposeSymbol, fail, getOrCreate } from "../../util";
import {
	TreeFieldSchema,
	TreeNodeSchema,
	MapNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	FieldNodeSchema,
	LeafNodeSchema,
	ObjectNodeSchema,
	Any,
	AllowedTypes,
} from "../typed-schema";
import { FieldKinds } from "../default-schema";
import { LocalNodeKey } from "../node-key";
import { EditableTreeEvents, TreeEvent } from "./treeEvents";
import { Context } from "./context";
import {
	FlexTreeFieldNode,
	FlexTreeLeafNode,
	FlexTreeMapNode,
	FlexTreeObjectNode,
	FlexTreeObjectNodeTyped,
	FlexTreeTypedField,
	FlexTreeTypedNode,
	FlexTreeUnboxField,
	FlexTreeField,
	FlexTreeNode,
	boxedIterator,
	TreeStatus,
	FlexTreeRequiredField,
	FlexTreeOptionalField,
	FlexibleFieldContent,
	FlexibleNodeContent,
	onNextChange,
	FlexTreeEntityKind,
	flexTreeMarker,
} from "./flexTreeTypes";
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
	// TODO: there should be a common fallback that works for cases without a specialized implementation.
	fail("unrecognized node kind");
}

/**
 * Lazy implementation of {@link FlexTreeNode}.
 */
export abstract class LazyTreeNode<TSchema extends TreeNodeSchema = TreeNodeSchema>
	extends LazyEntity<TSchema, Anchor>
	implements FlexTreeNode
{
	public get [flexTreeMarker](): FlexTreeEntityKind.Node {
		return FlexTreeEntityKind.Node;
	}
	/**
	 * Enumerable own property providing a more JS object friendly alternative to "schema".
	 */
	public readonly type: TreeNodeSchemaIdentifier;

	// Using JS private here prevents it from showing up as a enumerable own property, or conflicting with struct fields.
	readonly #removeDeleteCallback: () => void;

	readonly #anchorNode: AnchorNode;

	#removeNextChangeCallback: (() => void) | undefined;

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
	): this is FlexTreeTypedNode<TSchemaInner> {
		assert(
			this.context.schema.nodeSchema.get(schema.name) === schema,
			0x785 /* Narrowing must be done to a schema that exists in this context */,
		);
		return this.schema === (schema as unknown);
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

	public tryGetField(fieldKey: FieldKey): FlexTreeField | undefined {
		const schema = this.schema.getFieldSchema(fieldKey);
		return inCursorField(this[cursorSymbol], fieldKey, (cursor) => {
			if (cursor.getFieldLength() === 0) {
				return undefined;
			}
			return makeField(this.context, schema, cursor);
		});
	}

	public [boxedIterator](): IterableIterator<FlexTreeField> {
		return mapCursorFields(this[cursorSymbol], (cursor) =>
			makeField(this.context, this.schema.getFieldSchema(cursor.getFieldKey()), cursor),
		).values();
	}

	public get parentField(): { readonly parent: FlexTreeField; readonly index: number } {
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
			const nodeSchema =
				this.context.schema.nodeSchema.get(parentType) ??
				fail("requested schema that does not exist");
			fieldSchema = nodeSchema.getFieldSchema(key);
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

	public [onNextChange](fn: (node: FlexTreeNode) => void): () => void {
		assert(
			this.#removeNextChangeCallback === undefined,
			0x806 /* Only one subscriber may listen to next tree node change at a time */,
		);
		this.#removeNextChangeCallback = this.#anchorNode.on("childrenChanged", () => {
			this.#removeNextChangeCallback?.();
			this.#removeNextChangeCallback = undefined;
			fn(this);
		});
		const removeNextChangeCallback = this.#removeNextChangeCallback;
		return () => {
			// Only reset our saved callback if it's the one we closed over in the first place.
			// It will be different if this is being called after a subsequent registration.
			if (this.#removeNextChangeCallback === removeNextChangeCallback) {
				this.#removeNextChangeCallback();
				this.#removeNextChangeCallback = undefined;
			}
		};
	}
}

export class LazyMap<TSchema extends MapNodeSchema>
	extends LazyTreeNode<TSchema>
	implements FlexTreeMapNode<TSchema>
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

	public values(): IterableIterator<FlexTreeUnboxField<TSchema["info"], "notEmpty">> {
		return mapCursorFields(
			this[cursorSymbol],
			(cursor) =>
				unboxedField(this.context, this.schema.info, cursor) as FlexTreeUnboxField<
					TSchema["info"],
					"notEmpty"
				>,
		).values();
	}

	public entries(): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		return mapCursorFields(this[cursorSymbol], (cursor) => {
			const entry: [FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">] = [
				cursor.getFieldKey(),
				unboxedField(this.context, this.schema.info, cursor) as FlexTreeUnboxField<
					TSchema["info"],
					"notEmpty"
				>,
			];
			return entry;
		}).values();
	}

	public forEach(
		callbackFn: (
			value: FlexTreeUnboxField<TSchema["info"], "notEmpty">,
			key: FieldKey,
			map: FlexTreeMapNode<TSchema>,
		) => void,
		thisArg?: any,
	): void {
		const fn = thisArg !== undefined ? callbackFn.bind(thisArg) : callbackFn;
		for (const [key, value] of this.entries()) {
			fn(value, key, this);
		}
	}

	public has(key: string): boolean {
		return this.tryGetField(brand(key)) !== undefined;
	}

	public get(key: string): FlexTreeUnboxField<TSchema["info"]> {
		return inCursorField(this[cursorSymbol], brand(key), (cursor) =>
			unboxedField(this.context, this.schema.info, cursor),
		) as FlexTreeUnboxField<TSchema["info"]>;
	}

	public getBoxed(key: string): FlexTreeTypedField<TSchema["info"]> {
		return inCursorField(this[cursorSymbol], brand(key), (cursor) =>
			makeField(this.context, this.schema.info, cursor),
		) as FlexTreeTypedField<TSchema["info"]>;
	}

	public set(key: string, content: FlexibleFieldContent<TSchema["info"]> | undefined): void {
		const field = this.getBoxed(key);
		const fieldSchema = this.schema.info;

		if (fieldSchema.kind === FieldKinds.optional) {
			const optionalField = field as FlexTreeOptionalField<AllowedTypes>;
			optionalField.content = content;
		} else {
			assert(fieldSchema.kind === FieldKinds.sequence, 0x807 /* Unexpected map field kind */);

			// TODO: implement setting of sequence fields once we have defined clear merged semantics for doing so.
			// For now, we will throw an error, since the public API does not currently expose a way to do this anyways.
			throw new Error("Setting of sequence values in maps is not yet supported.");
		}
	}

	public delete(key: FieldKey): void {
		// Since all keys implicitly exist under a Map node, and we represent "no value" with `undefined`,
		// "deleting" a key/value pair is the same as setting the value to `undefined`.
		this.set(key, undefined);
	}

	public override [boxedIterator](): IterableIterator<FlexTreeTypedField<TSchema["info"]>> {
		return super[boxedIterator]() as IterableIterator<FlexTreeTypedField<TSchema["info"]>>;
	}

	public [Symbol.iterator](): IterableIterator<
		[FieldKey, FlexTreeUnboxField<TSchema["info"], "notEmpty">]
	> {
		return this.entries();
	}

	public get asObject(): {
		readonly [P in FieldKey]?: FlexTreeUnboxField<TSchema["info"], "notEmpty">;
	} {
		const record: Record<
			FieldKey,
			FlexTreeUnboxField<TSchema["info"], "notEmpty"> | undefined
		> = Object.create(null);

		forEachField(this[cursorSymbol], (cursor) => {
			Object.defineProperty(record, cursor.getFieldKey(), {
				value: unboxedField(this.context, this.schema.info, cursor),
				configurable: true,
				enumerable: true,
			});
		});
		return record;
	}
}

export class LazyLeaf<TSchema extends LeafNodeSchema>
	extends LazyTreeNode<TSchema>
	implements FlexTreeLeafNode<TSchema>
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

	public override get value(): TreeValue<TSchema["info"]> {
		return super.value as TreeValue<TSchema["info"]>;
	}
}

export class LazyFieldNode<TSchema extends FieldNodeSchema>
	extends LazyTreeNode<TSchema>
	implements FlexTreeFieldNode<TSchema>
{
	public get content(): FlexTreeUnboxField<TSchema["info"]> {
		return inCursorField(this[cursorSymbol], EmptyKey, (cursor) =>
			unboxedField(this.context, this.schema.info, cursor),
		) as FlexTreeUnboxField<TSchema["info"]>;
	}

	public get boxedContent(): FlexTreeTypedField<TSchema["info"]> {
		return inCursorField(this[cursorSymbol], EmptyKey, (cursor) =>
			makeField(this.context, this.schema.info, cursor),
		) as FlexTreeTypedField<TSchema["info"]>;
	}
}

export abstract class LazyObjectNode<TSchema extends ObjectNodeSchema>
	extends LazyTreeNode<TSchema>
	implements FlexTreeObjectNode
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
): LazyObjectNode<TSchema> & FlexTreeObjectNodeTyped<TSchema> {
	const objectNodeClass = getOrCreate(cachedStructClasses, schema, () =>
		buildStructClass(schema),
	);
	return new objectNodeClass(context, cursor, anchorNode, anchor) as LazyObjectNode<TSchema> &
		FlexTreeObjectNodeTyped<TSchema>;
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
): FlexTreeField {
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
		let setter: ((newContent: FlexibleNodeContent<AllowedTypes>) => void) | undefined;
		switch (fieldSchema.kind) {
			case FieldKinds.optional: {
				setter = function (
					this: CustomStruct,
					newContent: FlexibleNodeContent<AllowedTypes> | undefined,
				): void {
					const field = getBoxedField(
						this,
						key,
						fieldSchema,
					) as FlexTreeOptionalField<AllowedTypes>;
					field.content = newContent;
				};
				break;
			}
			case FieldKinds.required: {
				setter = function (
					this: CustomStruct,
					newContent: FlexibleNodeContent<AllowedTypes>,
				): void {
					const field = getBoxedField(
						this,
						key,
						fieldSchema,
					) as FlexTreeRequiredField<AllowedTypes>;
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
