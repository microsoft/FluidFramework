/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { generateStrings, LocationBase } from "./generateSharedStrings";

for (const s of generateStrings()) {
    const summaryTree = s.expected.getAttachSummary().summary;
    const snapshotTree = convertSummaryTreeToITree(summaryTree);
    if (s.snapshotIsNormalized || s.snapshotPath === "v1Intervals/withV1Intervals") {
        fs.writeFileSync(`${LocationBase}${s.snapshotPath}.json`, JSON.stringify(snapshotTree, undefined, 1));
    }
}
