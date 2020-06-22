/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EOL as newline } from "os";
import fs from "fs";
import replace from "replace-in-file";
import path from "path";
import sortPackageJson from "sort-package-json";
import {
  Handler,
  readFile,
  writeFile,
} from "../common";

const licenseId = 'MIT';
const author = 'Microsoft';
const repository = 'microsoft/FluidFramework';

function packageShouldBePrivate(name: string): boolean {
    // See https://github.com/microsoft/FluidFramework/issues/2625
    if (name === "@fluid-internal/client-api") {
        return false;
    }
    
    return (
        name === "root" || // minirepo roots
        name.startsWith("@fluid-internal"));
}

function packageShouldNotBePrivate(name: string): boolean {
    // See https://github.com/microsoft/FluidFramework/issues/2642
    if (name === "@fluidframework/server-gateway") {
        return false;
    }

    return (
        name.startsWith("@fluidframework"));
}

type IReadmeInfo = {
    exists: false;
    filePath: string;
} | {
    exists: true;
    filePath: string;
    title: string;
}

function getReadmeInfo(dir: string): IReadmeInfo {
    const filePath = path.join(dir, "README.md");
    if (!fs.existsSync(filePath)) {
        return { exists: false, filePath };
    }

    const readme = readFile(filePath);
    const lines = readme.split(/\r?\n/);
    const titleMatches = /^# (.+)$/.exec(lines[0]); // e.g. # @fluidframework/build-tools
    const title = titleMatches?.[1] ?? "";
    return {
        exists: true,
        filePath,
        title,
    };
}

const match = /(^|\/)package\.json/i;
export const handlers: Handler[] = [
    {
        name: "npm-package-metadata-and-sorting",
        match,
        handler: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            const missing = [];

            if (json.author !== author) {
                missing.push(`${author} author entry`);
            }

            if (json.license !== licenseId) {
                missing.push(`${licenseId} license entry`);
            }

            if (json.repository !== repository) {
                missing.push(`${repository} repository entry`);
            }

            const ret = [];
            if (missing.length > 0) {
                ret.push(`missing or incorrect ${missing.join(' and ')}`);
            }

            if (JSON.stringify(sortPackageJson(json)) != JSON.stringify(json)) {
                ret.push(`not sorted`);
            }

            if (ret.length > 0) {
                return `Package.json ${ret.join(', ')}`;
            }
        },
        resolver: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return { resolved: false, message: 'Error parsing JSON file: ' + file };
            }

            let resolved = true;

            if (!json.author) {
                json.author = author;
            } else if (json.author !== author) {
                resolved = false;
            }

            if (!json.license) {
                json.license = licenseId;
            } else if (json.license !== licenseId) {
                resolved = false;
            }

            if (!json.repository) {
                json.repository = repository;
            } else if (json.repository !== repository) {
                resolved = false;
            }

            writeFile(file, JSON.stringify(sortPackageJson(json), undefined, 2) + newline);

            return { resolved: resolved };
        },
    },
    {
        name: "npm-private-packages",
        match,
        handler: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            const ret = [];

            if (JSON.stringify(sortPackageJson(json)) != JSON.stringify(json)) {
                ret.push(`not sorted`);
            }

            if (json.private && packageShouldNotBePrivate(json.name)) {
                ret.push(`package ${json.name} should not be marked private`)
            }

            if (!json.private && packageShouldBePrivate(json.name)) {
                ret.push(`package ${json.name} should be marked private`)
            }

            const deps = Object.keys(json.dependencies ?? {});
            if (!json.private && deps.some(packageShouldBePrivate)) {
                ret.push(`published package should not depend on an internal package`);
            }

            if (ret.length > 0) {
                return `Package.json ${ret.join(', ')}`;
            }
        },
    },
    {
        name: "npm-package-readmes",
        match,
        handler: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            const packageName = json.name;
            const packageDir = path.dirname(file);
            const readmeInfo: IReadmeInfo = getReadmeInfo(packageDir);

            if (!readmeInfo.exists) {
                return (`Package directory ${packageDir} contains no README.md`);
            }
            else if (readmeInfo.title !== packageName) {
                // These packages don't follow the convention of starting the readme with "# PackageName"
                const skip = ["root", "fluid-docs"].some((skipMe) => packageName === skipMe);
                if (!skip) {
                    return (`Readme in package directory ${packageDir} should begin with heading "${json.name}"`);
                }
            }
        },
        resolver: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return { resolved: false, message: 'Error parsing JSON file: ' + file };
            }

            const packageName = json.name;
            const packageDir = path.dirname(file);
            const readmeInfo: IReadmeInfo = getReadmeInfo(packageDir);
            const expectedTitle = `# ${json.name}`;

            if (!readmeInfo.exists) {
                writeFile(readmeInfo.filePath, `${expectedTitle}${newline}`);
            }
            else if (readmeInfo.title !== packageName) {
                replace.sync({
                    files: readmeInfo.filePath,
                    from: /^(.*)/,
                    to: expectedTitle,
                });
            }

            return { resolved: true };
        },
    },
    {
        name: "npm-package-folder-name",
        match,
        handler: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            const packageName = json.name;
            const packageDir = path.dirname(file);
            const [, scopedName] = packageName.split("/") as [string, string];
            const nameWithoutScope = scopedName ?? packageName;
            const folderName = path.basename(packageDir);

            // We expect the foldername to match the tail of the package name
            // Full match isn't required for cases where the package name is prefixed with names from earlier in the path
            if (!nameWithoutScope.toLowerCase().endsWith(folderName.toLowerCase())) {
                // These packages don't follow the convention of the dir matching the tail of the package name
                const skip = ["root", "chaincode-loader"].some((skipMe) => packageName === skipMe);
                if (!skip) {
                    return `Containing folder ${folderName} for package ${packageName} should be named similarly to the package`;
                }
            }
        },
    },
];
