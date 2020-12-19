/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// import { assert } from "@fluidframework/common-utils";

import fs from "fs";
import { IOdspSnapshot } from "../contracts";
import {
    convertOdspSnapshotToCompactSnapshot,
    convertOdspSnapshotToSnapsohtTreeAndBlobs,
    // convertCompactSnapshotToSnapshotTree,
} from "../snapshot";

describe("Snapshot test", () => {
    it("empty", async () => {
        const data = fs.readFileSync("input1.txt");

        /*
        for (let i = 0; i < 1000; i++) {
            const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
            convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
        }
        */

        const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
        const { snapshotTree, blobs } = convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
        const buffer = convertOdspSnapshotToCompactSnapshot(snapshotTree, blobs, odspSnapshot.ops);
        fs.writeFileSync("output1.bin", buffer.buffer);
        /*
        for (let i = 0; i < 1000; i++) {
            convertCompactSnapshotToSnapshotTree(buffer);
        }
        */
    }).timeout(1000000);
});
