/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MutableRefObject } from "react";

/**
 * Runs `fn` if `isUpdatingRef.current` is `false`; returns without running otherwise.
 * While `fn` runs, the ref is set to `true`, then cleared on completion or on throw.
 *
 * @remarks
 * Editor views share one ref between their tree-to-editor and editor-to-tree sync paths,
 * so a mutation made by one direction doesn't re-enter the other.
 *
 * @internal
 */
export function runGuarded(isUpdatingRef: MutableRefObject<boolean>, fn: () => void): void {
	if (isUpdatingRef.current) return;
	isUpdatingRef.current = true;
	try {
		fn();
	} finally {
		isUpdatingRef.current = false;
	}
}
