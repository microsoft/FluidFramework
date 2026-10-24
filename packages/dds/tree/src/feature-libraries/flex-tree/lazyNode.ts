/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	type Anchor,
	type AnchorNode,
	CursorLocationType,
	type FieldKey,
	type FieldKindIdentifier,
	type ITreeSubscriptionCursor,
	type TreeNavigationResult,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type Value,
	inCursorField,
	inCursorNode,
	mapCursorFields,
	rootFieldKey,
} from "../../core/index.js";
import { disposeSymbol, getOrCreate } from "../../util/index.js";
import { FieldKinds } from "../default-schema/index.js";

import type { Context } from "./context.js";
import {
	FlexTreeEntityKind,
	type FlexTreeField,
	type FlexTreeUnknownUnboxed,
	type HydratedFlexTreeNode,
	flexTreeMarker,
	flexTreeSlot,
} from "./flexTreeTypes.js";
import { LazyEntity } from "./lazyEntity.js";
import { getCachedField, makeField, MapField, unboxedFlexNode } from "./lazyField.js";
import { currentObserver } from "./observer.js";
import { isOptionalMapSchema } from "./utilities.js";

/**
 * Get or create a {@link HydratedFlexTreeNode} for the given context at node indicated by the cursor.
 * @remarks
 * This does not take ownership of this cursor: Node will fork it as needed.
 */
export function getOrCreateHydratedFlexTreeNode(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): HydratedFlexTreeNode {
	const anchor = cursor.buildAnchor();
	const anchorNode =
		context.checkout.forest.anchors.locate(anchor) ??
		fail(0xb12 /* cursor should point to a node that is not the root of the AnchorSet */);
	const cached = anchorNode.slots.get(flexTreeSlot);
	if (cached !== undefined) {
		context.checkout.forest.anchors.forget(anchor);
		assert(cached.context === context, 0x782 /* contexts must match */);
		assert(cached instanceof LazyTreeNode, 0x92c /* Expected LazyTreeNode */);
		return cached;
	}
	const schema = context.schema.nodeSchema.get(cursor.type) ?? fail("Missing node schema");
	const NodeClass = isOptionalMapSchema(schema) ? LazyMapNode : LazyTreeNode;
	return new NodeClass(context, cursor.type, cursor, anchorNode, anchor, schema);
}

function cleanupTree(anchor: AnchorNode): void {
	const cached =
		anchor.slots.get(flexTreeSlot) ?? fail(0xb13 /* tree should only be cleaned up once */);
	assert(cached instanceof LazyTreeNode, 0x92d /* Expected LazyTreeNode */);
	cached[disposeSymbol]();
}

/**
 * Lazy implementation of {@link FlexTreeNode}.
 * @remarks
 * Node implementations capture schema-dependent behavior.
 * See {@link Context} for the schema changes that can preserve wrappers and those that require invalidation.
 */
export class LazyTreeNode extends LazyEntity<Anchor> implements HydratedFlexTreeNode {
	public get [flexTreeMarker](): FlexTreeEntityKind.Node {
		return FlexTreeEntityKind.Node;
	}

	// Using JS private here prevents it from showing up as a enumerable own property, or conflicting with struct fields.
	readonly #removeDeleteCallback: () => void;
	private readonly storedSchema: TreeNodeStoredSchema;

	/**
	 * Node-owned field storage, read directly by cache lookups.
	 * @remarks
	 * Fixed-field nodes retain wrappers until disposal because those wrappers own cursors,
	 * anchors, and lifetime registrations.
	 * {@link LazyMapNode} instead caches only populated fields and evicts them when they become empty.
	 * The Map is allocated on demand, so leaves and unboxed field reads do not allocate one.
	 */
	public fieldCache: Map<FieldKey, FlexTreeField> | undefined;

	/**
	 * Creates a wrapper for an existing node in the context's forest.
	 * @param context - Owns the wrapper's lifetime and supplies the forest, stored schema, and editing services.
	 * @param type - The node's stored type identifier. Must equal `cursor.type`.
	 * @param cursor - A cursor from the context's forest, positioned on the node in nodes mode.
	 * The wrapper forks this cursor; the caller retains ownership of the supplied cursor.
	 * @param anchorNode - The anchor-set node for the same node as `cursor` and `anchor`.
	 * Its {@link flexTreeSlot} must not already contain a wrapper.
	 * @param anchor - An owned anchor for the node in the context's forest.
	 * Ownership transfers to this wrapper, which forgets the anchor when disposed.
	 * @param storedSchema - The current stored schema for `type`, as obtained from `context.schema.nodeSchema`.
	 * Supply it when the caller has already resolved it, such as when selecting the node implementation,
	 * to avoid a second lookup. Omit it to have the constructor perform that lookup.
	 * This is not a schema override: it must describe the same type under the context's current schema
	 * and match the selected implementation's storage policy.
	 * The wrapper retains this schema rather than refreshing it after schema changes; see {@link Context} for invalidation requirements.
	 * @remarks
	 * Prefer {@link getOrCreateHydratedFlexTreeNode}, which reuses existing wrappers and selects the schema-dependent implementation.
	 */
	public constructor(
		context: Context,
		public readonly type: TreeNodeSchemaIdentifier,
		cursor: ITreeSubscriptionCursor,
		public readonly anchorNode: AnchorNode,
		anchor: Anchor,
		storedSchema?: TreeNodeStoredSchema,
	) {
		super(context, cursor, anchor);
		this.storedSchema =
			storedSchema ??
			context.schema.nodeSchema.get(this.type) ??
			fail(0xb14 /* missing schema */);
		assert(cursor.mode === CursorLocationType.Nodes, 0x783 /* must be in nodes mode */);
		anchorNode.slots.set(flexTreeSlot, this);
		this.#removeDeleteCallback = anchorNode.events.on("afterDestroy", cleanupTree);
	}

