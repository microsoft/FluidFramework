/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-len */

import fs from "fs";
import { strict as assert } from "assert";
import { performance } from "@fluidframework/common-utils";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser";
import { parseCompactSnapshotResponse } from "../compactSnapshotParser";
import { ReadBuffer } from "../ReadBufferUtils";

describe("Binary WireFormat perf", () => {
    it("Conversion test json", async () => {
        const jsonSnapshot = fs.readFileSync(
            `${__dirname}/../../src/test/SamplePerfFilesforFluid/mediumJson.fluid.json`,
            { encoding: "utf8" },
        );

        const start = performance.now();
        const result = convertOdspSnapshotToSnapshotTreeAndBlobs(JSON.parse(jsonSnapshot));
        const parseTime = performance.now() - start;
        console.log("Json medium snapshot parse time ", parseTime);
        assert(result.snapshotTree !== undefined, "snapshot tree should exist");
        assert(result.blobs !== undefined, "snapshot blobs should exist");
    });

    it("Conversion test binary format", async () => {
        const binarySnapshot = fs.readFileSync(
            `${__dirname}/../../src/test/SamplePerfFilesforFluid/medium.fluid.wireformat`,
        );

        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            const result = parseCompactSnapshotResponse(new ReadBuffer(binarySnapshot as Uint8Array));
            assert(result.snapshotTree !== undefined, "snapshot tree should exist");
            assert(result.blobs !== undefined, "snapshot blobs should exist");
        }

        const parseTime = performance.now() - start;
        console.log("Binary Format medium snapshot parse time ", parseTime);
    });
});
