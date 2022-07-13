/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DetachedRange,
    FieldKey,
 } from "../tree";

/**
 * Path from a location in the tree upward.
 * UpPaths can be used with deduplicated upper parts to allow
 * working with paths localized to part of the tree without incurring
 * costs related to the depth of the local subtree.
 */
export interface UpPath {
    parent(): UpPath | DetachedRange;
    parentField(): FieldKey; // TODO: Type information, including when in DetachedRange.
    parentIndex(): number; // TODO: field index branded type?
}
