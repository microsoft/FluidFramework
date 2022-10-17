/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";
import * as fs from "fs";
import * as util from "util";

import {
    getPreviousVersions,
    getVersionRange,
    isInternalVersionScheme,
} from "@fluid-tools/version-tools";

import { Logger } from "../common/logging";

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

type PreviousVersionStyle =
    | "^previousMajor"
    | "^previousMinor"
    | "~previousMajor"
    | "~previousMinor"
    | "previousMajor"
    | "previousMinor";

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
 */
export async function getAndUpdatePackageDetails(
    packageDir: string,
    writeUpdates: boolean | undefined,
    previousVersionStyle: PreviousVersionStyle = "previousMinor",
    exactPreviousVersionString?: string,
    resetBroken?: boolean,
): Promise<(PackageDetails & { skipReason?: undefined }) | { skipReason: string }> {
    const packageDetails = await getPackageDetails(packageDir);

    if (packageDetails.pkg.name.startsWith("@fluid-internal")) {
        return { skipReason: "Skipping package: @fluid-internal" };
    } else if (packageDetails.pkg.main?.endsWith("index.js") !== true) {
        return { skipReason: "Skipping package: no index.js in main property" };
    } else if (packageDetails.pkg.private === true) {
        return { skipReason: "Skipping package: private package" };
    } else if (packageDetails.pkg.typeValidation === undefined) {
        return {
            skipReason: 'Skipping package: add "typeValidation: {}" to package.json to enable.',
        };
    } else if (packageDetails.pkg.typeValidation?.disabled === true) {
        return { skipReason: "Skipping package: type validation disabled" };
    }

    const version = packageDetails.pkg.version;
    let prevVersion: string;

    if (exactPreviousVersionString === undefined) {
        const [previousMajorVersion, previousMinorVersion] = getPreviousVersions(version);
        switch (previousVersionStyle) {
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
            broken: resetBroken === true ? {} : packageDetails.pkg.typeValidation?.broken ?? {},
        };

        if (disabled !== undefined) {
            packageDetails.pkg.typeValidation.disabled = disabled;
        }

        if ((writeUpdates ?? false) === true) {
            await util.promisify(fs.writeFile)(
                `${packageDir}/package.json`,
                JSON.stringify(packageDetails.pkg, undefined, 2),
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
