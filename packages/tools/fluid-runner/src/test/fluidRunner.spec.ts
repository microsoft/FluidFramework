/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { spawnSync } from "child_process";

describe("fluid-runner from command line", () => {
    const command = path.join(__dirname, "../../bin/fluid-runner");

    describe("exportFile", () => {
        const codeLoader = path.join(__dirname, "sampleCodeLoaders", "sampleCodeLoader.js");
        const folderRoot = path.join(__dirname, "../../src/test");
        const snapshot = path.join(folderRoot, "localOdspSnapshots", "odspSnapshot2.json");
        const outputFolder = path.join(folderRoot, "outputFolder");
        const outputFilePath = path.join(outputFolder, "result.txt");
        const telemetryFile = path.join(outputFolder, "telemetryFile.txt");

        beforeEach(() => {
            fs.mkdirSync(outputFolder);
        });

        afterEach(() => {
            fs.rmdirSync(outputFolder, { recursive: true });
        });

        it("Process exits with code 0 when successful", () => {
            const exportFile = spawnSync("node", [
                command,
                "exportFile",
                `--codeLoader=${codeLoader}`,
                `--inputFile=${snapshot}`,
                `--outputFile=${outputFilePath}`,
                `--telemetryFile=${telemetryFile}`,
            ], { encoding: "utf-8" });

            assert.strictEqual(exportFile.status, 0,
                `Process was not exited with code 0. Error: [${exportFile.stderr}]`);
        });

        it("Process exits with code 1 when an error occurs", () => {
            const exportFile = spawnSync("node", [
                command,
                "exportFile",
                `--codeLoader=${codeLoader}`,
                `--inputFile=${snapshot}`,
                `--outputFile=${outputFilePath}`,
                "--telemetryFile=\"\"", // Empty telemetryFile is not allowed
            ], { encoding: "utf-8" });

            assert.strictEqual(exportFile.status, 1,
                `Process was not exited with code 1. Error: [${exportFile.stderr}]`);
            assert.notStrictEqual(exportFile.stderr, "", "Expect some error output");
        });

        it("Process writes to telemetry file", () => {
            assert(!fs.existsSync(telemetryFile), "Telemetry file should not yet exist");

            spawnSync("node", [
                command,
                "exportFile",
                `--codeLoader=${codeLoader}`,
                `--inputFile=${snapshot}`,
                `--outputFile=${outputFilePath}`,
                `--telemetryFile=${telemetryFile}`,
            ]);

            assert.notStrictEqual(fs.statSync(telemetryFile).size, 0,
                "Expect some content to be written to telemetry file");
        });

        it("Produces some output result file", () => {
            assert(!fs.existsSync(outputFilePath), "Result file should not yet exist");

            spawnSync("node", [
                command,
                "exportFile",
                `--codeLoader=${codeLoader}`,
                `--inputFile=${snapshot}`,
                `--outputFile=${outputFilePath}`,
                `--telemetryFile=${telemetryFile}`,
            ]);

            assert.notStrictEqual(fs.statSync(outputFilePath).size, 0, "Expect some result file");
        });
    });
});
