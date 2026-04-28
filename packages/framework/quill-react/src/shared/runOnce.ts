/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MutableRefObject } from "react";

/**
 * Runs `fn` exactly when the shared `isUpdatingRef` is not already set, with the ref
 * pinned to `true` for the duration of the call. The `try`/`finally` ensures the flag
 * is cleared even if `fn` throws.
 *
 * @remarks
 * Used by editor views to prevent feedback loops between the editor (Quill / textarea)
 * and the tree: both directions of sync (tree to editor and editor to tree) share the
 * same flag. When a tree-to-editor handler runs through `runOnce`, any tree mutations
 * performed inside don't trigger a re-entrant call back into the same handler.
 *
 * @internal
 */
export function runOnce(isUpdatingRef: MutableRefObject<boolean>, fn: () => void): void {
	if (isUpdatingRef.current) return;
	isUpdatingRef.current = true;
	try {
		fn();
	} finally {
		isUpdatingRef.current = false;
	}
}
