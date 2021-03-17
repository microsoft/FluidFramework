/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* Utilities to manage finding, installing and loading legacy versions */

import { exec, execSync } from "child_process";
import * as path from "path";
import { existsSync, mkdirSync, rmdirSync, readdirSync, readFileSync, writeFileSync } from "fs";

import { lock } from "proper-lockfile";
import * as semver from "semver";
import { pkgVersion } from "./packageVersion";

// Assuming this file is in dist\test, so go to ..\node_modules\.legacy as the install location
const baseModulePath = path.join(__dirname, "..", "node_modules", ".legacy");
const installedJsonPath = path.join(baseModulePath, "installed.json");
const getModulePath = (version: string) => path.join(baseModulePath, version);

const resolutionCache = new Map<string, string>();

interface InstalledJson {
    installed: string[],
}

async function ensureInstalledJson() {
    if (existsSync(installedJsonPath)) { return; }
    const release = await lock(__dirname, { retries: { forever: true } });
    try {
        // Check it again under the lock
        if (existsSync(installedJsonPath)) { return; }
        // Create the directory
        mkdirSync(baseModulePath, { recursive: true });
        const data: InstalledJson = { installed: [] };

        writeFileSync(installedJsonPath, JSON.stringify(data, undefined, 2), { encoding: "utf8" });
    } finally {
        release();
    }
}

function readInstalledJsonNoLock(): InstalledJson {
    const data = readFileSync(installedJsonPath, { encoding: "utf8" });
    return JSON.parse(data) as InstalledJson;
}

async function readInstalledJson(): Promise<InstalledJson> {
    await ensureInstalledJson();
    const release = await lock(installedJsonPath, { retries: { forever: true } });
    try {
        return readInstalledJsonNoLock();
    } finally {
        release();
    }
}

const isInstalled = async (version: string) => (await readInstalledJson()).installed.includes(version);
async function addInstalled(version: string) {
    await ensureInstalledJson();
    const release = await lock(installedJsonPath, { retries: { forever: true } });
    try {
        const installedJson = readInstalledJsonNoLock();
        if (!installedJson.installed.includes(version)) {
            installedJson.installed.push(version);
            writeFileSync(installedJsonPath, JSON.stringify(installedJson, undefined, 2), { encoding: "utf8" });
        }
    } finally {
        release();
    }
}

async function removeInstalled(version: string) {
    await ensureInstalledJson();
    const release = await lock(installedJsonPath, { retries: { forever: true } });
    try {
        const installedJson = readInstalledJsonNoLock();
        installedJson.installed = installedJson.installed.filter((value) => value !== version);
        writeFileSync(installedJsonPath, JSON.stringify(installedJson, undefined, 2), { encoding: "utf8" });
    } finally {
        release();
    }
}

function resolveVersion(requested: string, installed: boolean) {
    const cachedVersion = resolutionCache.get(requested);
    if (cachedVersion) { return cachedVersion; }
    if (semver.valid(requested)) {
        // If it is a valid semver already instead of a range, just use it
        resolutionCache.set(requested, requested);
        return requested;
    }

    if (installed) {
        // Check the install directory instad of asking NPM for it.
        const files = readdirSync(baseModulePath, { withFileTypes: true });
        let found: string | undefined;
        files.map((dirent) => {
            if (dirent.isDirectory() && semver.valid(dirent.name) && semver.satisfies(dirent.name, requested)) {
                if (!found || semver.lt(found, dirent.name)) {
                    found = dirent.name;
                }
            }
        });
        if (found) {
            return found;
        }
        throw new Error(`No matching version found in ${baseModulePath}`);
    } else {
        const result = execSync(
            `npm v @fluidframework/container-loader@"${requested}" version --json`,
            { encoding: "utf8" },
        );
        try {
            const versions: string | string[] = JSON.parse(result);
            const version = Array.isArray(versions) ? versions.sort(semver.rcompare)[0] : versions;
            if (!version) { throw new Error(`No version found for ${requested}`); }
            resolutionCache.set(requested, version);
            return version;
        } catch (e) {
            throw new Error(`Error parsing versions for ${requested}`);
        }
    }
}

async function ensureModulePath(version: string, modulePath: string) {
    const release = await lock(baseModulePath, { retries: { forever: true } });
    try {
        console.log(`Installing version ${version}`);
        if (!existsSync(modulePath)) {
            // Create the under the baseModulePath lock
            mkdirSync(modulePath, { recursive: true });
        }
    } finally {
        release();
    }
}

export async function ensureInstalled(requested: string, packageList: string[], force: boolean) {
    const version = resolveVersion(requested, false);
    const modulePath = getModulePath(version);

    if (!force && await isInstalled(version)) {
        return { version, modulePath };
    }

    await ensureModulePath(version, modulePath);

    // Release the __dirname but lock the modulePath so we can do parallel installs
    const release = await lock(modulePath, { retries: { forever: true } });
    try {
        if (force) {
            // remove version from install.json under the modulePath lock
            await removeInstalled(version);
        }

        // Check installed status again under lock the modulePath lock
        if (force || !await isInstalled(version)) {
            // Install the packages
            await new Promise<void>((res, rej) =>
                exec(`npm init --yes`, { cwd: modulePath }, (error, stdout, stderr) => {
                    if (error) {
                        rej(new Error(`Failed to initialize install directory ${modulePath}`));
                    }
                    res();
                }),
            );
            await new Promise<void>((res, rej) =>
                exec(
                    `npm i --no-package-lock ${packageList.map((pkg) => `${pkg}@${version}`).join(" ")}`,
                    { cwd: modulePath },
                    (error, stdout, stderr) => {
                        if (error) {
                            rej(new Error(`Failed to install in ${modulePath}\n${stderr}`));
                        }
                        res();
                    },
                ),
            );

            // add it to the install.json under the modulePath lock.
            await addInstalled(version);
        }
        return { version, modulePath };
    } catch (e) {
        // rmdirSync recursive flags introduced in Node v12.10
        // Remove the `as any` cast once node typing is updated.
        try { (rmdirSync as any)(modulePath, { recursive: true }); } catch (ex) { }
        throw new Error(`Unable to install version ${version}\n${e}`);
    } finally {
        release();
    }
}

export function checkInstalled(requested: string) {
    const version = resolveVersion(requested, true);
    const modulePath = getModulePath(version);
    if (existsSync(modulePath)) {
        // assume it is valid if it exists
        return { version, modulePath };
    }
    throw new Error(`Requested version ${requested} resolved to ${version} is not installed`);
}

export const loadPackage = (modulePath: string, pkg: string) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports
    require(path.join(modulePath, "node_modules", pkg));

export function getRequestedRange(requested?: number | string): string {
    if (requested === undefined || requested === 0) { return pkgVersion; }
    if (typeof requested === "string") { return requested; }
    const version = new semver.SemVer(pkgVersion);
    // ask for prerelease in case we just bumpped the version and haven't release the previous version yet.
    return `^${version.major}.${version.minor + requested}.0-0`;
}
