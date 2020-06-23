/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import path from "path";
import { Package, Packages } from "../common/npmPackage";
import { writeFileAsync, readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from "../common/utils";

function printUsage() {
    console.log(
        `
Usage: package-audit <options>
Options:
     --fix           Attempt to fix any package naming inconsistencies
${commonOptionString}
`);
}

let fix: boolean = false;

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

        if (arg === "--fix") {
            fix = true;
            continue;
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

interface IPackageInfo {
    fullName: string,
    scopedName?: string,
    dir: string;
    published: boolean,
}

namespace IPackageInfo {
    export const toMdString = (info: IPackageInfo): string =>
        `| [${info.fullName}](/${path.relative(repoRoot!, info.dir).replace(/\\/g, "/")}) | ${info.published ? "published" : "private"} |\n`;
}

function getPackageInfo(pkg: Package): IPackageInfo {
    assert(repoRoot);

    const fullName = pkg.name;
    const [, scopedName] = fullName.split("/") as [string, string];
    const dir = pkg.directory;
    const published = pkg.isPublished;

    return { fullName, scopedName, dir, published };
}

function appendInfoToFile(info: IPackageInfo) {
    assert(repoRoot);
    const filePath: string = path.join(repoRoot!, packagesMdFileName);
    const fileLine: string = IPackageInfo.toMdString(info);
    appendFileSync(filePath, fileLine);
}

function processPackageInfo(info: IPackageInfo) {
    if (info.fullName === "root") {
        return;
    }
    appendInfoToFile(info);
}

let repoRoot: string | undefined;

async function main() {
    const timer = new Timer(commonOptions.timer);

    repoRoot = await getResolvedFluidRoot();

    // Load the packages
    const packages = Packages.loadTree(repoRoot);
    timer.time("Package scan completed");

    try {
        // Write the file header
        const packagesMdFilePath: string = path.join(repoRoot, packagesMdFileName);
        await writeFileAsync(packagesMdFilePath, packagesMdHeader);

        // process the packages
        packages
            .map(getPackageInfo)
            .sort((a, b) => a.dir < b.dir ? -1 : a.dir == b.dir ? 0 : 1) // sort in ABC order by directory
            .forEach(processPackageInfo);

        process.exit(0);
    } catch (e) {
        console.error(e.message);
        process.exit(-2);
    }
}

const packagesMdFileName: string = "docs/PACKAGES.md";

const packagesMdHeader: string =
`# All Packages

| Package Name | Published? |
| --- | --- |
`;

main();
