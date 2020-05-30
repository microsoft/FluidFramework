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
import { readFileAsync, writeFileAsync, existsSync } from "../common/utils";

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
    folderName: string;
    readmeInfo: IReadmeInfo;
}

namespace IPackageInfo {
    export const toString = (info: IPackageInfo): string =>
        `| ${IPackageName.toString(info.name)} | ${info.folderName} | ${info.readmeInfo.exists ? info.readmeInfo.title : "NO README"} |`;
}

const readmeTitleRegexp: RegExp = /^[#\s]*(.+)$/;  // e.g. # @fluidframework/build-tools

async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the packages
    const packages = Packages.loadDir(resolvedRoot);
    timer.time("Package scan completed");

    try {
        const auditPackage = async (pkg: Package): Promise<IPackageInfo> => {
            const dir = pkg.directory;
            const pkgFolderName = path.basename(dir);
            const readmePath = path.join(dir, "readme.md");
            const name = IPackageName.parse(pkg.name);

            if (!existsSync(readmePath)) {
                return {
                    name,
                    folderName: pkgFolderName,
                    readmeInfo: { exists: false },
                };
            }

            const readme = await readFileAsync(readmePath, "utf8");
            const lines = readme.split(/\r?\n/);
            const titleMatches = readmeTitleRegexp.exec(lines[0]);
            const title = titleMatches?.[1] ?? "";

            return {
                name,
                folderName: pkgFolderName,
                readmeInfo: {
                    exists: true,
                    title,
                }
            }
        };
        packages
            .map(auditPackage)
            .forEach(async (info) => console.log(IPackageInfo.toString(await info)));
        // if (!success) {
        //     process.exit(-1);
        // }
    } catch (e) {
        console.error(e.message);
        process.exit(-2);
    }
}

main();
