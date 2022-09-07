/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { strict as assert } from "assert";
import { isJsonSnapshot } from "../utils";

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
});
