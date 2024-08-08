/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey } from "../schema-stored/index.js";

import type { NodeData } from "./types.js";

/**
 * This module provides a simple in-memory tree format.
 */

/**
 * Simple in-memory tree representation based on Maps.
 * @remarks MapTrees should not store empty fields.
 */
export interface MapTree extends NodeData {
	readonly fields: ReadonlyMap<FieldKey, readonly MapTree[]>;
}

/**
 * A {@link MapTree} which is owned by a single reference, and therefore allowed to be mutated.
 *
 * @remarks
 * To ensure unexpected mutations, this object should have a single owner/context.
 * Though this type does implement MapTree, it should not be used as a MapTree while it can possibly be mutated.
 * If it is shared to other contexts, it should first be upcast to a {@link MapTree} and further mutations should be avoided.
 */
export interface ExclusiveMapTree extends NodeData, MapTree {
	fields: Map<FieldKey, ExclusiveMapTree[]>;
}
