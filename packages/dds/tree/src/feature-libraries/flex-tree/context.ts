/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	FieldKey,
	ForestEvents,
	TreeFieldStoredSchema,
	anchorSlot,
	moveToDetachedField,
} from "../../core/index.js";
import { Listenable } from "../../events/index.js";
import { IDisposable, disposeSymbol } from "../../util/index.js";
import { FieldGenerator } from "../fieldGenerator.js";
import { NodeKeyManager } from "../node-key/index.js";
import { FlexTreeSchema } from "../typed-schema/index.js";

import { FlexTreeField } from "./flexTreeTypes.js";
import { LazyEntity, prepareForEditSymbol } from "./lazyEntity.js";
import { makeField } from "./lazyField.js";
import type { ITreeCheckout } from "../../shared-tree/index.js";

/**
 * A common context of a "forest" of FlexTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 * @internal
 */
export interface FlexTreeContext extends Listenable<ForestEvents> {
	/**
	 * Gets the root field of the tree.
	 */
	get root(): FlexTreeField;

	/**
	 * Schema used within this context.
	 * All data must conform to these schema.
	 */
	readonly schema: FlexTreeSchema;

	// TODO: Add more members:
	// - transaction APIs
	// - branching APIs

	readonly nodeKeyManager: NodeKeyManager;

	/**
	 * The checkout object associated with this context.
	 */
	readonly checkout: ITreeCheckout;
}

/**
 * Creating multiple flex tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
 * This slot is used to detect if one already exists and error if creating a second.
 *
 * TODO:
 * 1. API docs need to reflect this limitation or the limitation has to be removed.
 */
export const ContextSlot = anchorSlot<Context>();

/**
 * Implementation of `FlexTreeContext`.
 *
 * @remarks An editor is required to edit the FlexTree.
 */
export class Context implements FlexTreeContext, IDisposable {
	public readonly withCursors: Set<LazyEntity> = new Set();
	public readonly withAnchors: Set<LazyEntity> = new Set();

	private readonly eventUnregister: (() => void)[];
	private disposed = false;

	/**
	 * @param schema - Schema to use when working with the  tree.
	 * @param checkout - The checkout.
	 * @param nodeKeyManager - An object which handles node key generation and conversion
	 */
	public constructor(
		public readonly schema: FlexTreeSchema,
		public readonly checkout: ITreeCheckout,
		public readonly nodeKeyManager: NodeKeyManager,
	) {
		this.eventUnregister = [
			this.checkout.forest.on("beforeChange", () => {
				this.prepareForEdit();
			}),
		];

		assert(
			!this.checkout.forest.anchors.slots.has(ContextSlot),
			0x92b /* Cannot create second flex-tree from checkout */,
		);
		this.checkout.forest.anchors.slots.set(ContextSlot, this);
	}

	/**
	 * Called before editing.
	 * Clears all cursors so editing can proceed.
	 */
	private prepareForEdit(): void {
		assert(this.disposed === false, 0x802 /* use after dispose */);
		for (const target of this.withCursors) {
			target[prepareForEditSymbol]();
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
		assert(this.withCursors.size === 0, 0x774 /* free should remove all cursors */);
		assert(this.withAnchors.size === 0, 0x775 /* free should remove all anchors */);
	}

	public get root(): FlexTreeField {
		assert(this.disposed === false, 0x804 /* use after dispose */);
		const cursor = this.checkout.forest.allocateCursor("root");
		moveToDetachedField(this.checkout.forest, cursor);
		const field = makeField(this, this.schema.rootFieldSchema, cursor);
		cursor.free();
		return field;
	}

	public on<K extends keyof ForestEvents>(eventName: K, listener: ForestEvents[K]): () => void {
		return this.checkout.forest.on(eventName, listener);
	}

	/**
	 * FieldSource used to get a FieldGenerator to populate required fields during procedural contextual data generation.
	 */
	// TODO: Use this to automatically provide node keys where required.
	public fieldSource?(key: FieldKey, schema: TreeFieldStoredSchema): undefined | FieldGenerator;
}

/**
 * A simple API for a Forest to interact with the tree.
 *
 * @param forest - the Forest
 * @param editor - an editor that makes changes to the forest.
 * @param nodeKeyManager - an object which handles node key generation and conversion.
 * @returns {@link FlexTreeContext} which is used to manage the cursors and anchors within the FlexTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getTreeContext(
	schema: FlexTreeSchema,
	checkout: ITreeCheckout,
	nodeKeyManager: NodeKeyManager,
): Context {
	return new Context(schema, checkout, nodeKeyManager);
}
