/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { createContainerAndExecute, exportFile } from "../exportFile";
// eslint-disable-next-line import/no-internal-modules
import { fluidExport } from "./sampleCodeLoaders/sampleCodeLoader";

describe("exportFile", () => {
    const folderRoot = path.join(__dirname, "../../src/test");
    const outputFolder = path.join(folderRoot, "outputFolder");
    const snapshotFolder = path.join(folderRoot, "localOdspSnapshots");
    const sampleCodeLoadersFolder = path.join(__dirname, "sampleCodeLoaders");

    beforeEach(() => {
        fs.mkdirSync(outputFolder);
    });

    afterEach(() => {
        fs.rmdirSync(outputFolder, { recursive: true });
    });

    fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
        describe(`Export using snapshot [${snapshotFileName}]`, () => {
            it("Output file is correct", async () => {
                const scenario = "sampleScenario";
                const exportFileResult = await exportFile(
                    path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                    path.join(snapshotFolder, snapshotFileName),
                    outputFolder,
                    scenario,
                    new MockLogger(),
                );

                assert(exportFileResult.success, "exportFile call was not successful");

                const resultFilePath = path.join(outputFolder, "result.txt");
                assert(fs.existsSync(resultFilePath), "result file does not exist");

                const resultFileContent = fs.readFileSync(resultFilePath, { encoding: "utf-8" });
                assert.strictEqual(resultFileContent, scenario, "result output is not correct");
            });

            it("Execution result is correct", async () => {
                const scenario = "sampleScenario";
                const result = await createContainerAndExecute(
                    fs.readFileSync(path.join(snapshotFolder, snapshotFileName), { encoding: "utf-8" }),
                    await fluidExport,
                    scenario,
                    new MockLogger(),
                );
                assert.deepStrictEqual(result, { "result.txt": scenario }, "result objects do not match");
            });
        });
    });

    describe("Validate arguments", () => {
        const mockLogger = new MockLogger();
        const snapshotFilePath = path.join(snapshotFolder, "odspSnapshot1.json");

        it("codeLoaderBundle", async () => {
            const result = await exportFile(
                path.join(sampleCodeLoadersFolder, "badCodeLoader.js"),
                snapshotFilePath,
                outputFolder,
                "scneario",
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.includes("ICodeLoaderBundle"),
                `error message does not contain "ICodeLoaderBundle" [${result.errorMessage}]`);
        });

        it("codeLoaderBundle.fluidExport", async () => {
            const result = await exportFile(
                path.join(sampleCodeLoadersFolder, "badFluidFileConverter.js"),
                snapshotFilePath,
                outputFolder,
                "scneario",
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.includes("IFluidFileConverter"),
                `error message does not contain "IFluidFileConverter" [${result.errorMessage}]`);
        });

        it("input file", async () => {
            const result = await exportFile(
                path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                "nonExistentFile.json",
                outputFolder,
                "scneario",
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.toLowerCase().includes("input file"),
                `error message does not contain "input file" [${result.errorMessage}]`);
        });

        it("output folder", async () => {
            const result = await exportFile(
                path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                snapshotFilePath,
                "nonExistentFolder",
                "scneario",
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.toLowerCase().includes("output folder"),
                `error message does not contain "output folder" [${result.errorMessage}]`);
        });

        it("scneario", async () => {
            const result = await exportFile(
                path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
                snapshotFilePath,
                outputFolder,
                "",
                mockLogger,
            );

            assert(!result.success, "result should not be successful");
            assert(result.errorMessage.toLowerCase().includes("scenario"),
                `error message does not contain "scenario" [${result.errorMessage}]`);
        });
    });
});
