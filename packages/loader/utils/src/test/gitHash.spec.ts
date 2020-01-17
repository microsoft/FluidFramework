/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { gitHashFileAsync } from "..";

async function getFileContents(p: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        // Disabling due to being test utility method
        // tslint:disable-next-line:non-literal-fs-path
        fs.readFile(p, (error, data) => {
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
}

const dataDir = "../../src/test";

describe("Core-Utils", () => {
    // Expected hashes are from git hash-object file...
    // Make sure the hash is of the file and not of an LFS stub
    describe("#gitHashFileAsync", () => {
        it("SVG should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/bindy.svg`);
            const file = await getFileContents(p);
            const expectedHash = "9b8abd0b90324ffce0b6a9630e5c4301972c364ed9aeb7e7329e424a4ae8a630";
            const hash = await gitHashFileAsync(file);

            assert.equal(hash, expectedHash);
        });

        it("AKA PDF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/aka.pdf`);
            const file = await getFileContents(p);
            const expectedHash = "40f421df86a3d53366ca8df868f0c0d2f30853baf9402ffa28d808ce52d88856";
            const hash = await gitHashFileAsync(file);

            assert.equal(hash, expectedHash);
        });

        it("Grid GIF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/grid.gif`);
            const file = await getFileContents(p);
            const expectedHash = "40f421df86a3d53366ca8df868f0c0d2f30853baf9402ffa28d808ce52d88856";
            const hash = await gitHashFileAsync(file);

            assert.equal(hash, expectedHash);
        });
    });
});
