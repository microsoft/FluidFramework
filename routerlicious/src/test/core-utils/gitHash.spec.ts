import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { gitHashFile } from "../../core-utils";

async function getFileContents(p: string): Promise<Buffer> {

    return new Promise<Buffer>((resolve, reject) => {
        fs.readFile(p, (error, data) => {
            // Maybe add blob property bag?
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
}

describe("Core-Utils", () => {
    // Expected hashes are from git hash-object file
    describe("#gitHashFile", () => {
        it("Simple txt should Hash", async () => {
            const p = path.join(__dirname, "../../../public/literature/simple.txt");
            const file = await getFileContents(p);
            const expectedHash = "6769dd60bdf536a83c9353272157893043e9f7d0";

            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("Pride and Prejudice txt (larger charset) should Hash", async () => {
            const p = path.join(__dirname, "../../../public/literature/pp.txt");
            const file = await getFileContents(p);
            const expectedHash = "76508dbbe920a86c32dfc55db9267ba48b7fcc13";

            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        it("Bindy SVG should Hash", async () => {
            const p = path.join(__dirname, "../../../public/images/bindy.svg");
            const file = await getFileContents(p);
            const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";

            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

        // TODO sabroner: Make these tests succeed!
        /*
        it("Clippy GIF should Hash", async () => {
            const p = path.join(__dirname, "../../../public/images/clippy.gif");
            const file = await getFileContents(p);
            console.log(file.toString("utf-8"));

            const expectedHash = "7134ac1b12df94ff3f8d465fed36e1b191658b89";

            const hash = gitHashFile(file);

            assert.equal(hash, expectedHash);
        });

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
        */
    });
});
