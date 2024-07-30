/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeValue } from "../../core/index.js";

export type TreeIndexNodes<TNode> = readonly [first: TNode, ...rest: TNode[]];

export interface TreeIndex<TKey extends TreeValue, TValue> extends ReadonlyMap<TKey, TValue> {}
