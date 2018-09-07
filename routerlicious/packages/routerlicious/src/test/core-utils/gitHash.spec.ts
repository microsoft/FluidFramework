import { gitHashFile } from "@prague/utils";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

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

describe("Core-Utils", () => {
    // Expected hashes are from git hash-object file...
    // Make sure the hash is of the file and not of an LFS stub
    describe("#gitHashFile", () => {
        it("Windows ICON should Hash", async () => {
            const p = path.join(__dirname, "../../../public/favicon.ico");
            const file = await getFileContents(p);
            const expectedHash = "bfe873eb228f98720fe0ed18c638daa13906958f";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("AKA PDF should Hash", async () => {
            const p = path.join(__dirname, "../../../public/images/aka.pdf");
            const file = await getFileContents(p);
            const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("Clippy GIF should Hash", async () => {
            const p = path.join(__dirname, "../../../public/images/clippy.gif");
            const file = await getFileContents(p);
            const expectedHash = "3ce319dee60ec493f93c7e1ac4c97470b10707fd";
            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });
    });
});
