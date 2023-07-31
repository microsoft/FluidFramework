/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionSpaceCompressedId, StableId } from "@fluidframework/runtime-definitions";
import { Brand, Opaque, brand } from "../../util";
import { TreeSchemaIdentifier } from "../../core";

/**
 * A key which uniquely identifies a node in the tree within this session.
 * @remarks {@link LocalNodeKey}s must not be serialized and stored as data without first being converted into a {@link StableNodeKey}.
 * They are local to the current session and equivalent nodes in another session will not necessarily have the same {@link LocalNodeKey}.
 * However, they are otherwise preferential to use over {@link StableNodeKey}s as they are much smaller.
 * For example, they are more efficient than {@link StableNodeKey}s when used as keys in a map.
 * {@link LocalNodeKey}s may be compared or equated via {@link compareLocalNodeKeys}.
 * @alpha
 */
export type LocalNodeKey = Opaque<Brand<SessionSpaceCompressedId, "Local Node Key">>;

/**
 * A UUID which identifies a node in the tree.
 * This key is universally unique and stable forever; therefore it is safe to persist as data in a SharedTree or other DDS/database.
 * When not persisted or serialized, it is preferable to use a {@link LocalNodeKey} instead for better performance.
 * @alpha
 */
export type StableNodeKey = Brand<StableId, "Stable Node Key">;

/**
 * Compares two {@link LocalNodeKey}s.
 * All {@link LocalNodeKey}s retrieved from a single SharedTree client can be totally ordered using this comparator.
 * @param a - the first key to compare
 * @param b - the second key to compare
 * @returns `0` if `a` and `b` are the same key, otherwise `-1` if `a` is ordered before `b` or `1` if `a` is ordered after `b`.
 * @alpha
 */
export function compareLocalNodeKeys(a: LocalNodeKey, b: LocalNodeKey): -1 | 0 | 1 {
	return a === b ? 0 : a > b ? 1 : -1;
}

/**
 * The key for the special field for {@link LocalNodeKey}s,
 * which allows nodes to be given keys that can be used to find the nodes via the node key index.
 * @alpha
 * @privateRemarks TODO: Come up with a unified and collision-resistant naming schema for fields defined by the system.
 * For now, we'll use `__` to reduce the change of collision, since this is what other internal properties use in Fluid.
 */
export const nodeKeyFieldKey = "__n_id__";

/**
 * The TreeSchemaIdentifier for node keys.
 * @alpha
 * @privateRemarks TODO: Come up with a unified and collision-resistant naming schema for types defined by the system.
 * For now, we'll use `__` to reduce the change of collision, since this is what other internal properties use in Fluid.
 */
export const nodeKeyTreeIdentifier: TreeSchemaIdentifier = brand(nodeKeyFieldKey);
