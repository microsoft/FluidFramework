/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import * as SchemaAware from "../schema-aware";
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
	TreeSchemaIdentifier,
	forEachField,
} from "../../core";
import { capitalize, disposeSymbol, fail, getOrCreate } from "../../util";
import {
	FieldSchema,
	TreeSchema,
	MapSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
	FieldNodeSchema,
	LeafSchema,
	StructSchema,
	Any,
} from "../typed-schema";
import { TreeStatus, treeStatusFromPath } from "../editable-tree";
import { EditableTreeEvents } from "../untypedTree";
import { FieldKinds } from "../default-field-kinds";
import { Context } from "./context";
import {
	FieldNode,
	Leaf,
	MapNode,
	Struct,
	StructTyped,
	TypedField,
	TypedNode,
	UnboxField,
	TreeField,
	TreeNode,
} from "./editableTreeTypes";
import { makeField, unboxedField } from "./lazyField";
import {
	LazyEntity,
	cursorSymbol,
	forgetAnchorSymbol,
	isFreedSymbol,
	makePropertyEnumerableOwn,
	tryMoveCursorToAnchorSymbol,
} from "./lazyEntity";

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
	cached[disposeSymbol]();
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
	implements TreeNode
{
	/**
	 * Enumerable own property providing a more JS object friendly alternative to "schema".
	 */
	public readonly type: TreeSchemaIdentifier;

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
		assert(cursor.mode === CursorLocationType.Nodes, "must be in nodes mode");

		anchorNode.slots.set(lazyTreeSlot, this);
		this.#removeDeleteCallback = anchorNode.on("afterDelete", cleanupTree);

		assert(
			this.context.schema.treeSchema.get(this.schema.name) !== undefined,
			"There is no explicit schema for this node type. Ensure that the type is correct and the schema for it was added to the SchemaData",
		);

		// Setup JS Object API:
		// makePrivatePropertyNotEnumerable(this, "removeDeleteCallback");
		// makePrivatePropertyNotEnumerable(this, "anchorNode");
		this.type = schema.name;
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

	public [Symbol.iterator](): IterableIterator<TreeField> {
		return mapCursorFields(this[cursorSymbol], (cursor) =>
			makeField(this.context, getFieldSchema(cursor.getFieldKey(), this.schema), cursor),
		).values();
	}

	public get parentField(): { readonly parent: TreeField; readonly index: number } {
		const cursor = this[cursorSymbol];
		const index = this.#anchorNode.parentIndex;
		assert(cursor.fieldIndex === index, "mismatched indexes");
		const key = this.#anchorNode.parentField;

		cursor.exitNode();
		assert(key === cursor.getFieldKey(), "mismatched keys");
		let fieldSchema: FieldSchema;

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
				fieldSchema = new FieldSchema(FieldKinds.sequence, [Any]);
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

		const proxifiedField = makeField(this.context, fieldSchema, cursor);
		cursor.enterNode(index);

		return { parent: proxifiedField, index };
	}

	public override treeStatus(): TreeStatus {
		if (this[isFreedSymbol]()) {
			return TreeStatus.Deleted;
		}
		const path = this.#anchorNode;
		return treeStatusFromPath(path);
	}

	public on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void {
		switch (eventName) {
			case "changing": {
				const unsubscribeFromChildrenChange = this.#anchorNode.on(
					"childrenChanging",
					(anchorNode: AnchorNode) => listener(anchorNode),
				);
				return unsubscribeFromChildrenChange;
			}
			case "subtreeChanging": {
				const unsubscribeFromSubtreeChange = this.#anchorNode.on(
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

export class LazyMap<TSchema extends MapSchema>
	extends LazyTree<TSchema>
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

	public get(key: FieldKey): TypedField<TSchema["mapFields"]> {
		return inCursorField(this[cursorSymbol], key, (cursor) =>
			makeField(this.context, this.schema.mapFields, cursor),
		) as TypedField<TSchema["mapFields"]>;
	}

	// TODO: when appropriate add setter that delegates to field kind specific setter.
	// public set(key: FieldKey, content: FlexibleFieldContent<TSchema["mapFields"]>): void {
	// 	const field = this.get(key);
	// 	if (field.is(SchemaBuilder.fieldOptional(...this.schema.mapFields.allowedTypes))) {
	// 		field.setContent(content);
	// 	} else {
	// 		assert(
	// 			field.is(SchemaBuilder.fieldSequence(...this.schema.mapFields.allowedTypes)),
	// 			"unexpected map field kind",
	// 		);
	// 		// TODO: fix merge semantics.
	// 		field.replaceRange(0, field.length, content as Iterable<ContextuallyTypedNodeData>);
	// 	}
	// }

	public [Symbol.iterator](): IterableIterator<TypedField<TSchema["mapFields"]>> {
		return super[Symbol.iterator]() as IterableIterator<TypedField<TSchema["mapFields"]>>;
	}

	public get asObject(): {
		readonly [P in FieldKey]?: UnboxField<TSchema["mapFields"]>;
	} {
		const record: Record<FieldKey, UnboxField<TSchema["mapFields"]> | undefined> =
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
	extends LazyTree<TSchema>
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
		makePropertyEnumerableOwn(this, "value", LazyTree.prototype);
	}

	public override get value(): SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]> {
		return super.value as SchemaAware.InternalTypes.TypedValue<TSchema["leafValue"]>;
	}
}

export class LazyFieldNode<TSchema extends FieldNodeSchema>
	extends LazyTree<TSchema>
	implements FieldNode<TSchema>
{
	public get content(): UnboxField<TSchema["structFieldsObject"][""]> {
		return inCursorField(this[cursorSymbol], EmptyKey, (cursor) =>
			unboxedField(
				this.context,
				this.schema.structFields.get(EmptyKey) ?? fail("missing field schema"),
				cursor,
			),
		) as UnboxField<TSchema["structFieldsObject"][""]>;
	}

	public get boxedContent(): TypedField<TSchema["structFieldsObject"][""]> {
		return inCursorField(this[cursorSymbol], EmptyKey, (cursor) =>
			makeField(
				this.context,
				this.schema.structFields.get(EmptyKey) ?? fail("missing field schema"),
				cursor,
			),
		) as TypedField<TSchema["structFieldsObject"][""]>;
	}
}

export abstract class LazyStruct<TSchema extends StructSchema>
	extends LazyTree<TSchema>
	implements Struct {}

export function buildLazyStruct<TSchema extends StructSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
): LazyStruct<TSchema> & StructTyped<TSchema> {
	const structClass = getOrCreate(cachedStructClasses, schema, () => buildStructClass(schema));
	return new structClass(context, cursor, anchorNode, anchor) as LazyStruct<TSchema> &
		StructTyped<TSchema>;
}

