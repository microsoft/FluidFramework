/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { exec, execSync } from "child_process";
import * as path from "path";
import { existsSync, mkdirSync, unlinkSync } from "fs";

// Loader API
import { Loader } from "@fluidframework/container-loader";

// ContainerRuntime API
import { ContainerRuntime } from "@fluidframework/container-runtime";

// Data Runtime API
import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { Ink } from "@fluidframework/ink";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { TestFluidObjectFactory } from "@fluidframework/test-utils";

// ContainerRuntime and Data Runtime API
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

import { lock } from "proper-lockfile";
import * as semver from "semver";
import { pkgVersion } from "./packageVersion";

// List of package that needs to be install for past versions
const packageList = [
    "@fluidframework/aqueduct",
    "@fluidframework/test-utils",
    "@fluidframework/container-loader",
    "@fluidframework/container-runtime",
    "@fluidframework/cell",
    "@fluidframework/counter",
    "@fluidframework/ink",
    "@fluidframework/map",
    "@fluidframework/matrix",
    "@fluidframework/ordered-collection",
    "@fluidframework/register-collection",
    "@fluidframework/sequence",
];

// Current versions of the APIs
const LoaderApi = {
    version: pkgVersion,
    Loader,
};

const ContainerRuntimeApi = {
    version: pkgVersion,
    ContainerRuntime,
    ContainerRuntimeFactoryWithDefaultDataStore,
};

const DataRuntimeApi = {
    version: pkgVersion,
    DataObject,
    DataObjectFactory,
    TestFluidObjectFactory,
    dds: {
        SharedCell,
        SharedCounter,
        Ink,
        SharedDirectory,
        SharedMap,
        SharedMatrix,
        ConsensusQueue,
        ConsensusRegisterCollection,
        SharedString,
        SparseMatrix,
    },
};

export type DataRuntimeApiType = typeof DataRuntimeApi;
const resolutionCache = new Map<string, string>();

function resolveVersion(requested: string) {
    const cachedVersion = resolutionCache.get(requested);
    if (cachedVersion) { return cachedVersion; }
    if (semver.valid(requested)) {
        resolutionCache.set(requested, requested);
        return requested;
    }

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

// Assuming this file is in dist\test, so go to ..\..\node_modules\.legacy as the install location
const getModulePath = (version: string) => path.join(__dirname, "..", "..", "node_modules", ".legacy", version);

async function ensureInstalled(requested: string) {
    const version = resolveVersion(requested);
    let release = await lock(__dirname, { retries: { forever: true } });
    try {
        const modulePath = getModulePath(version);
        if (existsSync(modulePath)) {
            // assume it is valid if it exists
            return { version, modulePath };
        }
        try {
            console.log(`Installing version ${version}`);

            // Create the directory
            mkdirSync(modulePath, { recursive: true });

            // Release the __dirname but lock the modulePath so we can do parallel installs
            const release2 = await lock(modulePath, { retries: { forever: true } });
            release();
            release = release2;

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
                            rej(new Error(`Failed to install in ${modulePath}`));
                        }
                        res();
                    },
                ),
            );
        } catch (e) {
            try { unlinkSync(modulePath); } catch (ex) { }
            throw new Error(`Unable to install version ${version}\n${e}`);
        }
        return { version, modulePath };
    } finally {
        release();
    }
}

export const mochaGlobalSetup = async () => Promise.all(
    [ensureInstalled(getRequestedRange(-1)), ensureInstalled(getRequestedRange(-2))],
);

function checkInstalled(requested: string) {
    const version = resolveVersion(requested);
    const modulePath = getModulePath(version);
    if (existsSync(modulePath)) {
        // assume it is valid if it exists
        return { version, modulePath };
    }
    throw new Error(`Requested version ${requested} resolved to ${version} is not installed`);
}

const loadPackage = (modulePath: string, pkg: string) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports
    require(path.join(modulePath, "node_modules", pkg));

function getRequestedRange(requested?: number | string): string {
    if (requested === undefined) { return pkgVersion; }
    if (typeof requested === "string") { return requested; }
    const version = new semver.SemVer(pkgVersion);
    // ask for prerelease in case we just bumpped the version and haven't release the previous version yet.
    return `^${version.major}.${version.minor + requested}.0-0`;
}

export function getLoaderApi(requested?: number | string): typeof LoaderApi {
    const requestedStr = getRequestedRange(requested);

    // If the current version satisfies the range, use it.
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return LoaderApi;
    }

    const { version, modulePath } = checkInstalled(requestedStr);
    return {
        version,
        Loader: loadPackage(modulePath, "@fluidframework/container-loader").Loader,
    };
}

export function getContainerRuntimeApi(requested?: number | string): typeof ContainerRuntimeApi {
    const requestedStr = getRequestedRange(requested);
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return ContainerRuntimeApi;
    }
    const { version, modulePath } = checkInstalled(requestedStr);
    return {
        version,
        ContainerRuntime: loadPackage(modulePath, "@fluidframework/container-runtime").ContainerRuntime,
        ContainerRuntimeFactoryWithDefaultDataStore:
            loadPackage(modulePath, "@fluidframework/aqueduct").ContainerRuntimeFactoryWithDefaultDataStore,
    };
}

export function getDataRuntimeApi(requested?: number | string): typeof DataRuntimeApi {
    const requestedStr = getRequestedRange(requested);
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return DataRuntimeApi;
    }
    const { version, modulePath } = checkInstalled(requestedStr);
    return {
        version,
        DataObject: loadPackage(modulePath, "@fluidframework/aqueduct").DataObject,
        DataObjectFactory: loadPackage(modulePath, "@fluidframework/aqueduct").DataObjectFactory,
        TestFluidObjectFactory:
            loadPackage(modulePath, "@fluidframework/test-utils").TestFluidObjectFactory,
        dds: {
            SharedCell: loadPackage(modulePath, "@fluidframework/cell").SharedCell,
            SharedCounter: loadPackage(modulePath, "@fluidframework/counter").SharedCounter,
            Ink: loadPackage(modulePath, "@fluidframework/ink").Ink,
            SharedDirectory: loadPackage(modulePath, "@fluidframework/map").SharedDirectory,
            SharedMap: loadPackage(modulePath, "@fluidframework/map").SharedMap,
            SharedMatrix: loadPackage(modulePath, "@fluidframework/matrix").SharedMatrix,
            ConsensusQueue: loadPackage(modulePath, "@fluidframework/ordered-collection").ConsensusQueue,
            ConsensusRegisterCollection:
                loadPackage(modulePath, "@fluidframework/register-collection").ConsensusRegisterCollection,
            SharedString: loadPackage(modulePath, "@fluidframework/sequence").SharedString,
            SparseMatrix: loadPackage(modulePath, "@fluidframework/sequence").SparseMatrix,
        },
    };
}
