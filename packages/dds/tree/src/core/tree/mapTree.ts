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
