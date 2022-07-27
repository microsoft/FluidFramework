/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { createContainerAndExecute, exportFile } from "../exportFile";
import { fluidExport } from "./sampleCodeLoader";

describe("exportFile", () => {
    const folderRoot = path.join(__dirname, "../../src/test");
    const outputFolder = path.join(folderRoot, "outputFolder");
    const snapshotFolder = path.join(folderRoot, "localOdspSnapshots");

    fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
        describe(snapshotFileName, () => {
            beforeEach(() => {
                fs.mkdirSync(outputFolder);
            });

            afterEach(() => {
                fs.rmdirSync(outputFolder, { recursive: true });
            });

            it("Output file is correct", async () => {
                const scenario = "sampleScenario";
                const exportFileResult = await exportFile(
                    path.join(__dirname, "sampleCodeLoader.js"),
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

    it.skip("Run from command line", () => {
        // TODO
    });

    describe.skip("Validates arguments", () => {
        // TODO
        const mockLogger = new MockLogger();
        mockLogger.clear();
    });
});
