/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";

/**
 * Utility API to check if the type of snapshot contents is `ISnapshot`.
 * @internal
 * @param obj - obj whose type needs to be identified.
 */
export function isInstanceOfISnapshot(
	obj: ISnapshotTree | ISnapshot | undefined,
): obj is ISnapshot {
	return obj !== undefined && "snapshotFormatV" in obj && obj.snapshotFormatV === 1;
}

/**
 * Utility API to return ISnapshotTree either from ISnapshot or ISnapshotTree itself.
 * @internal
 */
export function getSnapshotTree(tree: ISnapshotTree | ISnapshot): ISnapshotTree {
	return isInstanceOfISnapshot(tree) ? tree.snapshotTree : tree;
}
