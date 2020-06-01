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
import chalk from "chalk";
import replace from "replace-in-file";

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
    stub: boolean;
}

interface IPackageInfo {
    fullName: string,
    scopedName?: string,
    dir: string;
    folderName: string;
    readmeInfo: IReadmeInfo;
}

namespace IPackageInfo {
    export const toMdString = (info: IPackageInfo): string =>
        `| ${info.fullName} | ${info.folderName} | ${info.readmeInfo.exists ? info.readmeInfo.title : "NO README"} | ${info.dir} |\n`;
}

const readmeTitleRegexp: RegExp = /^[#\s]*(.+)$/;  // e.g. # @fluidframework/build-tools

function getReadmeInfo(dir: string): IReadmeInfo {
    const readmePath = path.join(dir, "readme.md");
    if (!existsSync(readmePath)) {
        return { exists: false };
    }

    const findThreeNonemptyLines = (lines: string[]) => {
        let nonemptyLineCount = 0;
        for (const line of lines) {
            if (line.trim() !== "") {
                ++nonemptyLineCount;
            }
            if (nonemptyLineCount >= 3) {
                return true;
            }
        }
        return false;
    }

    const readme = readFileSync(readmePath, "utf8");
    const lines = readme.split(/\r?\n/);
    const titleMatches = readmeTitleRegexp.exec(lines[0]);
    const title = titleMatches?.[1] ?? "";
    return {
        exists: true,
        title,
        stub: !findThreeNonemptyLines(lines),
    };
}

function getPackageInfo(pkg: Package): IPackageInfo {
    const fullName = pkg.name;
    const [, scopedName] = fullName.split("/") as [string, string];
    const dir = pkg.directory;
    const folderName = path.basename(dir);
    const readmeInfo = getReadmeInfo(dir);

    return { fullName, scopedName, dir, folderName, readmeInfo };
}

function appendInfoToFile(info: IPackageInfo) {
    assert(repoRoot);
    const filePath: string = path.join(repoRoot!, packagesMdFileName);
    const fileLine: string = IPackageInfo.toMdString(info);
    appendFileSync(filePath, fileLine);
}

function processPackageInfo(info: IPackageInfo) {
    appendInfoToFile(info);

    console.log();

    const expectedFolderName = info.scopedName ?? info.fullName;
    const readmeFilePath = path.join(info.dir, "readme.md");
    const readmeTitle = `# ${info.fullName}`;
    if (info.folderName !== expectedFolderName) {
        console.log(chalk.yellowBright(`Folder name mismatch [${info.fullName}]`));
        console.log(`  Package ${info.fullName} is in Folder "${info.folderName}"`);

        if (fix) {
            const newDir: string = info.dir.replace(new RegExp(`\/${info.folderName}$`), expectedFolderName);
            if (prompt(`Rename ${info.dir} to ${newDir}? (y/n)`, "n")?.toLowerCase() === "y") {
                renameSync(info.dir, newDir);
            }
        }
    }
    if (!info.readmeInfo.exists) {
        console.log(chalk.redBright(`Readme missing [${info.fullName}]`));
        console.log(`  Package ${info.fullName} has no readme.md`);
        
        if (fix) {
            const readmeFilePath = path.join(info.dir, "readme.md");
            writeFileSync(readmeFilePath, `${readmeTitle}\n`);
        }
    }
    else if (info.readmeInfo.title !== info.fullName) {
        console.log(chalk.redBright(`Readme title mismatch [${info.fullName}]`));
        console.log(`  Readme for Package ${info.fullName} begins with "${info.readmeInfo.title}" instead of "# ${info.fullName}"`);

        if (fix) {
            replace.sync({
                files: readmeFilePath,
                from: /^(.*)\n/,
                to: readmeTitle,
            });
        }
    }
    else if (info.readmeInfo.stub) {
        console.log(chalk.yellowBright(`Stub readme [${info.fullName}]`));
        console.log(`  Readme for Package ${info.fullName} is just a stub and needs more content`);
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
        packages
            .map(getPackageInfo)
            .sort((a, b) => a.dir < b.dir ? -1 : a.dir == b.dir ? 0 : 1) // sort in ABC order by directory
            .forEach(processPackageInfo);

        //* TODO
        /**
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
