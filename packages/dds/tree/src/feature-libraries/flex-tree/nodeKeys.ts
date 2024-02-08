/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalNodeKey, NodeKeyIndex, NodeKeyManager, StableNodeKey } from "../node-key/index.js";
import { FlexTreeObjectNode } from "./flexTreeTypes.js";

/**
 * A collection of utilities for managing {@link StableNodeKey}s.
 * A node key can be assigned to a node and allows that node to be easily retrieved from the tree at a later time. (see `nodeKey.map`).
 * @remarks {@link LocalNodeKey}s are put on {@link FlexTreeObjectNode}s via a special field.
 * A node with a node key in its schema must always have a node key.
 * @internal
 */
export interface NodeKeys {
	/**
	 * Create a new {@link LocalNodeKey} which can be used as the key for a node in the tree.
	 */
	generate(): LocalNodeKey;
	/**
	 * Convert the given {@link LocalNodeKey} into a UUID that can be serialized.
	 * @param key - the key to convert
	 */
	stabilize(key: LocalNodeKey): StableNodeKey;
	/**
	 * Convert a {@link StableNodeKey} back into its {@link LocalNodeKey} form.
	 * @param key - the key to convert
	 */
	localize(key: StableNodeKey): LocalNodeKey;
	/**
	 * A map of all {@link LocalNodeKey}s in the document to their corresponding nodes.
	 */
	readonly map: ReadonlyMap<LocalNodeKey, FlexTreeObjectNode>;
}

export class SimpleNodeKeys implements NodeKeys {
	public constructor(
		public readonly map: NodeKeyIndex,
		private readonly manager: NodeKeyManager,
	) {}
	public generate(): LocalNodeKey {
		return this.manager.generateLocalNodeKey();
	}
	public stabilize(key: LocalNodeKey): StableNodeKey {
		return this.manager.stabilizeNodeKey(key);
	}
	public localize(key: StableNodeKey): LocalNodeKey {
		return this.manager.localizeNodeKey(key);
	}
}
