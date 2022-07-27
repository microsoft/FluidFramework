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
                const exportFileResult = await exportFile(
                    path.join(__dirname, "sampleCodeLoader.js"),
                    path.join(snapshotFolder, snapshotFileName),
                    outputFolder,
                    "sampleScenario",
                    new MockLogger(),
                );

                assert(exportFileResult.success, "exportFile call was not successful");

                const resultFilePath = path.join(outputFolder, "result.txt");
                assert(fs.existsSync(resultFilePath), "result file does not exist");

                const resultFileContent = fs.readFileSync(resultFilePath, { encoding: "utf-8" });
                assert.strictEqual(resultFileContent, "sample result", "result output is not correct");
            });

            it("Execution result is correct", async () => {
                const result = await createContainerAndExecute(
                    fs.readFileSync(path.join(snapshotFolder, snapshotFileName), { encoding: "utf-8" }),
                    new MockLogger(),
                    await fluidExport,
                );
                assert.deepStrictEqual(result, { "result.txt": "sample result" }, "result objects do not match");
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
