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
} from "../snapshot";

describe("Snapshot test", () => {
    it("empty", async () => {
        const data = fs.readFileSync("input1.txt");
        const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
        const { snapshotTree, blobs } = convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
        const buffer = convertOdspSnapshotToCompactSnapshot(snapshotTree, blobs, odspSnapshot.ops);

        fs.writeFileSync("output1.bin", buffer.buffer);
    });
});
