/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartialSnapshotWithContents } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";

/**
 * Utility API to check if the type of snapshot contents is `IPartialSnapshotWithContents`.
 * @internal
 * @param obj - obj whose type needs to be identified.
 */
export function isPartialSnapshot(obj: ISnapshotTree): obj is IPartialSnapshotWithContents {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"partialSnapshot" in obj &&
		obj.partialSnapshot === true
	);
}

/**
 * Api to extract the contents which belongs to ISnapshotTree from IPartialSnapshotWithContents.
 * @internal
 * @param snapshot - snapshot from which ISnapshotTree needs to be extracted.
 * @returns - instance of ISnapshotTree
 */
export function extractISnapshotTreeFromPartialSnapshot(snapshot: ISnapshotTree): ISnapshotTree {
	if (isPartialSnapshot(snapshot)) {
		return {
			id: snapshot.id,
			blobs: snapshot.blobs,
			trees: snapshot.trees,
			unreferenced: snapshot.unreferenced,
		};
	}
	return snapshot;
}
