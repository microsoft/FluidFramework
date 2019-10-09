/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

describe("Check Dependencies", () => {
    it("verify no fluid packages", async () => {
        // tslint:disable-next-line: non-literal-fs-path
        await verifyNoFluidPackages(path.join(__dirname, "/../../node_modules/"));
    });
});

// search all pulic fluid namespaces dirs, and node_module dirs
const searchFolders = ["@microsoft", "node_modules"];

const verifyNoFluidPackages = async (dir: string, visitedPkgDirs: string[] = []) => {
    let entries: string[];
    try {
        // tslint:disable-next-line: non-literal-fs-path
        entries = await fs.promises.readdir(dir);
    } catch {
        return;
    }
    const searches: Promise<void>[] = [];
    for (const entry of entries) {
        const entryDir = path.join(dir, entry);
        if (entry.indexOf("@fluid") !== -1) {
            assert.fail(entryDir);
        }
        // exclude files
        if (entry.indexOf(".") === -1) {
            if (searchFolders.indexOf(entry) !== -1) {
                searches.push(verifyNoFluidPackages(entryDir, visitedPkgDirs));
            } else if (visitedPkgDirs.indexOf(entry) === -1) {
                // only visit other folders once as these will either be packages
                //  or things like src, and dist that are not relevant
                visitedPkgDirs.push(entry);
                console.log(entry);
                searches.push(verifyNoFluidPackages(entryDir, visitedPkgDirs));
            }
        }
    }
    await Promise.all(searches);
};
