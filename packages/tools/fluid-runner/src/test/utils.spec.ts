/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { isJsonSnapshot, validateCommandLineArgs } from "../utils";
// eslint-disable-next-line import/no-internal-modules
import { fluidExport } from "./sampleCodeLoaders/sampleCodeLoader";

describe("utils", () => {
    const snapshotFolder = path.join(__dirname, "../../src/test/localOdspSnapshots");

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
                const result = validateCommandLineArgs("value", await fluidExport);
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
                    const result = validateCommandLineArgs(undefined, await fluidExport);
                    assert.strictEqual(result, undefined, `unexpected error [${result}]`);
                }
                {
                    const result = validateCommandLineArgs("", await fluidExport);
                    assert.strictEqual(result, undefined, `unexpected error [${result}]`);
                }
            });
        });
    });
});
