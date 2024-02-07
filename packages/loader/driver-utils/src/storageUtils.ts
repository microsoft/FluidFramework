/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshot } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";

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
