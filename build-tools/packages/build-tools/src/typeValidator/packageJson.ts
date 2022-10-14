/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";
import * as fs from "fs";
import * as semver from "semver";
import * as util from "util";

import {
    ReleaseVersion,
    detectVersionScheme,
    fromInternalScheme,
    fromVirtualPatchScheme,
    getVersionRange,
    isInternalVersionScheme,
    toInternalScheme,
    toVirtualPatchScheme,
} from "@fluid-tools/version-tools";

export type PackageDetails = {
    readonly packageDir: string;
    readonly oldVersions: readonly string[];
    readonly broken: BrokenCompatTypes;
    readonly pkg: PackageJson;
};

export interface BrokenCompatSettings {
    backCompat?: false;
    forwardCompat?: false;
}

export type BrokenCompatTypes = Partial<Record<string, BrokenCompatSettings>>;

interface PackageJson {
    name: string;
    version: string;
    main: string | undefined;
    private: boolean | undefined;
    devDependencies: Record<string, string>;
    typeValidation?: {
        version: string;
        broken: BrokenCompatTypes;
        disabled?: boolean;
    };
}

function createSortedObject<T>(obj: Record<string, T>): Record<string, T> {
    const sortedKeys = Object.keys(obj).sort();
    const sortedDeps: Record<string, T> = {};
    for (const key of sortedKeys) {
        sortedDeps[key] = obj[key];
    }
    return sortedDeps;
}

function safeParse(json: string, error: string) {
    try {
        return JSON.parse(json);
    } catch {
        throw new Error(error);
    }
}

export async function getPackageDetails(packageDir: string): Promise<PackageDetails> {
    const packagePath = `${packageDir}/package.json`;
    if (!(await util.promisify(fs.exists)(packagePath))) {
        throw new Error(`Package json does not exist: ${packagePath}`);
    }
    const content = await util.promisify(fs.readFile)(packagePath);

    const pkgJson: PackageJson = safeParse(content.toString(), packagePath);

    const oldVersions: string[] = Object.keys(pkgJson.devDependencies ?? {}).filter((k) =>
        k.startsWith(pkgJson.name),
    );

    return {
        pkg: pkgJson,
        packageDir,
        oldVersions,
        broken: pkgJson.typeValidation?.broken ?? {},
    };
}

/**
 * Based on the current version of the package as per package.json, determines the previous version that we should run
 * typetests against.
 *
 * This is always the latest patch release of the previous major version series, which is the caret-range or equivalent.
 *
 * @param packageDir - the path to the package.
 * @param updateOptions
 * @returns
 */
export async function getAndUpdatePackageDetails(
    packageDir: string,
    updateOptions: { cwd?: string } | undefined,
): Promise<(PackageDetails & { skipReason?: undefined }) | { skipReason: string }> {
    const packageDetails = await getPackageDetails(packageDir);

    if (packageDetails.pkg.name.startsWith("@fluid-internal")) {
        return { skipReason: "Skipping package: @fluid-internal " };
    } else if (packageDetails.pkg.main?.endsWith("index.js") !== true) {
        return { skipReason: "Skipping package: no index.js in main property" };
    } else if (packageDetails.pkg.private === true) {
        return { skipReason: "Skipping package: private package" };
    } else if (packageDetails.pkg.typeValidation?.disabled === true) {
        return { skipReason: "Skipping package: type validation disabled" };
    }

    const version = packageDetails.pkg.version;
    const scheme = detectVersionScheme(version);
    let previousVersion: ReleaseVersion;

    if (scheme === "internal") {
        const [pubVer, intVer] = fromInternalScheme(version);
        if (intVer.major === 0) {
            throw new Error(`Internal major unexpectedly 0.`);
        }

        if (intVer.major === 1) {
            previousVersion = "1.0.0";
        } else {
            previousVersion = toInternalScheme(pubVer, `${intVer.major - 1}.0.0`).version;
        }
    } else if (scheme === "virtualPatch") {
        const ver = fromVirtualPatchScheme(version);
        if (ver.major <= 1) {
            throw new Error(`Virtual patch major unexpectedly <= 1.`);
        }
        previousVersion = toVirtualPatchScheme(`${ver.major - 1}.0.0`).version;
    } else {
        const ver = semver.parse(version);
        if (ver === null) {
            throw new Error(`COuldn't parse version string: ${version}`);
        }

        if (ver.major <= 1) {
            throw new Error(`Virtual patch major unexpectedly <= 1.`);
        }

        previousVersion = `${ver.major}.0.0`;
    }

    // TODO: Should we use a range instead?
    // previousVersion = isInternalVersionScheme(previousVersion)
    //     ? getVersionRange(previousVersion, "^")
    //     : `^${previousVersion}`;

    // check that the version exists on npm before trying to add the
    // dev dep and bumping the typeValidation version
    // if the version does not exist, we will defer updating the package
    const packageDef = `${packageDetails.pkg.name}@${previousVersion}`;
    const args = ["view", `"${packageDef}"`, "version", "--json"];
    const result = child_process
        .execSync(`npm ${args.join(" ")}`, { cwd: updateOptions?.cwd ?? packageDir })
        .toString();
    const maybeVersions =
        result !== undefined && result.length > 0 ? safeParse(result, args.join(" ")) : undefined;

    const versionsArray =
        typeof maybeVersions === "string"
            ? [maybeVersions]
            : Array.isArray(maybeVersions)
            ? maybeVersions
            : [];

    if (versionsArray.length > 0) {
        packageDetails.pkg.devDependencies[
            `${packageDetails.pkg.name}-previous`
        ] = `npm:${packageDef}`;

        packageDetails.pkg.devDependencies = createSortedObject(packageDetails.pkg.devDependencies);

        packageDetails.pkg.typeValidation = {
            version,
            broken: {},
        };
        await util.promisify(fs.writeFile)(
            `${packageDir}/package.json`,
            JSON.stringify(packageDetails.pkg, undefined, 2),
        );
    }
    const oldVersions = Object.keys(packageDetails.pkg.devDependencies ?? {}).filter((k) =>
        k.startsWith(packageDetails.pkg.name),
    );
    return {
        ...packageDetails,
        oldVersions,
    };
}

export async function findPackagesUnderPath(path: string) {
    const searchPaths = [path];
    const packages: string[] = [];
    while (searchPaths.length > 0) {
        const search = searchPaths.shift()!;
        if (await util.promisify(fs.exists)(`${search}/package.json`)) {
            packages.push(search);
        } else {
            searchPaths.push(
                ...fs
                    .readdirSync(search, { withFileTypes: true })
                    .filter((t) => t.isDirectory())
                    .map((d) => `${search}/${d.name}`),
            );
        }
    }
    return packages;
}
