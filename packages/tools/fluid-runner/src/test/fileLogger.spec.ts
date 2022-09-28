/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
/* eslint-disable import/no-internal-modules */
import { JSONFileLogger } from "../logger/jsonFileLogger";
import { CSVFileLogger } from "../logger/csvFileLogger";
import { IFileLogger } from "../logger/fileLogger";
/* eslint-enable import/no-internal-modules */

describe("fileLogger", () => {
    const folderRoot = path.join(__dirname, "../../src/test");
    const outputFolder = path.join(folderRoot, "outputFolder");
    const telemetryFile = path.join(outputFolder, "telemetryFile.txt");
    const expectedOutputFolder = path.join(folderRoot, "telemetryExpectedOutputs");

    function verifyOutput(expectedOutputFilePath: string) {
        // eslint-disable-next-line prefer-template
        const actualOutput = fs.readFileSync(telemetryFile, { encoding: "utf-8" }) + "\n";
        const expectedOutput = fs.readFileSync(expectedOutputFilePath, { encoding: "utf-8" });
        assert.strictEqual(actualOutput, expectedOutput, `Expected output was not correct [${expectedOutputFilePath}]`);
    }

    function sendTelemetry(logger: IFileLogger) {
        logger.send({ eventName: "event1", category: "category1", prop1: "value1" });
        logger.send({ eventName: "event2", category: "category1", prop2: "value2" });
        logger.send({ eventName: "event3", category: "category2", prop1: "value3" });
        logger.send({ eventName: "event4", category: "category2", prop2: "value4" });
    }

    beforeEach(() => {
        fs.mkdirSync(outputFolder);
    });

    afterEach(() => {
        fs.rmdirSync(outputFolder, { recursive: true });
    });

    describe("JSON FileLogger", () => {
        it("Correct format", async () => {
            const logger = new JSONFileLogger(telemetryFile, 50);
            sendTelemetry(logger);

            await logger.close();
            verifyOutput(path.join(expectedOutputFolder, "expectedOutput1.json"));
        });

        it("Adds default props", async () => {
            const logger = new JSONFileLogger(telemetryFile, 50, { extraProp1: "value1", extraProp2: 10.5 });
            sendTelemetry(logger);

            await logger.close();
            verifyOutput(path.join(expectedOutputFolder, "expectedOutput2.json"));
        });

        it("Is valid JSON", async () => {
            const logger = new JSONFileLogger(telemetryFile, 50);
            sendTelemetry(logger);

            await logger.close();
            const result = JSON.parse(fs.readFileSync(telemetryFile, { encoding: "utf-8" }));
            assert.strictEqual(result.length, 4, "Expected an array of length 4");
        });
    });

    describe("CSV FileLogger", () => {
        it("Correct format", async () => {
            const logger = new CSVFileLogger(telemetryFile, 50);
            sendTelemetry(logger);

            await logger.close();
            verifyOutput(path.join(expectedOutputFolder, "expectedOutput3.csv"));
        });

        it("Adds default props", async () => {
            const logger = new CSVFileLogger(telemetryFile, 50, { extraProp1: "value1", extraProp2: "value2" });
            sendTelemetry(logger);

            await logger.close();
            verifyOutput(path.join(expectedOutputFolder, "expectedOutput4.csv"));
        });
    });
});
