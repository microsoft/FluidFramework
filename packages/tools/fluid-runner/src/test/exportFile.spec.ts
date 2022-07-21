/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { exportFile } from "../exportFile";

describe("exportFile", () => {
    const folderRoot = path.join(__dirname, "../../src/test");
    const outputFolder = path.join(folderRoot, "outputFolder");
    const snapshotFolder = path.join(folderRoot, "localOdspSnapshots");

    beforeEach(() => {
        fs.mkdirSync(outputFolder);
    });

    afterEach(() => {
        fs.rmdirSync(outputFolder, { recursive: true });
    });

    fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
        it(`Output is correct ${snapshotFileName}`, async () => {
            await exportFile(
                path.join(__dirname, "sampleCodeLoader.js"),
                path.join(snapshotFolder, snapshotFileName),
                outputFolder,
                "sampleScenario",
                path.join(outputFolder, "telemetry.txt"),
            );

            const resultFilePath = path.join(outputFolder, "result.txt");
            assert(fs.existsSync(resultFilePath), "result file does not exist");

            const resultFileContent = fs.readFileSync(resultFilePath, { encoding: "utf-8" });
            assert.strictEqual(resultFileContent, "sample result", "result output is not correct");
        });
    });

    it("Run from command line", () => {
        // TODO
    });

    describe("Validates arguments", () => {
        // TODO
        const mockLogger = new MockLogger();
        mockLogger.clear();
    });

    // TODO: potentially add tests for expecting certain telemetry logs
});
