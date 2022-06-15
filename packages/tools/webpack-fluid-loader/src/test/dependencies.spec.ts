/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";
import fs from "fs-extra";

describe("Check Dependencies", () => {
    it("verify no @fluid-internal packages in dependencies", async () => {
        await verifyNoFluidPackages(path.join(__dirname, "/../../node_modules"));
    });
});

// Store visited packages so we don't iterate them multiple times
const visitedPkgDirs: string[] = [];

const verifyNoFluidPackages = async (dir: string) => {
    const entries = await fs.promises.opendir(dir);
    const searches: Promise<void>[] = [];
    for await (const entry of entries) {
        // If there is a package.json we will look through it to extract information.
        if (entry.isFile() && entry.name === "package.json") {
            const fullPath = `${dir}/${entry.name}`;
            console.log(fullPath);
            const json = await fs.readJson(fullPath);
            if (json?.dependencies) {
                const dependencyKeys = Object.keys(json.dependencies);
                if (dependencyKeys?.includes("@fluid-internal")) {
                    assert.fail(fullPath);
                }
            }
        } else if (entry.isDirectory() && !visitedPkgDirs.includes(entry.name)) {
            visitedPkgDirs.push(entry.name);
            searches.push(verifyNoFluidPackages(`${dir}/${entry.name}`));
        }
    }
    await Promise.all(searches);
};
