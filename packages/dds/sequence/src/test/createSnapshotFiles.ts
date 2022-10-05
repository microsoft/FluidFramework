/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { generateStrings, LocationBase } from "./generateSharedStrings";

for (const { snapshotPath, expected, snapshotIsNormalized } of generateStrings()) {
    const summaryTree = expected.getAttachSummary().summary;
    const snapshotTree = convertSummaryTreeToITree(summaryTree);
    if (snapshotIsNormalized || snapshotPath === "v1Intervals/withV1Intervals") {
        fs.writeFileSync(`${LocationBase}${snapshotPath}.json`, JSON.stringify(snapshotTree, undefined, 1));
    }
}
