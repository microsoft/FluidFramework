/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { generateStrings, generateTestStrings, LocationBase } from "./generateSharedStrings";

for (const s of generateStrings()) {
    const summaryTree = s[1].getAttachSummary().summary;
    const snapshotTree = convertSummaryTreeToITree(summaryTree);
    fs.writeFileSync(`${LocationBase}${s[0]}.json`, JSON.stringify(snapshotTree, undefined, 1));
}

for (const s of generateTestStrings()) {
    const summaryTree = s[1].getAttachSummary().summary;
    const snapshotTree = convertSummaryTreeToITree(summaryTree);
    fs.writeFileSync(`src/test/snapshots/OLD/${s[0]}.json`, JSON.stringify(snapshotTree, undefined, 1));
}
