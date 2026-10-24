/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import { assert, debugAssert } from "@fluidframework/core-utils/internal";

import {
	type DetachedField,
	type FieldKindIdentifier,
	type ForestEvents,
	type SchemaPolicy,
	type TreeStoredSchema,
	anchorSlot,
	moveToDetachedField,
	rootField,
} from "../../core/index.js";
import type { ITreeCheckout } from "../../shared-tree/index.js";
import { type IDisposable, disposeSymbol } from "../../util/index.js";
import type { NodeIdentifierManager } from "../node-identifier/index.js";

import type { FlexTreeField } from "./flexTreeTypes.js";
import type { LazyEntity } from "./lazyEntity.js";
import { makeField } from "./lazyField.js";

/**
 * Context for FlexTrees.
 */
export interface FlexTreeContext {
	/**
	 * Schema used within this context.
	 * All data must conform to these schema.
	 */
	readonly schema: TreeStoredSchema;

	/**
	 * SchemaPolicy used within this context.
	 */
	readonly schemaPolicy: SchemaPolicy;

	/**
	 * If true, this context is the canonical context instance for a given view,
	 * and its schema include all schemas from the document.
	 *
	 * If false, this context was created for use in a unhydrated tree, and the full document schema is unknown.
	 */
	isHydrated(): this is FlexTreeHydratedContext;

	/**
	 * If true, none of the nodes in this context can be used.
	 */
	isDisposed(): boolean;
}

/**
 * Subset of a hydrated context which can be used in more cases (like before the root and events are set up).
 */
export interface FlexTreeHydratedContextMinimal {
	/**
	 * The {@link NodeIdentifierManager} responsible for allocating and compressing identifiers for nodes in this context.
	 */
	readonly nodeKeyManager: NodeIdentifierManager;

	/**
	 * The checkout object associated with this context.
	 */
	readonly checkout: ITreeCheckout;
}

/**
 * A common context of a "forest" of FlexTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 */
export interface FlexTreeHydratedContext
	extends FlexTreeContext,
		FlexTreeHydratedContextMinimal {
	readonly events: Listenable<ForestEvents>;
	/**
	 * Gets the root field of the tree.
	 */
	get root(): FlexTreeField;
}

/**
 * Creating multiple flex tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
 * This slot is used to detect if one already exists and error if creating a second.
 */
export const ContextSlot = anchorSlot<Context>();

/**
 * Implementation of `FlexTreeHydratedContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 *
 * A {@link FlexTreeContext} which is used to manage the cursors and anchors within the FlexTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 *
 * Schema changes and wrapper lifetime:
 *
 * {@link Context.schema} reads the current stored schema, but existing node and field wrappers do not refresh their captured schema-dependent behavior.
 * This context does not subscribe to schema changes.
 * Callers currently clear or dispose it on every stored-schema change, before accessing its trees again.
 * Clearing cursors for a forest edit does not invalidate or refresh these wrappers.
 *
 * FlexTree can tolerate changes limited to allowed child-type sets or persisted metadata without rebuilding wrappers.
 * It can also tolerate adding schema definitions for previously unused node identifiers.
 * Replacing schema objects with equivalent definitions does not itself require invalidation.
 * This assumes the accessed content remains valid, its node types have schema definitions,
 * and the following constraints are preserved:
 *
 * - Each existing node wrapper retains its node schema for field-kind lookup.
 * The field kind must remain unchanged for every possible key on that node type, not just populated fields or cached wrappers.
 * For example, adding an optional object field changes its kind from forbidden to optional:
 * an existing node would still use the old schema even if that field had never been accessed.
 *
 * - Node implementation selection must remain valid.
 * Optional map fields, including records, use specialized node storage and resource-free field wrappers.
 * Switching between this policy and fixed-field storage requires invalidation;
 * the existing wrappers cannot change their cache ownership, cleanup subscriptions, or navigation strategy in place.
 *
 * - Existing field wrappers retain their field kind, implementation, and editor behavior.
 * Changes such as optional to sequence, or a change to the root field kind, require invalidating those wrappers.
 * Include retained root and detached-field wrappers when checking this constraint.
 *
 * Any conditional invalidation must account for retained removed or detached content, not just the in-document tree.
 * These are FlexTree implementation constraints, not permission to perform a schema edit.
 * A valid schema upgrade or continued view-schema compatibility alone does not establish that existing FlexTree wrappers can be retained.
 * If these FlexTree constraints are not preserved, call {@link Context.clear} or dispose the context before using trees under the new schema.
 * Higher-level views must also preserve their own schema-dependent state before skipping invalidation.
 */
