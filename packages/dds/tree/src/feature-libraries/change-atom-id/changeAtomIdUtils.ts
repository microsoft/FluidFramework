/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId } from "./changeAtomIdTypes";

/**
 * @returns true iff `a` and `b` are the same.
 */
export function areEqualChangeAtomIds(a: ChangeAtomId, b: ChangeAtomId): boolean {
	return a.localId === b.localId && a.revision === b.revision;
}