	public isHydrated(): this is HydratedFlexTreeNode {
		return true;
	}

	protected override tryMoveCursorToAnchor(
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.checkout.forest.tryMoveCursorToNode(this.anchor, cursor);
	}

	protected override forgetAnchor(): void {
		// This type unconditionally has an anchor, so `forgetAnchor` is always called and cleanup can be done here:
		// After this point this node will not be usable,
		// so remove it from the anchor incase a different context (or the same context later) uses this AnchorSet.
		this.fieldCache = undefined;
		this.anchorNode.slots.delete(flexTreeSlot);
		this.#removeDeleteCallback();
		this.context.checkout.forest.anchors.forget(this.anchor);
	}

	public get value(): Value {
		return this.cursor.value;
	}

	/**
	 * Gets or creates a field at the supplied cursor's location.
	 * The cursor must be in a field of this node, and the caller must validate this node's lifetime.
	 * @param cursor - A cursor in this node's forest, positioned on the requested field.
	 * @param createField - Creates a field which owns its navigation resources.
	 * Implementations whose fields borrow this node's resources do not call this factory.
	 */
	public getOrCreateField(
		cursor: ITreeSubscriptionCursor,
		createField: () => FlexTreeField,
	): FlexTreeField {
		return getOrCreate(
			(this.fieldCache ??= new Map<FieldKey, FlexTreeField>()),
			cursor.getFieldKey(),
			createField,
		);
	}

	public readonly fields: Pick<Map<FieldKey, FlexTreeField>, typeof Symbol.iterator | "get"> =
		{
			get: (key: FieldKey): FlexTreeField | undefined => this.tryGetField(key),
			[Symbol.iterator]: (): IterableIterator<[FieldKey, FlexTreeField]> => {
				currentObserver?.observeNodeFields(this);

				return mapCursorFields(this.cursor, (cursor) => {
					const key: FieldKey = cursor.getFieldKey();
					const pair: [FieldKey, FlexTreeField] = [
						key,
						makeField(this.context, this.storedSchema.getFieldSchema(key).kind, cursor),
					];
					return pair;
				}).values();
			},
		};

	public tryGetField(fieldKey: FieldKey): FlexTreeField | undefined {
		currentObserver?.observeNodeField(this, fieldKey);

		const schema = this.storedSchema.getFieldSchema(fieldKey);
		return inCursorField(this.cursor, fieldKey, (cursor) => {
			if (cursor.getFieldLength() === 0) {
				return undefined;
			}
			return getCachedField(this, fieldKey) ?? makeField(this.context, schema.kind, cursor);
		});
	}

	public getBoxed(key: FieldKey): FlexTreeField {
		currentObserver?.observeNodeField(this, key);

		this.ensureValidForAccess();
		const cached = getCachedField(this, key);
		if (cached !== undefined) {
			return cached;
		}

		const fieldSchema = this.storedSchema.getFieldSchema(key);
		return inCursorField(this.cursor, key, (cursor) => {
			return makeField(this.context, fieldSchema.kind, cursor);
		});
	}

	public getFieldContent(key: FieldKey): FlexTreeUnknownUnboxed | undefined {
		currentObserver?.observeNodeField(this, key);
		return inCursorField(this.cursor, key, (cursor) =>
			cursor.getFieldLength() === 0
				? undefined
				: inCursorNode(cursor, 0, (child) =>
						unboxedFlexNode(this.context, child, { parent: this.anchor, fieldKey: key }),
					),
		);
	}

	/**
	 * Gets an anchor-derived field path without recovering this node's cursor.
	 */
	public getFieldPath(key: FieldKey): { parent: AnchorNode; field: FieldKey } {
		this.ensureValidForAccess();
		return { parent: this.anchorNode, field: key };
	}

