/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { generateStrings, LocationBase } from "./generateSharedStrings";

for (const s of generateStrings()) {
    const summaryTree = s[1].summarize().summary;
    const snapshotTree = convertSummaryTreeToITree(summaryTree);
    fs.writeFileSync(`${LocationBase}${s[0]}.json`, JSON.stringify(snapshotTree, undefined, 1));
}
