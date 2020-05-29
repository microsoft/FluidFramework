/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import * as path from "path";
import { logVerbose, logStatus } from "../common/logging";
import { Package, Packages } from "../common/npmPackage";
import { readFileAsync, writeFileAsync } from "../common/utils";

function printUsage() {
    console.log(
        `
Usage: package-audit <options>
Options:
${commonOptionString}
`);
}

function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < process.argv.length; i++) {
        const argParsed = parseOption(argv, i);
        if (argParsed < 0) {
            error = true;
            break;
        }
        if (argParsed > 0) {
            i += argParsed - 1;
            continue;
        }

        const arg = process.argv[i];

        if (arg === "-?" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        console.error(`ERROR: Invalid arguments ${arg}`);
        error = true;
        break;
    }

    if (error) {
        printUsage();
        process.exit(-1);
    }
}

parseOptions(process.argv);

async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const packages = Packages.loadDir(resolvedRoot);
    timer.time("Package scan completed");

    try {
        const auditPackage = async (pkg: Package) => {
            const dir = pkg.directory;
            const readmePath = path.join(dir, "readme.md");
            
            //* First check if readme exists
            const readme = await readFileAsync(readmePath, "utf8");
            const lines = readme.split(/\r?\n/);
            const title = lines[0]; //* todo: Normalize (strip off #'s and collapse spaces)

            //* Check directory name
        };
        auditPackage(packages[0]);
        // packages.forEach(auditPackage);
        // if (!success) {
        //     process.exit(-1);
        // }
    } catch (e) {
        console.error(e.message);
        process.exit(-2);
    }
}

main();