export class Context implements FlexTreeHydratedContext, IDisposable {
	public readonly withCursors: Set<LazyEntity> = new Set();
	public readonly withAnchors: Set<LazyEntity> = new Set();

	/**
	 * Callbacks to run when disposing.
	 *
	 * Mainly event un-registration.
	 */
	private readonly onDispose: (() => void)[];
	private disposed = false;

	/**
	 * Stores the last accessed version of the root.
	 * @remarks
	 * Anything which can delete this field must clear it.
	 * Currently "clear" is the only case.
	 */
	private lazyRootCache: FlexTreeField | undefined;

	public constructor(
		public readonly schemaPolicy: SchemaPolicy,
		public readonly checkout: ITreeCheckout,
		/**
		 * An object which handles node key generation and conversion
		 */
		public readonly nodeKeyManager: NodeIdentifierManager,
	) {
		this.onDispose = [
			this.checkout.forest.events.on("beforeChange", () => {
				this.prepareForEdit();
			}),
		];

		assert(
			!this.checkout.forest.anchors.slots.has(ContextSlot),
			0x92b /* Cannot create second flex-tree from checkout */,
		);
		this.checkout.forest.anchors.slots.set(ContextSlot, this);
	}

	public isHydrated(): this is FlexTreeHydratedContext {
		debugAssert(() => !this.disposed || "Disposed");
		return true;
	}

	public isDisposed(): boolean {
		return this.disposed;
	}

	public get schema(): TreeStoredSchema {
		return this.checkout.storedSchema;
	}

	/**
	 * Called before editing.
	 * Clears all cursors so editing can proceed.
	 */
	private prepareForEdit(): void {
		assert(this.disposed === false, 0x802 /* use after dispose */);
		for (const target of this.withCursors) {
			target.prepareForEdit();
		}
		assert(this.withCursors.size === 0, 0x773 /* prepareForEdit should remove all cursors */);
	}

	public [disposeSymbol](): void {
		assert(this.disposed === false, 0x803 /* double dispose */);
		this.disposed = true;
		this.clear();
		for (const unregister of this.onDispose) {
			unregister();
		}
		this.onDispose.length = 0;

		const deleted = this.checkout.forest.anchors.slots.delete(ContextSlot);
		assert(deleted, 0x8c4 /* unexpected dispose */);
	}

	/**
	 * Release any cursors and anchors held by tree entities created in this context.
	 * @remarks
	 * Ensures the cashed references to those entities on the Anchors are also cleared.
	 * The tree entities are invalid to use after this, but the context may still be used
	 * to create new trees starting from the root.
	 */
	public clear(): void {
		for (const target of this.withAnchors) {
			target[disposeSymbol]();
		}
		this.lazyRootCache = undefined;
		assert(this.withCursors.size === 0, 0x774 /* free should remove all cursors */);
		assert(this.withAnchors.size === 0, 0x775 /* free should remove all anchors */);
	}

	/**
	 * Gets the root field of the tree.
	 * @remarks
	 * This is a cached value: it should not be disposed by the accessor.
	 * Like all other fields from this context, it will become invalid to use after {@link clear} is called or the {@link disposeSymbol} method is called.
	 */
	public get root(): FlexTreeField {
		assert(this.disposed === false, 0x804 /* use after dispose */);

		this.lazyRootCache ??= this.detachedField(rootField, this.schema.rootFieldSchema.kind);
		return this.lazyRootCache;
	}

	/**
	 * Returns a new {@link FlexTreeField} that will live as long as the caller allows up to the next call to {@link clear} or disposal of the context.
	 * @remarks
	 * Due to limited support for detached fields, not all operations are supported.
	 * Additionally if the detached field's content is deleted, the field will become out of schema if it is required: it must not be used after that point.
	 */
	public detachedField(key: DetachedField, schema: FieldKindIdentifier): FlexTreeField {
		assert(this.disposed === false, 0xb9c /* use after dispose */);

		const cursor = this.checkout.forest.allocateCursor("root");
		moveToDetachedField(this.checkout.forest, cursor, key);
		const field = makeField(this, schema, cursor);
		cursor.free();
		return field;
	}

	public get events(): Listenable<ForestEvents> {
		return this.checkout.forest.events;
	}
}
