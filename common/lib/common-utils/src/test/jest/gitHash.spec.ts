/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import http from "http";
import * as HashNode from "../../hashFileNode";

async function getFileContents(p: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        fs.readFile(p, (error, data) => {
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
}

const dataDir = "../../../src/test/jest";

async function evaluateBrowserHash(page, file: Buffer): Promise<string> {
    // Navigate to the local test server so crypto is available
    await page.goto("http://localhost:8080", { waitUntil: "load", timeout: 0 });

    // Add the prefix for git hashing
    const size = file.byteLength;
    const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
    const prefixBuffer = Buffer.from(filePrefix, "utf-8");
    const hashBuffer = Buffer.concat([prefixBuffer, file], prefixBuffer.length + file.length);

    return page.evaluate(async (f) => {
        // Pass the string conversion into evaluate and re-encode it here because
        // Uint8Array is not directly jsonable
        const fileUint8 = Uint8Array.from(new window.TextEncoder().encode(f));

        // This is copied from hashFileBrowser's hashFile - puppeteer has issues
        // with calling crypto through page.exposeFunction but not directly
        const hash = await crypto.subtle.digest("SHA-1", fileUint8);
        const hashArray = new Uint8Array(hash);
        const hashHex = Array.prototype.map.call(hashArray, function(byte: number) {
            return byte.toString(16).padStart(2, "0");
        }).join("");
        return hashHex;
    }, hashBuffer.toString()) as Promise<string>;
}

describe("Common-Utils", () => {
    // crypto is only available in secure contexts (https pages) or localhost,
    // so start a basic server to make this available
    let server: http.Server;
    beforeAll(() => {
        server = http.createServer((req, res) => {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/plain");
            res.end("basic test server");
        });
        server.listen(8080, "localhost");
    });

    afterAll(() => {
        server?.close();
    });

    // Expected hashes are from git hash-object file...
    // Make sure the hash is of the file and not of an LFS stub
    describe("#gitHashFile", () => {
        test("XML should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/assets/book.xml`);
            const file = await getFileContents(p);
            const expectedHash = "64056b04956fb446b4014cb8d159d2e2494ed0fc";
            const hashNode = await HashNode.gitHashFile(file);
            const hashBrowser = await evaluateBrowserHash(page, file);

            expect(hashNode).toEqual(expectedHash);
            expect(hashBrowser).toEqual(expectedHash);
        });

        test("SVG should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/assets/bindy.svg`);
            const file = await getFileContents(p);
            const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
            const hashNode = await HashNode.gitHashFile(file);
            const hashBrowser = await evaluateBrowserHash(page, file);

            expect(hashNode).toEqual(expectedHash);
            expect(hashBrowser).toEqual(expectedHash);
        });

        test("AKA PDF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/assets/aka.pdf`);
            const file = await getFileContents(p);
            const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
            const hashNode = await HashNode.gitHashFile(file);

            expect(hashNode).toEqual(expectedHash);
            // Don't check browser hash here because there are issues
            // passing binary data into puppeteer's page.evaluate
        });

        test("Grid GIF should Hash", async () => {
            const p = path.join(__dirname, `${dataDir}/assets/grid.gif`);
            const file = await getFileContents(p);
            const expectedHash = "a7d63376bbcb05d0a6fa749594048c8ce6be23fb";
            const hashNode = await HashNode.gitHashFile(file);

            expect(hashNode).toEqual(expectedHash);
            // Don't check browser hash here because there are issues
            // passing binary data into puppeteer's page.evaluate
        });

        test("Hash is consistent", async () => {
            const p = path.join(__dirname, `${dataDir}/assets/bindy.svg`);
            const file = await getFileContents(p);

            const hash1Node = await HashNode.gitHashFile(file);
            const hash2Node = await HashNode.gitHashFile(file);
            expect(hash1Node).toEqual(hash2Node);

            const hash1Browser = await evaluateBrowserHash(page, file);
            const hash2Browser = await evaluateBrowserHash(page, file);
            expect(hash1Browser).toEqual(hash2Browser);
        });
    });
});
