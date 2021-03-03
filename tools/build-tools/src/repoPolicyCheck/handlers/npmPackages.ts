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
const PJV = require("package-json-validator").PJV;

const licenseId = 'MIT';
const author = 'Microsoft';
const repository = 'https://github.com/microsoft/FluidFramework';
const homepage = 'https://fluidframework.com';
const trademark = `
## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
`;

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
    return (
        name.startsWith("@fluidframework") ||
        name.startsWith("@fluid-example"));
}

type IReadmeInfo = {
    exists: false;
    filePath: string;
} | {
    exists: true;
    filePath: string;
    title: string;
    trademark: boolean;
    readme: string;
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
        trademark: readme.includes(trademark),
        readme,
    };
}

const match = /(^|\/)package\.json/i;
export const handlers: Handler[] = [
    {
        name: "npm-package-metadata-and-sorting",
        match,
        handler: file => {
            let jsonStr: string;
            let json;
            try {
                jsonStr = readFile(file);
                json = JSON.parse(jsonStr);
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            const ret = [];

            if (JSON.stringify(sortPackageJson(json)) != JSON.stringify(json)) {
                ret.push(`package.json not sorted`);
            }

            const validationResults = PJV.validate(jsonStr, 'npm', { warnings: false, recommendations: false });

            // special handling for the end-to-end tests package since it uses non-standard version values.
            if (file.includes("end-to-end-tests") && !validationResults.valid) {
                validationResults.errors = validationResults.errors.filter(
                    (error: string) => {
                        return !error.startsWith("Invalid version range for dependency");
                    }
                );

                if (validationResults.errors.length === 0) {
                    validationResults.valid = true;
                }
            }

            if (!validationResults.valid) {
                if (validationResults.critical) {
                    ret.push(validationResults.critical);
                }
                ret.push(validationResults.errors);
            }

            if (json.author !== author) {
                ret.push(`author: "${json.author}" !== "${author}"`);
            }

            if (json.license !== licenseId) {
                ret.push(`license: "${json.license}" !== "${licenseId}"`);
            }

            if (json.repository !== repository) {
                ret.push(`repository: "${json.repository}" !== "${repository}"`);
            }

            if (!json.private && !json.description) {
                ret.push("description: must not be empty");
            }

            if (json.homepage !== homepage) {
                ret.push(`homepage: "${json.homepage}" !== "${homepage}"`);
            }

            if (ret.length > 1) {
                return `${ret.join(newline)}`;
            } else if (ret.length === 1) {
                return ret[0];
            }

            return undefined;
        },
        resolver: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return { resolved: false, message: 'Error parsing JSON file: ' + file };
            }

            let resolved = true;

            if (json.author === undefined || json.author !== author) {
                json.author = author;
            }

            if (json.license === undefined || json.license !== licenseId) {
                json.license = licenseId;
            }

            if (json.repository === undefined || json.repository !== repository) {
                json.repository = repository;
            }

            if (json.homepage === undefined || json.homepage !== homepage) {
                json.homepage = homepage;
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

            if (json.private && packageShouldNotBePrivate(json.name)) {
                ret.push(`package ${json.name} should not be marked private`)
            }

            // Falsey check is correct since packages publish by default  (i.e. missing "private" field means false)
            if (!json.private && packageShouldBePrivate(json.name)) {
                ret.push(`package ${json.name} should be marked private`)
            }

            const deps = Object.keys(json.dependencies ?? {});
            if (!json.private && deps.some(packageShouldBePrivate)) {
                ret.push(`published package should not depend on an internal package`);
            }

            if (ret.length > 0) {
                return `Package.json ${ret.join(newline)}`;
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

            if (fs.existsSync(path.join(packageDir, "Dockerfile"))) {
                if (!readmeInfo.trademark) {
                    return `Readme in package directory ${packageDir} with Dockerfile should contain with trademark verbiage`;
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
            const expectTrademark = fs.existsSync(path.join(packageDir, "Dockerfile"));
            if (!readmeInfo.exists) {
                if (expectTrademark) {
                    writeFile(readmeInfo.filePath, `${expectedTitle}${newline}${newline}${trademark}`);
                } else {
                    writeFile(readmeInfo.filePath, `${expectedTitle}${newline}`);
                }
                return { resolved: true };
            }

            const fixTrademark = !readmeInfo.trademark && !readmeInfo.readme.includes("## Trademark");
            if (fixTrademark) {
                const existingNewLine = readmeInfo.readme[readmeInfo.readme.length - 1] === "\n";
                writeFile(readmeInfo.filePath, `${readmeInfo.readme}${existingNewLine ? "" : newline}${trademark}`);
            }
            if (readmeInfo.title !== packageName) {
                replace.sync({
                    files: readmeInfo.filePath,
                    from: /^(.*)/,
                    to: expectedTitle,
                });
            }

            return { resolved: readmeInfo.trademark || fixTrademark };
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
                const skip = ["root"].some((skipMe) => packageName === skipMe);
                if (!skip) {
                    return `Containing folder ${folderName} for package ${packageName} should be named similarly to the package`;
                }
            }
        },
    },
    {
        name: "npm-package-license",
        match,
        handler: (file, root) => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            if (json.private) {
                return;
            }

            const packageName = json.name;
            const packageDir = path.dirname(file);
            const licensePath = path.join(packageDir, "LICENSE");
            const rootLicensePath = path.join(root, "LICENSE");

            if (!fs.existsSync(licensePath)) {
                return `LICENSE file missing for package ${packageName}`;
            }

            const licenseFile = readFile(licensePath);
            const rootFile = readFile(rootLicensePath);
            if (licenseFile !== rootFile) {
                return `LICENSE file in ${packageDir} doesn't match ${rootLicensePath}`;
            }
        },
        resolver: (file, root) => {
            const packageDir = path.dirname(file);
            const licensePath = path.join(packageDir, "LICENSE");
            const rootLicensePath = path.join(root, "LICENSE");
            try {
                fs.copyFileSync(rootLicensePath, licensePath);
            } catch {
                return { resolved: false, message: `Error copying file from ${rootLicensePath} to ${licensePath}` };
            }
            return { resolved: true };
        },
    },
];
