/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartialSnapshotWithContents } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";

/**
 * Utility API to check if the type of snapshot contents is `IPartialSnapshotWithContents`.
 * @alpha
 * @param obj - obj whose type needs to be identified.
 */
export function instanceOfIPartialSnapshotWithContents(
	// eslint-disable-next-line @rushstack/no-new-null
	obj: ISnapshotTree | IPartialSnapshotWithContents | null | undefined,
): obj is IPartialSnapshotWithContents {
	return (
		obj !== null &&
		obj !== undefined &&
		"couldBePartialSnapshot" in obj &&
		obj.couldBePartialSnapshot === true
	);
}

/**
 * Utility API to check if the type of snapshot is `ISnapshotTree`.
 * @alpha
 * @param obj - obj whose type needs to be identified.
 */
export function instanceOfISnapshotTree(
	// eslint-disable-next-line @rushstack/no-new-null
	obj: ISnapshotTree | IPartialSnapshotWithContents | null | undefined,
): obj is ISnapshotTree {
	return obj !== null && obj !== undefined && !("couldBePartialSnapshot" in obj);
}
