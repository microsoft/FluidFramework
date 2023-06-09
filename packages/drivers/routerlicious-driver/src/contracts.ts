/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/protocol-definitions";

/**
 * Normalized Whole Summary with decoded blobs and unflattened snapshot tree.
 */
export interface INormalizedWholeSummary {
	blobs: Map<string, ArrayBuffer>;
	snapshotTree: ISnapshotTree;
	sequenceNumber: number | undefined;
	id: string;
}
