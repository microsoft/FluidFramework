/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import path from "path";

import { isJsonSnapshot, timeoutPromise, validateCommandLineArgs } from "../utils.js";

import { _dirname } from "./dirname.cjs";
// eslint-disable-next-line import/no-internal-modules
import { fluidExport } from "./sampleCodeLoaders/sampleCodeLoader.js";

describe("utils", () => {
	const snapshotFolder = path.join(_dirname, "../../src/test/localOdspSnapshots");

	describe("isJsonSnapshot", () => {
		const jsonSnapshots = new Set(["odspSnapshot1.json", "odspSnapshot2.json"]);

		fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
			it(snapshotFileName, () => {
				const filePath = path.join(snapshotFolder, snapshotFileName);
				const fileContent = fs.readFileSync(filePath);
				if (jsonSnapshots.has(snapshotFileName)) {
					assert.strictEqual(isJsonSnapshot(fileContent), true, "expect a JSON file");
				} else {
					assert.strictEqual(isJsonSnapshot(fileContent), false, "expect a non-JSON file");
				}
			});
		});
	});

	describe("validateCommandLineArgs", () => {
		describe("codeLoader and fluidFileConverter", () => {
			it("disallow providing both", async () => {
				const result = validateCommandLineArgs("value", fluidExport);
				assert.notStrictEqual(result, undefined, "expected an error");
			});

			it("disallow providing neither", () => {
				{
					const result = validateCommandLineArgs();
					assert.notStrictEqual(result, undefined, "expected an error");
				}
				{
					const result = validateCommandLineArgs("");
					assert.notStrictEqual(result, undefined, "expected an error");
				}
			});

			it("valid", async () => {
				{
					const result = validateCommandLineArgs("value");
					assert.strictEqual(result, undefined, `unexpected error [${result}]`);
				}
				{
					const result = validateCommandLineArgs(undefined, fluidExport);
					assert.strictEqual(result, undefined, `unexpected error [${result}]`);
				}
				{
					const result = validateCommandLineArgs("", fluidExport);
					assert.strictEqual(result, undefined, `unexpected error [${result}]`);
				}
			});
		});
	});

	describe("timeoutPromise", () => {
		it("resolves", async () => {
			await timeoutPromise((resolve) => resolve(), 100);
		});

		it("rejects on timeout", async () => {
			try {
				await timeoutPromise((resolve) => setTimeout(resolve, 100), 1);
				assert.fail("expect timeout exception");
			} catch (error) {
				assert((error as Error).message.includes("Timed out"), "unexpected exception");
			}
		});
	});
});
