/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey } from "../schema-stored/index.js";

import type { NodeData } from "./types.js";

/**
 * This modules provides a simple in memory tree format.
 */

/**
 * Simple in memory tree representation based on Maps.
 * MapTrees should not store empty fields.
 * @internal
 */
export interface MapTree extends NodeData {
	readonly fields: ReadonlyMap<FieldKey, readonly MapTree[]>;
}

/**
 * {@link MapTree} which is owned by a single reference, and allowed to be mutated.
 *
 * @remarks
 * To not keep multiple references to a value with this type around to avoid unexpected mutations.
 * While this type does implement MapTree, it should not be used as a MapTree while it is being mutated.
 *
 * @internal
 */
export interface ExclusiveMapTree extends NodeData, MapTree {
	fields: Map<FieldKey, ExclusiveMapTree[]>;
}
