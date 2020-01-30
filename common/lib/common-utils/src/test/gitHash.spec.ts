/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { gitHashFile, gitHashFileAsync } from "..";

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
            const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
            const hash = await gitHashFileAsync(file);

            assert.equal(hash, expectedHash);
        });

        it("AKA PDF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/aka.pdf`);
            const file = await getFileContents(p);
            const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
            const hash = await gitHashFileAsync(file);

            assert.equal(hash, expectedHash);
        });

        it("Grid GIF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/grid.gif`);
            const file = await getFileContents(p);
            const expectedHash = "a7d63376bbcb05d0a6fa749594048c8ce6be23fb";
            const hash = await gitHashFileAsync(file);

            assert.equal(hash, expectedHash);
        });

        it("Hash is consistent", async () => {
            const p = path.join(__dirname, `${dataDir}/images/bindy.svg`);
            const file = await getFileContents(p);
            const hash1 = await gitHashFileAsync(file);
            const hash2 = await gitHashFileAsync(file);

            assert.equal(hash1, hash2);
        });
    });

    describe("#gitHashFile", () => {
        it("File should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/images/bindy.svg`);
            const file = await getFileContents(p);
            const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("Hash should match async version", async () => {
            const p = path.join(__dirname, `${dataDir}/images/aka.pdf`);
            const file = await getFileContents(p);
            const hashSync = gitHashFile(file);
            const hashAsync = await gitHashFileAsync(file);

            assert.equal(hashSync, hashAsync);
        });
    });
});
