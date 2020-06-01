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
import { readFileAsync, writeFileAsync, existsSync, appendFileSync, renameSync } from "../common/utils";
import chalk from "chalk";
import { AsyncResource } from "async_hooks";

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

type IReadmeInfo = {
    exists: false;
} | {
    exists: true;
    title: string;
    stub: false;
}

type IPackageName = {
    fullName: string,
    scopedName?: string,
}

namespace IPackageName {
    export const parse = (name: string): IPackageName => {
        if (name.startsWith("@")) {
            const [, scopedName] = name.split("/") as [string, string];
            return { fullName: name, scopedName };
        }
        return { fullName: name };
    }
}

interface IPackageInfo {
    name: IPackageName;
    dir: string;
    folderName: string;
    readmeInfo: IReadmeInfo;
}

namespace IPackageInfo {
    export const toMdString = (info: IPackageInfo): string =>
        `| ${info.name.fullName} | ${info.folderName} | ${info.readmeInfo.exists ? info.readmeInfo.title : "NO README"} | ${info.dir} |\n`;
}

const readmeTitleRegexp: RegExp = /^[#\s]*(.+)$/;  // e.g. # @fluidframework/build-tools

async function getPackageInfo(pkg: Package): Promise<IPackageInfo> {
    const name = IPackageName.parse(pkg.name);
    const dir = pkg.directory;
    const folderName = path.basename(dir);
    const readmePath = path.join(dir, "readme.md");

    let readmeInfo: IReadmeInfo = { exists: false };
    if (existsSync(readmePath)) {
        const readme = await readFileAsync(readmePath, "utf8");
        const lines = readme.split(/\r?\n/);
        const titleMatches = readmeTitleRegexp.exec(lines[0]);
        const title = titleMatches?.[1] ?? "";
        readmeInfo = {
            exists: true,
            title,
            stub: false, //* Todo: check for (nearly?) empty readme
        };
    }

    return { name, dir, folderName, readmeInfo };
}

function appendInfoToFile(info: IPackageInfo) {
    assert(repoRoot);
    const filePath: string = path.join(repoRoot!, packagesMdFileName);
    const fileLine: string = IPackageInfo.toMdString(info);
    appendFileSync(filePath, fileLine);
}

function processPackageInfo(info: IPackageInfo) {
    appendInfoToFile(info);

    const name = info.name.scopedName ?? info.name.fullName;

    console.log();
    if (info.folderName !== name) {
        console.log(chalk.yellowBright(`Folder name mismatch [${info.name.fullName}]`));
        console.log(`  Package ${info.name.fullName} is in Folder "${info.folderName}"`);
    }
    if (!info.readmeInfo.exists) {
        console.log(chalk.redBright(`Readme missing [${info.name.fullName}]`));
        console.log(`  Package ${info.name.fullName} has no readme.md`);
    }
    else if (info.readmeInfo.title !== name) {
        console.log(chalk.redBright(`Readme title mismatch [${info.name.fullName}]`));
        console.log(`  Readme for Package ${info.name.fullName} begins with "${info.readmeInfo.title}" instead of "# ${info.name.fullName}"`);
    }
    else if (info.readmeInfo.stub) {
        console.log(chalk.yellowBright(`Empty readme [${info.name.fullName}]`));
        console.log(`  Readme for Package ${info.name.fullName} is empty`);
    }
}

let repoRoot: string | undefined;

async function main() {
    const timer = new Timer(commonOptions.timer);

    repoRoot = await getResolvedFluidRoot();

    // Load the packages
    const packages = Packages.loadDir(repoRoot);
    timer.time("Package scan completed");

    try {
        // Write the file header
        const packagesMdFilePath: string = path.join(repoRoot, packagesMdFileName);
        await writeFileAsync(packagesMdFilePath, packagesMdHeader);

        // process the packages
        (await Promise.all(packages.map(getPackageInfo)))
            .sort((a, b) => a.dir < b.dir ? -1 : a.dir == b.dir ? 0 : 1) // sort in ABC order by directory
            .forEach(processPackageInfo);

        //* TODO
        /**
         * 2. Log warnings where the columns don't match
         *      - Auto-fix options
         *      - Detect empty/stub readme's and warn on that too
         * 3. Misc
         *      - Use relative links for Directory
         * 4. Optional
         *      - Incorporate Layer info?
         *      - Merge IPackageInfo etc into npmPackage.ts model?
         *      - Also compare package.json format/scripts/etc?
         */
    } catch (e) {
        console.error(e.message);
        process.exit(-2);
    }
}

const packagesMdFileName: string = "PACKAGES.md";

const packagesMdHeader: string =
`# All Packages

_This file is generated, please don't edit it manually._

| package name | folder name | readme title | directory path |
| --- | --- | --- | --- |
`;

main();
