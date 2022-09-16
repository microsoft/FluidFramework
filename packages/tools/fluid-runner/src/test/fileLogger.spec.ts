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
import {
    getTelemetryFileValidationError,
    IFileLogger,
    OutputFormat,
    validateAndParseTelemetryOptions,
} from "../logger/fileLogger";
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
            const logger = new JSONFileLogger(telemetryFile, 50, { extraProp1: "value1", extraProp2: "value2" });
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

    describe("validation", () => {
        describe("telemetry file", () => {
            it("empty", () => {
                const result = getTelemetryFileValidationError("");
                assert(result !== undefined, "expected an error");
                assert(result.toLowerCase().includes("telemetry file"),
                    `error message does not contain "telemetry file" [${result}]`);
            });

            it("file already exists", () => {
                const result = getTelemetryFileValidationError(path.join(expectedOutputFolder, "expectedOutput1.json"));
                assert(result !== undefined, "expected an error");
                assert(result.toLowerCase().includes("telemetry file"),
                    `error message does not contain "telemetry file" [${result}]`);
            });

            it("valid", () => {
                const result = getTelemetryFileValidationError(telemetryFile);
                assert(result === undefined, `unexpected error [${result}]`);
            });
        });

        describe("telemetry options", () => {
            it("empty arguments", () => {
                {
                    const result = validateAndParseTelemetryOptions("", "");
                    if (!result.success) {
                        assert.fail(`unexpected error [${result.error}]`);
                    }
                }
                {
                    const result = validateAndParseTelemetryOptions();
                    if (!result.success) {
                        assert.fail(`unexpected error [${result.error}]`);
                    }
                }
            });

            it("invalid format", () => {
                for (const format of [" CSV", "csv", "HTML"]) {
                    const result = validateAndParseTelemetryOptions(format);
                    assert(!result.success, `expected invalid format [${format}]`);
                    assert(result.error.toLowerCase().includes("telemetry format"),
                        `error message does not contain "telemetry format" [${result.error}]`);
                }
            });

            it("valid", () => {
                {
                    const result = validateAndParseTelemetryOptions("CSV", "prop1=value1 prop2=value2");
                    if (!result.success) {
                        assert.fail(`unexpected error [${result.error}]`);
                    }
                    const telemetryOptions = result.telemetryOptions;
                    assert.strictEqual(telemetryOptions.outputFormat, OutputFormat.CSV, "expected CSV format");
                    assert.deepStrictEqual(telemetryOptions.defaultProps, { prop1: "value1", prop2: "value2" });
                }
                {
                    const result = validateAndParseTelemetryOptions("JSON", "prop1=value1 prop2=value2");
                    if (!result.success) {
                        assert.fail(`unexpected error [${result.error}]`);
                    }
                    const telemetryOptions = result.telemetryOptions;
                    assert.strictEqual(telemetryOptions.outputFormat, OutputFormat.JSON, "expected JSON format");
                    assert.deepStrictEqual(telemetryOptions.defaultProps, { prop1: "value1", prop2: "value2" });
                }
            });

            describe("default props", () => {
                it("missing =", () => {
                    const result = validateAndParseTelemetryOptions(undefined, "prop1:value1 prop2:value2");
                    assert(!result.success, `expected invalid properties`);
                    assert(result.error.toLowerCase().includes("property"),
                        `error message does not contain "property" [${result.error}]`);
                });

                it("missing value of property", () => {
                    const result = validateAndParseTelemetryOptions(undefined, "prop1= ");
                    assert(!result.success, `expected invalid properties`);
                    assert(result.error.toLowerCase().includes("property"),
                        `error message does not contain "property" [${result.error}]`);
                });

                it("property value contains =", () => {
                    const result = validateAndParseTelemetryOptions(undefined, "prop1==");
                    assert(!result.success, `expected invalid properties`);
                    assert(result.error.toLowerCase().includes("property"),
                        `error message does not contain "property" [${result.error}]`);
                });

                it("multiple whitespace separators", () => {
                    const result = validateAndParseTelemetryOptions(undefined, "    prop1=value1    prop2=value2 ");
                    if (!result.success) {
                        assert.fail(`unexpected error [${result.error}]`);
                    }
                    assert.deepStrictEqual(result.telemetryOptions.defaultProps, { prop1: "value1", prop2: "value2" });
                });
            });
        });
    });
});