	public [Symbol.iterator](): IterableIterator<FlexTreeField> {
		return mapCursorFields(this.cursor, (cursor) =>
			makeField(
				this.context,
				this.storedSchema.getFieldSchema(cursor.getFieldKey()).kind,
				cursor,
			),
		).values();
	}

	public get parentField(): { readonly parent: FlexTreeField; readonly index: number } {
		currentObserver?.observeParentOf(this);

		this.ensureValidForAccess();
		const index = this.anchorNode.parentIndex;
		const key = this.anchorNode.parentField;
		const parent = this.anchorNode.parent?.slots.get(flexTreeSlot);
		if (parent !== undefined) {
			assert(parent.context === this.context, "Parent context must match child context");
			assert(parent instanceof LazyTreeNode, "Expected a lazy parent node");
			const cached = getCachedField(parent, key);
			if (cached !== undefined) {
				return { parent: cached, index };
			}
		}

		const cursor = this.cursor;
		assert(cursor.fieldIndex === index, 0x786 /* mismatched indexes */);
		cursor.exitNode();
		assert(key === cursor.getFieldKey(), 0x787 /* mismatched keys */);
		let fieldSchema: FieldKindIdentifier;

		// Check if the current node is in a detached sequence.
		if (this.anchorNode.parent === undefined) {
			// Parent field is a detached sequence, and thus needs special handling for its schema.
			// eslint-disable-next-line unicorn/prefer-ternary
			if (key === rootFieldKey) {
				fieldSchema = this.context.schema.rootFieldSchema.kind;
			} else {
				// All fields (in the flex tree API) have a schema.
				// Since currently there is no known schema for detached field other than the special default root:
				// give all other detached fields a schema of sequence of anything.
				// That schema is the only one that is safe since its the only field schema that allows any possible field content.
				//
				// TODO:
				// if any of the following are done this schema will need to be more specific:
				// 1. Editing APIs start exposing user created detached sequences.
				// 2. Remove (and its inverse) start working on subsequences or fields contents (like everything in a sequence or optional field) and not just single nodes.
				// 3. Possibly other unknown cases.
				// Additionally this approach makes it possible for a user to take a FlexTree node, get its parent, check its schema, down cast based on that, then edit that detached field (ex: removing the node in it).
				// This MIGHT work properly with existing merge resolution logic (it must keep client in sync and be unable to violate schema), but this either needs robust testing or to be explicitly banned (error before sending the op).
				// Issues like replacing a node in the a removed sequenced then undoing the remove could easily violate schema if not everything works exactly right!
				fieldSchema = FieldKinds.sequence.identifier;
			}
		} else {
			cursor.exitField();
			const parentType = cursor.type;
			cursor.enterField(key);
			const nodeSchema =
				this.context.schema.nodeSchema.get(parentType) ??
				fail(0xb15 /* requested schema that does not exist */);
			fieldSchema = nodeSchema.getFieldSchema(key).kind;
		}

		const proxifiedField = makeField(this.context, fieldSchema, cursor);
		cursor.enterNode(index);

		return { parent: proxifiedField, index };
	}

	public keys(): IterableIterator<FieldKey> {
		return mapCursorFields(this.cursor, (cursor) => cursor.getFieldKey()).values();
	}
}

/**
 * A map or record node which owns its bounded cache of resource-free field facades.
 * Empty fields are not cached, and batch cleanup examines only changed cached keys.
 * Retained fields remain usable after eviction because they navigate through this node.
 */
export class LazyMapNode extends LazyTreeNode {
	readonly #removeFieldChangeCallback: () => void;

	public constructor(...args: ConstructorParameters<typeof LazyTreeNode>) {
		super(...args);
		this.#removeFieldChangeCallback = this.anchorNode.events.on(
			"childrenChangedAfterBatch",
			({ changedFields }) => {
				const cache = this.fieldCache;
				if (cache === undefined) {
					return;
				}
				for (const key of changedFields) {
					if (
						cache.has(key) &&
						inCursorField(this.cursor, key, (cursor) => cursor.getFieldLength() === 0)
					) {
						cache.delete(key);
					}
				}
				if (cache.size === 0) {
					this.fieldCache = undefined;
				}
			},
		);
	}

	/**
	 * Gets a field facade at the supplied cursor's location.
	 * The cursor must be in a field of this node.
	 */
	public override getOrCreateField(cursor: ITreeSubscriptionCursor): FlexTreeField {
		const key = cursor.getFieldKey();
		const cached = this.fieldCache?.get(key);
		if (cached !== undefined) {
			return cached;
		}
		const field = new MapField(this, key);
		if (cursor.getFieldLength() !== 0) {
			(this.fieldCache ??= new Map<FieldKey, FlexTreeField>()).set(key, field);
		}
		return field;
	}

	protected override forgetAnchor(): void {
		this.#removeFieldChangeCallback();
		super.forgetAnchor();
	}
}
