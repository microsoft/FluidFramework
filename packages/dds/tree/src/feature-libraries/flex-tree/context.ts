/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert } from "@fluidframework/core-utils/internal";

import {
	type ForestEvents,
	type SchemaPolicy,
	type TreeStoredSchema,
	anchorSlot,
	moveToDetachedField,
} from "../../core/index.js";
import type { Listenable } from "@fluidframework/core-interfaces";
import { type IDisposable, disposeSymbol } from "../../util/index.js";
import type { NodeIdentifierManager } from "../node-identifier/index.js";

import type { FlexTreeField } from "./flexTreeTypes.js";
import type { LazyEntity } from "./lazyEntity.js";
import { makeField } from "./lazyField.js";
import type { ITreeCheckout } from "../../shared-tree/index.js";

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
	 * and its schema include all schema from the document.
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
 * A common context of a "forest" of FlexTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 */
export interface FlexTreeHydratedContext extends FlexTreeContext {
	readonly events: Listenable<ForestEvents>;
	/**
	 * Gets the root field of the tree.
	 */
	get root(): FlexTreeField;

	readonly nodeKeyManager: NodeIdentifierManager;

	/**
	 * The checkout object associated with this context.
	 */
	readonly checkout: ITreeCheckout;
}

/**
 * Creating multiple flex tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
 * This slot is used to detect if one already exists and error if creating a second.
 */
export const ContextSlot = anchorSlot<Context>();

/**
 * Implementation of `FlexTreeContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 *
 * A {@link FlexTreeContext} which is used to manage the cursors and anchors within the FlexTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export class Context implements FlexTreeHydratedContext, IDisposable {
	public readonly withCursors: Set<LazyEntity> = new Set();
	public readonly withAnchors: Set<LazyEntity> = new Set();

	private readonly eventUnregister: (() => void)[];
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
		this.eventUnregister = [
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
		for (const unregister of this.eventUnregister) {
			unregister();
		}
		this.eventUnregister.length = 0;

		const deleted = this.checkout.forest.anchors.slots.delete(ContextSlot);
		assert(deleted, 0x8c4 /* unexpected dispose */);
	}

	/**
	 * Release any cursors and anchors held by tree entities created in this context.
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

	public get root(): FlexTreeField {
		assert(this.disposed === false, 0x804 /* use after dispose */);
		if (this.lazyRootCache !== undefined) {
			return this.lazyRootCache;
		}

		const cursor = this.checkout.forest.allocateCursor("root");
		moveToDetachedField(this.checkout.forest, cursor);
		const field = makeField(this, this.schema.rootFieldSchema.kind, cursor);
		cursor.free();
		this.lazyRootCache = field;
		return field;
	}

	public get events(): Listenable<ForestEvents> {
		return this.checkout.forest.events;
	}
}
