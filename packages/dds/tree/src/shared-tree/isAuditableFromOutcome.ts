/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

/**
 * Determines whether a {@link SharedTreeChange} is auditable for HitL purposes
 * by inspecting the resulting state after the change is applied.
 *
 * Returns `false` if any of the following is true:
 * - The change contains more than one inner change.
 * - The change contains a schema change.
 * - The change contains a data change with violated constraints.
 *
 * Otherwise returns `true` (including for an empty change, which has nothing
 * a viewer of the post-apply state would be unable to see).
 *
 * @remarks
 * Tracked by ADO 56693. Not yet implemented; the body throws so test cases
 * targeting the eventual contract fail loudly until the implementation lands.
 */
export function isAuditableFromOutcome(change: SharedTreeChange): boolean {
	throw new Error("isAuditableFromOutcome is not implemented");
}
