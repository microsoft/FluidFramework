/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { createContainerAndExecute, parseBundleAndExportFile } from "../exportFile";
import { isJsonSnapshot } from "../utils";
// eslint-disable-next-line import/no-internal-modules
import { executeResult, fluidExport } from "./sampleCodeLoaders/sampleCodeLoader";

describe("exportFile", () => {
    const folderRoot = path.join(__dirname, "../../src/test");
    const outputFolder = path.join(folderRoot, "outputFolder");
    const outputFilePath = path.join(outputFolder, "result.txt");
    const snapshotFolder = path.join(folderRoot, "localOdspSnapshots");
    const sampleCodeLoadersFolder = path.join(__dirname, "sampleCodeLoaders");

    beforeEach(() => {
        fs.mkdirSync(outputFolder);
    });

    afterEach(() => {
        fs.rmdirSync(outputFolder, { recursive: true });
    });

    function getSnapshotFileContent(filePath: string): string | Uint8Array {
        if (isJsonSnapshot(filePath)) {
            return fs.readFileSync(filePath, { encoding: "utf-8" });
        } else {
            return fs.readFileSync(filePath);
        }
    }

    fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
        describe(`Export using snapshot [${snapshotFileName}]`, () => {
            it("Output file is correct", async () => {
                const exportFileResult = await parseBundleAndExportFile(
                    path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                    path.join(snapshotFolder, snapshotFileName),
                    outputFilePath,
                    new MockLogger(),
                );

                assert(exportFileResult.success, "exportFile call was not successful");

                assert(fs.existsSync(outputFilePath), "result file does not exist");

                const resultFileContent = fs.readFileSync(outputFilePath, { encoding: "utf-8" });
                assert.strictEqual(resultFileContent, executeResult, "result output is not correct");
            });

            it("Execution result is correct", async () => {
                const result = await createContainerAndExecute(
                    getSnapshotFileContent(path.join(snapshotFolder, snapshotFileName)),
                    await fluidExport,
                    new MockLogger(),
                );
                assert.deepStrictEqual(result, executeResult, "result objects do not match");
            });
        });
    });

    describe("Validate arguments", () => {
        const mockLogger = new MockLogger();
        const snapshotFilePath = path.join(snapshotFolder, "odspSnapshot1.json");

        it("codeLoaderBundle", async () => {
            const result = await parseBundleAndExportFile(
                path.join(sampleCodeLoadersFolder, "badCodeLoader.js"),
                snapshotFilePath,
                outputFilePath,
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.includes("ICodeLoaderBundle"),
                `error message does not contain "ICodeLoaderBundle" [${result.errorMessage}]`);
        });

        it("codeLoaderBundle.fluidExport", async () => {
            const result = await parseBundleAndExportFile(
                path.join(sampleCodeLoadersFolder, "badFluidFileConverter.js"),
                snapshotFilePath,
                outputFilePath,
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.includes("IFluidFileConverter"),
                `error message does not contain "IFluidFileConverter" [${result.errorMessage}]`);
        });

        it("input file", async () => {
            const result = await parseBundleAndExportFile(
                path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                "nonExistentFile.json",
                outputFilePath,
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.toLowerCase().includes("input file"),
                `error message does not contain "input file" [${result.errorMessage}]`);
        });

        it("output file", async () => {
            const result = await parseBundleAndExportFile(
                path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                snapshotFilePath,
                snapshotFilePath, // output file already exists
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.toLowerCase().includes("output file"),
                `error message does not contain "output file" [${result.errorMessage}]`);
        });
    });
});
