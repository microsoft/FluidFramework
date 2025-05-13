/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";

/* eslint-disable import/no-internal-modules */
import { OutputFormat } from "../logger/fileLogger.js";
import {
	createLogger,
	getTelemetryFileValidationError,
	validateAndParseTelemetryOptions,
} from "../logger/loggerUtils.js";
/* eslint-enable import/no-internal-modules */

import { _dirname } from "./dirname.cjs";

describe("logger utils", () => {
	const folderRoot = path.join(_dirname, "../../src/test");
	const telemetryFile = path.join(folderRoot, "outputFolder", "telemetryFile.txt");
	const expectedOutputFolder = path.join(folderRoot, "telemetryExpectedOutputs");

	describe("telemetry file validation", () => {
		it("empty", () => {
			const result = getTelemetryFileValidationError("");
			assert(result !== undefined, "expected an error");
			assert(
				result.toLowerCase().includes("telemetry file"),
				`error message does not contain "telemetry file" [${result}]`,
			);
		});

		it("file already exists", () => {
			const result = getTelemetryFileValidationError(
				path.join(expectedOutputFolder, "expectedOutput1.json"),
			);
			assert(result !== undefined, "expected an error");
			assert(
				result.toLowerCase().includes("telemetry file"),
				`error message does not contain "telemetry file" [${result}]`,
			);
		});

		it("valid", () => {
			const result = getTelemetryFileValidationError(telemetryFile);
			assert(result === undefined, `unexpected error [${result}]`);
		});
	});

	describe("telemetry options validation", () => {
		it("empty arguments", () => {
			{
				const result = validateAndParseTelemetryOptions("", []);
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
				assert(
					result.error.toLowerCase().includes("telemetry format"),
					`error message does not contain "telemetry format" [${result.error}]`,
				);
			}
		});

		it("valid", () => {
			const props = ["prop1", "value1", "prop2", 10.5];
			{
				const result = validateAndParseTelemetryOptions("CSV", props, -2);
				if (!result.success) {
					assert.fail(`unexpected error [${result.error}]`);
				}
				const telemetryOptions = result.telemetryOptions;
				assert.strictEqual(
					telemetryOptions.outputFormat,
					OutputFormat.CSV,
					"expected CSV format",
				);
				assert.deepStrictEqual(telemetryOptions.defaultProps, {
					prop1: "value1",
					prop2: 10.5,
				});
				assert.deepStrictEqual(telemetryOptions.eventsPerFlush, -2);
			}
			{
				const result = validateAndParseTelemetryOptions("JSON", props, -2);
				if (!result.success) {
					assert.fail(`unexpected error [${result.error}]`);
				}
				const telemetryOptions = result.telemetryOptions;
				assert.strictEqual(
					telemetryOptions.outputFormat,
					OutputFormat.JSON,
					"expected JSON format",
				);
				assert.deepStrictEqual(telemetryOptions.defaultProps, {
					prop1: "value1",
					prop2: 10.5,
				});
				assert.deepStrictEqual(telemetryOptions.eventsPerFlush, -2);
			}
		});

		describe("default props", () => {
			it("property name cannot be number", () => {
				const result = validateAndParseTelemetryOptions(undefined, [
					10.1,
					"value1",
					"prop2",
					10.5,
				]);
				assert(!result.success, `expected invalid properties`);
				assert(
					result.error.toLowerCase().includes("property"),
					`error message does not contain "property" [${result.error}]`,
				);
			});

			it("odd number of array values", () => {
				const result = validateAndParseTelemetryOptions(undefined, [
					"prop1",
					"value1",
					"prop2",
				]);
				assert(!result.success, `expected invalid properties`);
				assert(
					result.error.toLowerCase().includes("properties"),
					`error message does not contain "properties" [${result.error}]`,
				);
			});

			it("multiple whitespace", () => {
				const result = validateAndParseTelemetryOptions(undefined, ["    prop1", "value1  "]);
				if (!result.success) {
					assert.fail(`unexpected error [${result.error}]`);
				}
				assert.deepStrictEqual(result.telemetryOptions.defaultProps, {
					"    prop1": "value1  ",
				});
			});

			it("special characters", () => {
				const result = validateAndParseTelemetryOptions(undefined, ["prop1=aaa", 'aaa"bbb']);
				if (!result.success) {
					assert.fail(`unexpected error [${result.error}]`);
				}
				assert.deepStrictEqual(result.telemetryOptions.defaultProps, {
					"prop1=aaa": 'aaa"bbb',
				});
			});
		});

		it("invalid eventsPerFlush", () => {
			const result = validateAndParseTelemetryOptions(undefined, undefined, NaN);
			assert(!result.success, "expected invalid eventsPerFlush");
			assert(
				result.error.includes("eventsPerFlush"),
				`error message does not contain "eventsPerFlush" [${result.error}]`,
			);
		});
	});

	describe("createLogger", () => {
		[-1, 0, 1, 25].forEach((eventsPerFlush) => {
			it(`sets eventsPerFlush [${eventsPerFlush}] properly`, () => {
				const { fileLogger } = createLogger("fake/path", {
					outputFormat: OutputFormat.CSV,
					eventsPerFlush,
				});
				assert.strictEqual((fileLogger as any).eventsPerFlush, eventsPerFlush);
			});
		});
	});
});
