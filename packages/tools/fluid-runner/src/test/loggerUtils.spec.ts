/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { strict as assert } from "assert";
/* eslint-disable import/no-internal-modules */
import { OutputFormat } from "../logger/fileLogger";
import { getTelemetryFileValidationError, validateAndParseTelemetryOptions } from "../logger/loggerUtils";
/* eslint-enable import/no-internal-modules */

describe("logger utils", () => {
    const folderRoot = path.join(__dirname, "../../src/test");
    const telemetryFile = path.join(folderRoot, "outputFolder", "telemetryFile.txt");
    const expectedOutputFolder = path.join(folderRoot, "telemetryExpectedOutputs");

    describe("telemetry file validation", () => {
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

    describe("telemetry options validation", () => {
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
                const result = validateAndParseTelemetryOptions("CSV", "prop1=value1,prop2=value2");
                if (!result.success) {
                    assert.fail(`unexpected error [${result.error}]`);
                }
                const telemetryOptions = result.telemetryOptions;
                assert.strictEqual(telemetryOptions.outputFormat, OutputFormat.CSV, "expected CSV format");
                assert.deepStrictEqual(telemetryOptions.defaultProps, { prop1: "value1", prop2: "value2" });
            }
            {
                const result = validateAndParseTelemetryOptions("JSON", "prop1=value1,prop2=value2");
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
                const result = validateAndParseTelemetryOptions(undefined, "prop1=,prop2=value2");
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

            it("multiple whitespace", () => {
                const result = validateAndParseTelemetryOptions(undefined, "    prop1=value1  ,  prop2=value2 ");
                if (!result.success) {
                    assert.fail(`unexpected error [${result.error}]`);
                }
                assert.deepStrictEqual(result.telemetryOptions.defaultProps,
                    { "    prop1": "value1  ", "  prop2": "value2 " });
            });
        });
    });
});
