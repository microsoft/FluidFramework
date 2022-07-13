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

    before(() => {
        fs.mkdirSync(outputFolder);
    });

    after(() => {
        fs.rmdirSync(outputFolder, { recursive: true });
    });

    it("Output is correct", async () => {
        await exportFile(
            `${__dirname}/sampleCodeLoader.js`,
            `${folderRoot}/localSnapshots/localSnapshot1.json`,
            outputFolder,
            "sampleScenario",
            `${outputFolder}/telemetry.txt`);

        const resultFilePath = `${outputFolder}/result.txt`;
        assert(fs.existsSync(resultFilePath), "result file does not exist");

        const resultFileContent = fs.readFileSync(resultFilePath, { encoding: "utf-8" });
        assert.strictEqual(resultFileContent, "sample result", "result output is not correct");
    });

    it("Run from command line", () => {
        // TODO
    });

    // TODO: add tests around improper args
});
