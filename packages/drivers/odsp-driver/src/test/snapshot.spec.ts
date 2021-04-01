/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import fs from "fs";
import { strict as assert } from "assert";
import { IOdspSnapshot, IBlob } from "../contracts";

import {
    convertOdspSnapshotToSnapsohtTreeAndBlobs,
    convertOdspSnapshotToCompactSnapshot,
    // dedupBlobs,
    convertCompactSnapshotToSnapshotTree,
    unpackIBlobs,
} from "../snapshot";

function convertToCompact() {
    const data = fs.readFileSync("input1.txt");

    const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
    const { tree, blobs } = convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
    const blobs2 = unpackIBlobs(blobs);
    // blobs2 = await dedupBlobs(snapshotTree, blobs2);
    // blobs2 = shortenBlobIds(snapshotTree, blobs2);
    const buffer = convertOdspSnapshotToCompactSnapshot(tree, blobs2, odspSnapshot.ops);
    return buffer;
}

describe("Snapshot test", () => {
    // 46 seconds. 36 without decoding base64 (not holding memory)
    // 2.6 Gb memory peak using 500 iterations and holding to all trees & blobs
    // Runs out of memory (consuming over 4GB) using 1000 iterations and holding to all trees & blobs
    it.skip("Speed original", async () => {
        const data = fs.readFileSync("input1.txt");

        const holder: any[] = [];
        for (let i = 0; i < 500; i++) {
            const odspSnapshot: IOdspSnapshot = JSON.parse(data.toString("utf-8"));
            const { tree, blobs } = convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot);
            let blobs2: Map<string, IBlob | ArrayBuffer> = blobs;
            blobs2 = unpackIBlobs(blobs2);
            holder.push(tree, blobs2);
        }
    }).timeout(1000000);

    it("Round-trip", async () => {
        const buffer = convertToCompact();
        fs.writeFileSync("output1.bin", buffer.buffer);

        const { tree, blobs, ops } = convertCompactSnapshotToSnapshotTree(buffer);
        const buffer2 = convertOdspSnapshotToCompactSnapshot(tree, blobs, ops);

        assert.equal(buffer.length, buffer2.length);
        for (let i = 0; i < buffer.length; i++) {
            assert(buffer[i] === buffer2[i]);
        }
    });

    // 17 seconds (not holding memory)
    // 1.2 Gb memory peak using 500 iterations and holding to all trees & blobs
    // 2 GB memory peak using 1000 iterations and holding to all trees & blobs
    it.skip("Speed test", async () => {
        // const buffer = new ReadBuffer(fs.readFileSync("output1.bin"));
        const buffer = convertToCompact();

        const holder: any[] = [];
        for (let i = 0; i < 1000; i++) {
            const { tree, blobs } = convertCompactSnapshotToSnapshotTree(buffer);
            holder.push(tree, blobs);
            buffer.reset();
        }
    }).timeout(1000000);
});
