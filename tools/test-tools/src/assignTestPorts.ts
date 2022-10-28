/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function main(): void {
    // Get the lerna output
    let lernaOutput;
    try {
        lernaOutput = JSON.parse(child_process.execSync("npx lerna list --all --json").toString());
        if (!Array.isArray(lernaOutput)) {
            // eslint-disable-next-line unicorn/prefer-type-error
            throw new Error("stdin input was not package array");
        }
    } catch (error) {
        console.error(error);
        process.exit(-1);
    }

    // Assign a unique port to each package
    const portMap: { [pkgName: string]: number; } = {};
    let port = 8081;
    // eslint-disable-next-line unicorn/no-array-for-each
    lernaOutput.forEach((pkg: { name: string; }) => {
        if (pkg.name === undefined) {
            console.error("missing name in lerna package entry");
            process.exit(-1);
        }
        portMap[pkg.name] = port++;
    });

    // Write the mappings to a temporary file as kv pairs
    const portMapPath = path.join(os.tmpdir(), "testportmap.json");
    fs.writeFileSync(portMapPath, JSON.stringify(portMap));
}

main();
