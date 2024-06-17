/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by public types, but not part of the desired API surface.
// Note that this should only contain types which are `@public` since this is reexported as a namespace and our rollup generator does not filter that.

export type { _InlineTrick, FlattenKeys } from "./util/index.js";
export type { ApplyKind } from "./simple-tree/index.js";
export type { FlexListToUnion, ExtractItemType } from "./feature-libraries/index.js";