const cachedStructClasses = new WeakMap<
	StructSchema,
	new (
		context: Context,
		cursor: ITreeSubscriptionCursor,
		anchorNode: AnchorNode,
		anchor: Anchor,
	) => LazyStruct<StructSchema>
>();

function buildStructClass<TSchema extends StructSchema>(
	schema: TSchema,
): new (
	context: Context,
	cursor: ITreeSubscriptionCursor,
	anchorNode: AnchorNode,
	anchor: Anchor,
) => LazyStruct<TSchema> {
	const propertyDescriptorMap: PropertyDescriptorMap = {};
	const ownPropertyMap: PropertyDescriptorMap = {};

	for (const [key, field] of schema.structFields) {
		ownPropertyMap[key] = {
			enumerable: true,
			get(this: CustomStruct): unknown {
				return inCursorField(this[cursorSymbol], key, (cursor) =>
					unboxedField(this.context, field, cursor),
				);
			},
		};

		propertyDescriptorMap[`boxed${capitalize(key)}`] = {
			enumerable: false,
			get(this: CustomStruct) {
				return inCursorField(this[cursorSymbol], key, (cursor) =>
					makeField(this.context, field, cursor),
				);
			},
		};

		// TODO: add setters (methods and assignment) when compatible with FieldKind and TypeScript.
		// propertyDescriptorMap[`set${capitalize(key)}`] = {
		// 	enumerable: false,
		// 	get(this: CustomStruct) {
		// 		return (content: NewFieldContent) => {
		// 			this.getField(key).setContent(content);
		// 		};
		// 	},
		// };
	}

	// This must implement `StructTyped<TSchema>`, but TypeScript can't constrain it to do so.
	class CustomStruct extends LazyStruct<TSchema> {
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

export function getFieldSchema(field: FieldKey, schema: TreeSchema): FieldSchema {
	return schema.structFields.get(field) ?? schema.mapFields ?? FieldSchema.empty;
}
