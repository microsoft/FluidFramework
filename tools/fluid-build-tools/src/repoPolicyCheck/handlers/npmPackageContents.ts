import { EOL as newline } from "os";
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

export const handlers: Handler[] = [
    {
        name: "npm-package-metadata-and-sorting",
        match: /(^|\/)package\.json/i,
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
        }
    },
    {
        name: "npm-private-packages",
        match: /(^|\/)package\.json/i,
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
];
