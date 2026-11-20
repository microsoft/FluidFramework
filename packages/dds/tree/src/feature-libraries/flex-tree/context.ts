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
 * How many more entries than twice the number of cursor holders a {@link Context}'s list of them may have before it
 * drops the entries of entities which no longer hold one.
 */
const compactionSlack = 64;

/**
 * Implementation of `FlexTreeHydratedContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 *
 * A {@link FlexTreeContext} which is used to manage the cursors and anchors within the FlexTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 *
 * This context and the trees it produces observe the kinds of fields from the schema
 */
export class Context implements FlexTreeHydratedContext, IDisposable {
	/**
	 * Entities which held a cursor since the last edit, each listed once (see {@link LazyEntity.markUnlisted}).
	 * @remarks
	 * Every entity which holds a cursor (see {@link LazyEntity.holdsCursor}) is listed.
	 * An entity which gives up its cursor between edits (for example by being disposed) stays listed until the next edit, or until such entries outnumber the holders and the list is compacted,
	 * so giving one up costs no search.
	 */
	readonly #cursorHolders: LazyEntity[] = [];
	/**
	 * How many entities hold a cursor.
	 */
	#cursorHolderCount = 0;
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
				this.releaseCursors();
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
	 * Clears the cursor of every entity holding one, so the forest can be edited.
	 * @remarks
	 * Called before each edit. Entities move their cursors back when they next need them.
	 */
	public releaseCursors(): void {
		assert(this.disposed === false, 0x802 /* use after dispose */);
		const holders = this.#cursorHolders;
		for (const entity of holders) {
			entity.clearCursorForEdit();
		}
		holders.length = 0;
		this.#cursorHolderCount = 0;
	}

	/**
	 * How many entities hold a cursor.
	 */
	public get cursorHolderCount(): number {
		return this.#cursorHolderCount;
	}

	/**
	 * How many entries the list of cursor holders has, including those of entities disposed since the last edit.
	 * For diagnostics and tests.
	 */
	public get listedCursorHolderCount(): number {
		return this.#cursorHolders.length;
	}

	/**
	 * Records that `entity` holds a cursor, listing it unless `listed`, in which case it is already listed.
	 */
	public addCursorHolder(entity: LazyEntity, listed: boolean): void {
		this.#cursorHolderCount++;
		if (!listed) {
			this.#compactIfMostlyStale();
			this.#cursorHolders.push(entity);
		}
	}

	/**
	 * Records that a listed entity gave up its cursor between edits.
	 * @remarks
	 * Compacts the list once most of its entries no longer hold a cursor,
	 * so entities which are no longer used (for example nodes released by `TreeAlpha.release`) are not kept alive until the next edit.
	 */
	public removeCursorHolder(): void {
		this.#cursorHolderCount--;
		this.#compactIfMostlyStale();
	}

	/**
	 * Compacts the list of cursor holders if at least half its entries (beyond some slack) no longer hold a cursor.
	 * @remarks
	 * Each compaction at least halves the list, so the work is amortized over the cursors taken and given up since the last one.
	 */
	#compactIfMostlyStale(): void {
		if (this.#cursorHolders.length >= 2 * this.#cursorHolderCount + compactionSlack) {
			this.#compactCursorHolders();
		}
	}

	/**
	 * Drops the listed entities which no longer hold a cursor.
	 */
	#compactCursorHolders(): void {
		const holders = this.#cursorHolders;
		let kept = 0;
		for (const entity of holders) {
			if (entity.holdsCursor) {
				holders[kept++] = entity;
			} else {
				entity.markUnlisted();
			}
		}
		holders.length = kept;
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
		assert(this.#cursorHolderCount === 0, 0x774 /* free should remove all cursors */);
		for (const entity of this.#cursorHolders) {
			entity.markUnlisted();
		}
		this.#cursorHolders.length = 0;
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
