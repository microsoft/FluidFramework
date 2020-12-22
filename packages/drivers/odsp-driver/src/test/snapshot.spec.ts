/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// import { assert } from "@fluidframework/common-utils";

import fs from "fs";
import { assert } from "@fluidframework/common-utils";
import { IOdspSnapshot, IBlob } from "../contracts";

import {
    convertOdspSnapshotToSnapsohtTreeAndBlobs,
    convertOdspSnapshotToCompactSnapshot,
    // dedupBlobs,
    convertCompactSnapshotToSnapshotTree,
    unpackBlobs,
} from "../snapshot";

function convertToCompact() {
    const data = fs.readFileSync("input1.txt");

    const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
    const { snapshotTree, blobs } = convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
    let blobs2: Map<string, IBlob | Uint8Array> = blobs;
    blobs2 = unpackBlobs(blobs2);
    // blobs2 = await dedupBlobs(snapshotTree, blobs2);
    // blobs2 = shortenBlobIds(snapshotTree, blobs2);
    const buffer = convertOdspSnapshotToCompactSnapshot(snapshotTree, blobs2, odspSnapshot.ops);
    return buffer;
}

describe("Snapshot test", () => {
    // 46 seconds. 36 without decoding base64
    it.skip("Speed original", async () => {
        const data = fs.readFileSync("input1.txt");

        for (let i = 0; i < 1000; i++) {
            const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
            const { blobs } = convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
            let blobs2: Map<string, IBlob | Uint8Array> = blobs;
            blobs2 = unpackBlobs(blobs2);
        }
    }).timeout(1000000);

    it("Round-trip", async () => {
        const buffer = convertToCompact();
        // fs.writeFileSync("output1.bin", buffer.buffer);

        const { tree, blobs, ops } = convertCompactSnapshotToSnapshotTree(buffer);
        const buffer2 = convertOdspSnapshotToCompactSnapshot(tree, blobs, ops);

        assert(buffer.length === buffer2.length);
        for (let i = 0; i < buffer.length; i++) {
            assert(buffer[i] === buffer2[i]);
        }
    });

    // 17 seconds
    it.skip("Speed test", async () => {
        // const buffer = new ReadBuffer(fs.readFileSync("output1.bin"));
        const buffer = convertToCompact();

        for (let i = 0; i < 1000; i++) {
            convertCompactSnapshotToSnapshotTree(buffer);
            buffer.reset();
        }
    }).timeout(1000000);
});
