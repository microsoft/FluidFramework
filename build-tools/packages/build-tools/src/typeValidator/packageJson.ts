/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";
import * as fs from "fs";
import * as semver from "semver";
import * as util from "util";

import {
    fromInternalScheme,
    getPreviousVersions,
    getVersionRange,
    isInternalVersionScheme,
    toInternalScheme,
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
        /**
         * The version of the package. Should match the version field in package.json.
         */
        version: string;

        /**
         * An object containing types that are known to be broken.
         */
        broken: BrokenCompatTypes;

        /**
         * If true, disables type test preparation and generation for the package.
         */
        disabled?: boolean;

        /**
         * The version used as the "previous" version to compare against when generating type tests.
         */
        baselineVersion?: string;
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
 * A type representing the different version constraint styles we use when determining the previous version for type
 * test generation.
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.3.5:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.3.0
 * previousMajor: 2.0.0-internal.1.0.0
 * previousMinor: 2.0.0-internal.2.2.0
 * ^previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0
 * ^previousMinor: >=2.0.0-internal.2.2.0 <2.0.0-internal.3.0.0
 * ~previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0
 * ~previousMinor: >=2.0.0-internal.2.2.0 <2.0.0-internal.2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.0.0:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.0.0
 * previousMajor: 2.0.0-internal.1.0.0
 * previousMinor: 2.0.0-internal.2.0.0
 * ^previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0
 * ^previousMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0
 * ~previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0
 * ~previousMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0
 *
 * @internal
 */
export type PreviousVersionStyle =
    | "baseMajor"
    | "baseMinor"
    | "previousMinor"
    | "previousMajor"
    | "^previousMajor"
    | "^previousMinor"
    | "~previousMajor"
    | "~previousMinor";

/**
 * Based on the current version of the package as per package.json, determines the previous version that we should run
 * typetests against.
 *
 * The version used for the previous version can be adjusted by passing different "style" values in via the
 * previousVersionStyle parameter.
 *
 * @param packageDir - The path to the package.
 * @param writeUpdates - If true, will update the package.json with new previous versions.
 * @param previousVersionStyle - The version style to use when determining the previous version. Can be the exact
 * previous major or minor versions, or caret/tilde-equivalent dependency ranges on those previous versions.
 * @param exactPreviousVersionString - If provided, this string will be used as the previous version string.
 * @param resetBroken - If true, clears the "broken" section of the type validation, effectively clearing all known
 * breaking changes.
 * @returns package metadata or a reason the package was skipped.
 *
 * @internal
 */
export async function getAndUpdatePackageDetails(
    packageDir: string,
    writeUpdates: boolean | undefined,
    previousVersionStyle: PreviousVersionStyle,
    exactPreviousVersionString?: string,
    resetBroken?: boolean,
): Promise<(PackageDetails & { skipReason?: undefined }) | { skipReason: string }> {
    const packageDetails = await getPackageDetails(packageDir);

    if (packageDetails.pkg.name.startsWith("@fluid-internal")) {
        // @fluid-internal packages are intended for internal use only and are not typically published. We don't make
        // compatibility promises for them, so they're excluded from type tests.
        return { skipReason: "Skipping package: @fluid-internal" };
    } else if (packageDetails.pkg.main?.endsWith("index.js") !== true) {
        // An index.js main entrypoint is required for type tests to be enabled.
        return { skipReason: "Skipping package: no index.js in main property" };
    } else if (packageDetails.pkg.private === true) {
        // Private packages aren't published, so no need to do type testing for them.
        return { skipReason: "Skipping package: private package" };
    } else if (packageDetails.pkg.typeValidation?.disabled === true) {
        // Packages can explicitly opt out of type tests by setting typeValidation.disabled to true.
        return { skipReason: "Skipping package: type validation disabled" };
    }

    const version = packageDetails.pkg.version;
    let prevVersion: string;

    if (exactPreviousVersionString === undefined) {
        const [previousMajorVersion, previousMinorVersion] = getPreviousVersions(version);
        switch (previousVersionStyle) {
            case "baseMajor": {
                const sv = semver.parse(version);
                if (sv === null) {
                    throw new Error(`Cannot parse current version: ${version}`);
                }

                if (isInternalVersionScheme(sv)) {
                    const [pubVer, intVer] = fromInternalScheme(sv);
                    prevVersion = toInternalScheme(pubVer, `${intVer.major}.0.0`).version;
                } else {
                    prevVersion = `${sv.major}.0.0`;
                }
                break;
            }

            case "baseMinor": {
                const sv = semver.parse(version);
                if (sv === null) {
                    throw new Error(`Cannot parse current version: ${version}`);
                }

                if (isInternalVersionScheme(sv)) {
                    const [pubVer, intVer] = fromInternalScheme(sv);
                    prevVersion = toInternalScheme(
                        pubVer,
                        `${intVer.major}.${intVer.minor}.0`,
                    ).version;
                } else {
                    prevVersion = `${sv.major}.${sv.minor}.0`;
                }

                break;
            }

            case "previousMajor": {
                if (previousMajorVersion === undefined) {
                    throw new Error(`Previous major version is undefined.`);
                }

                prevVersion = previousMajorVersion;
                break;
            }

            case "previousMinor": {
                if (previousMinorVersion === undefined) {
                    throw new Error(`Previous minor version is undefined.`);
                }

                prevVersion = previousMinorVersion;
                break;
            }

            case "^previousMajor": {
                if (previousMajorVersion === undefined) {
                    throw new Error(`Previous major version is undefined.`);
                }

                prevVersion = isInternalVersionScheme(previousMajorVersion)
                    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      getVersionRange(previousMajorVersion!, "^")
                    : `^${previousMajorVersion}`;
                break;
            }

            case "^previousMinor": {
                if (previousMinorVersion === undefined) {
                    throw new Error(`Previous minor version is undefined.`);
                }

                prevVersion = isInternalVersionScheme(previousMinorVersion)
                    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      getVersionRange(previousMinorVersion!, "^")
                    : `^${previousMinorVersion}`;
                break;
            }

            case "~previousMajor": {
                if (previousMajorVersion === undefined) {
                    throw new Error(`Previous major version is undefined.`);
                }

                prevVersion = isInternalVersionScheme(previousMajorVersion)
                    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      getVersionRange(previousMajorVersion!, "~")
                    : `~${previousMajorVersion}`;
                break;
            }

            case "~previousMinor": {
                if (previousMinorVersion === undefined) {
                    throw new Error(`Previous minor version is undefined.`);
                }

                prevVersion = isInternalVersionScheme(previousMinorVersion)
                    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      getVersionRange(previousMinorVersion!, "~")
                    : `~${previousMinorVersion}`;
                break;
            }
        }
    } else {
        prevVersion = exactPreviousVersionString;
    }

    // check that the version exists on npm before trying to add the
    // dev dep and bumping the typeValidation version
    // if the version does not exist, we will defer updating the package
    const packageDef = `${packageDetails.pkg.name}@${prevVersion}`;
    const args = ["view", `"${packageDef}"`, "version", "--json"];
    const result = child_process.execSync(`npm ${args.join(" ")}`, { cwd: packageDir }).toString();
    const maybeVersions = result?.length > 0 ? safeParse(result, args.join(" ")) : undefined;

    const versionsArray =
        typeof maybeVersions === "string"
            ? [maybeVersions]
            : Array.isArray(maybeVersions)
            ? maybeVersions
            : [];

    if (versionsArray.length === 0) {
        return { skipReason: `Skipping package: ${packageDef} not found on npm` };
    } else {
        packageDetails.pkg.devDependencies[
            `${packageDetails.pkg.name}-previous`
        ] = `npm:${packageDef}`;

        packageDetails.pkg.devDependencies = createSortedObject(packageDetails.pkg.devDependencies);
        const disabled = packageDetails.pkg.typeValidation?.disabled;

        packageDetails.pkg.typeValidation = {
            version,
            baselineVersion: prevVersion,
            broken: resetBroken === true ? {} : packageDetails.pkg.typeValidation?.broken ?? {},
        };

        if (disabled !== undefined) {
            packageDetails.pkg.typeValidation.disabled = disabled;
        }

        if ((writeUpdates ?? false) === true) {
            await util.promisify(fs.writeFile)(
                `${packageDir}/package.json`,
                JSON.stringify(packageDetails.pkg, undefined, 2).concat("\n"),
            );
        }
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
