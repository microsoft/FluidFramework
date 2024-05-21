/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/driver-definitions";

export interface ISnapshotTreeVersion {
	id: string;
	snapshotTree: ISnapshotTree;
}
