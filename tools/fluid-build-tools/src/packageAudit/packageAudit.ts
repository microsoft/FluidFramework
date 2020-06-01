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
import { readFileAsync, writeFileAsync, existsSync, appendFileSync } from "../common/utils";

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

type IReadmeInfo = {
    exists: false;
} | {
    exists: true;
    title: string;
}

type IPackageName = {
    scoped: true,
    scope: string,
    scopedName: string,
} | {
    scoped: false,
    name: string,
}

namespace IPackageName {
    export const parse = (name: string): IPackageName => {
        if (name.startsWith("@")) {
            const [scope, scopedName] = name.split("/") as [string, string];
            return { scoped: true, scope, scopedName };
        }
        return { scoped: false, name };
    }

    export const toString = (name: IPackageName): string =>
        name.scoped
            ? `${name.scope}/${name.scopedName}`
            : name.name;
}

interface IPackageInfo {
    name: IPackageName;
    dir: string;
    folderName: string;
    readmeInfo: IReadmeInfo;
}

namespace IPackageInfo {
    export const toMdString = (info: IPackageInfo): string =>
        `| ${IPackageName.toString(info.name)} | ${info.folderName} | ${info.readmeInfo.exists ? info.readmeInfo.title : "NO README"} | ${info.dir} |\n`;
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
        };
    }

    return { name, dir, folderName, readmeInfo };
}

async function writeInfoToFile(infoP: Promise<IPackageInfo>): Promise<void> {
    const filePath: string = path.join(repoRoot, packagesMdFileName);
    const fileLine: string = IPackageInfo.toMdString(await infoP);
    appendFileSync(filePath, fileLine);
}

let repoRoot: string = "UNRESOLVED";

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

        packages
            .map(getPackageInfo)
            .forEach(writeInfoToFile);
        
        //* TODO
        /**
         * 2. Log warnings where the columns don't match
         *      - Open an issue with the current output of that log and make a Fluid Doc about it
         *      - Auto-fix options
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
