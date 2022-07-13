/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { strict as assert } from "assert";
import { exportFile } from "../exportFile";

describe("exportFile", () => {
    const folderRoot = `${__dirname}/../../src/test`;
    const outputFolder = `${folderRoot}/outputFolder`;
    const snapshotFolder = `${folderRoot}/localSnapshots`;

    beforeEach(() => {
        fs.mkdirSync(outputFolder);
    });

    afterEach(() => {
        fs.rmdirSync(outputFolder, { recursive: true });
    });

    fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
        it(`Output is correct ${snapshotFileName}`, async () => {
            await exportFile(
                `${__dirname}/sampleCodeLoader.js`,
                `${snapshotFolder}/${snapshotFileName}`,
                outputFolder,
                "sampleScenario",
                `${outputFolder}/telemetry.txt`);

            const resultFilePath = `${outputFolder}/result.txt`;
            assert(fs.existsSync(resultFilePath), "result file does not exist");

            const resultFileContent = fs.readFileSync(resultFilePath, { encoding: "utf-8" });
            assert.strictEqual(resultFileContent, "sample result", "result output is not correct");
        });
    });

    it("Run from command line", () => {
        // TODO
    });

    // TODO: add tests around improper args
    // TODO: potentially add tests for expecting certain telemetry logs
});
