/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNodeSchema } from "../typed-schema";
import { EditableTreeEvents } from "../untypedTree";

/**
 * Simple Tree types used by both {@link Tree} (and its related subtypes)
 * and the APIs in `proxies`.
 *
 * To expose more APIs via the {@link node} free function, they can be moved from editableTreeTypes.ts to here.
 */

/**
 * Part of a tree.
 * @alpha
 */
export interface TreeCore<out TSchema = unknown> {
	/**
	 * Schema for this entity.
	 * If well-formed, it must follow this schema.
	 */
	readonly schema: TSchema;
}

/**
 * A node in the {@link TreeCore}.
 * @alpha
 */
export interface TreeNodeCore extends TreeCore<TreeNodeSchema> {
	/**
	 * {@inheritDoc ISubscribable#on}
	 */
	on<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void;
}
