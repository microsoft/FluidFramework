/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BTree } from "@tylerbu/sorted-btree-es6";
import type { NodeId } from "./modularChangeTypes.js";

/**
 * A field-agnostic set of changes to the elements of a field.
 */
export type GenericChangeset = BTree<number, NodeId>;
