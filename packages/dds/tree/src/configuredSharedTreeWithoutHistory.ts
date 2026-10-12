/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import { RevertibleSupportDisabled, type SharedTreeOptions } from "./shared-tree/index.js";
import type { ITree } from "./simple-tree/index.js";
import { configuredSharedTreeInternal, resolveOptions } from "./treeFactoryCore.js";

/**
 * Creates a SharedTree factory that excludes undo, redo, and historical-revision recovery support.
 *
 * @remarks
 * Changed events still fire, but do not provide revertible factories.
 * Explicit calls to history-recovery APIs throw a `UsageError`.
 *
 * Use this factory rather than passing {@link RevertibleSupportDisabled} to
 * `configuredSharedTreeAlpha` when the enabled implementation must be excluded from the bundle.
 *
 * @param options - SharedTree options other than revertible support.
 * @returns A SharedTree factory without history-recovery support.
 * @alpha
 */
export function configuredSharedTreeWithoutHistoryAlpha(
	options: Omit<SharedTreeOptions, "revertibleSupport"> = {},
): SharedObjectKind<ITree> {
	return configuredSharedTreeInternal(resolveOptions(options, RevertibleSupportDisabled));
}
