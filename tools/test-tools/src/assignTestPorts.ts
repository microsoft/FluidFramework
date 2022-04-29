/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function main() {
    // Get the lerna output
    let lernaOutput;
    try {
        lernaOutput = JSON.parse(child_process.execSync("npx lerna list --all --json").toString());
        if (!Array.isArray(lernaOutput)) {
            throw new Error("stdin input was not package array");
        }
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }

    // Assign a unique port to each package
    const portMap: { [pkgName: string]: number } = {};
    let port = 8081;
    lernaOutput.forEach((pkg: {name: string}) => {
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
