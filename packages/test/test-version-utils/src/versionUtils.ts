/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* Utilities to manage finding, installing and loading legacy versions */

import { ExecOptions, execFileSync, execFile } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	rmdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { detectVersionScheme, fromInternalScheme } from "@fluid-tools/version-tools";
import { LazyPromise, assert } from "@fluidframework/core-utils/internal";
import { lock } from "proper-lockfile";
import * as semver from "semver";

import { pkgVersion } from "./packageVersion.js";
import { InstalledPackage } from "./testApi.js";

// Assuming this file is in `lib`, so go to `..\node_modules\.legacy` as the install location
const baseModulePath = fileURLToPath(new URL("../node_modules/.legacy", import.meta.url));
const installedJsonPath = path.join(baseModulePath, "installed.json");
const getModulePath = (version: string) => path.join(baseModulePath, version);

const resolutionCache = new Map<string, string>();

// Increment the revision if we want to force installation (e.g. package list changed)
const revision = 3;

interface InstalledJson {
	revision: number;
	installed: string[];
}

let cachedInstalledJson: InstalledJson | undefined;
function writeAndUpdateInstalledJson(data: InstalledJson) {
	cachedInstalledJson = data;
	writeFileSync(installedJsonPath, JSON.stringify(data, undefined, 2), { encoding: "utf8" });
}

async function ensureInstalledJson() {
	if (existsSync(installedJsonPath)) {
		return;
	}
	const release = await lock(fileURLToPath(import.meta.url), { retries: { forever: true } });
	try {
		// Check it again under the lock
		if (existsSync(installedJsonPath)) {
			return;
		}
		// Create the directory
		mkdirSync(baseModulePath, { recursive: true });
		const data: InstalledJson = { revision, installed: [] };

		writeAndUpdateInstalledJson(data);
	} finally {
		release();
	}
}
const ensureInstalledJsonLazy = new LazyPromise(async () => ensureInstalledJson());

function readInstalledJsonNoLock(): InstalledJson {
	const data = readFileSync(installedJsonPath, { encoding: "utf8" });
	const installedJson = JSON.parse(data) as InstalledJson;
	if (installedJson.revision !== revision) {
		// if the revision doesn't match assume that it doesn't match
		return { revision, installed: [] };
	}
	cachedInstalledJson = installedJson;
	return installedJson;
}

async function readInstalledJson(): Promise<InstalledJson> {
	await ensureInstalledJsonLazy;
	const release = await lock(installedJsonPath, { retries: { forever: true } });
	try {
		return readInstalledJsonNoLock();
	} finally {
		release();
	}
}
const readInstalledJsonLazy = new LazyPromise(async () => readInstalledJson());
async function getInstalledJson(): Promise<InstalledJson> {
	return cachedInstalledJson ?? (await readInstalledJsonLazy);
}

const isInstalled = async (version: string) =>
	(await getInstalledJson()).installed.includes(version);
async function addInstalled(version: string) {
	await ensureInstalledJsonLazy;
	const release = await lock(installedJsonPath, { retries: { forever: true } });
	try {
		const installedJson = readInstalledJsonNoLock();
		if (!installedJson.installed.includes(version)) {
			installedJson.installed.push(version);
			writeAndUpdateInstalledJson(installedJson);
		}
	} finally {
		release();
	}
}

async function removeInstalled(version: string) {
	await ensureInstalledJsonLazy;
	const release = await lock(installedJsonPath, { retries: { forever: true } });
	try {
		const installedJson = readInstalledJsonNoLock();
		installedJson.installed = installedJson.installed.filter((value) => value !== version);
		writeAndUpdateInstalledJson(installedJson);
	} finally {
		release();
	}
}

// See https://github.com/nodejs/node-v0.x-archive/issues/2318.
// Note that execFile and execFileSync are used to avoid command injection vulnerability flagging from CodeQL.
const npmCmd =
	process.platform.includes("win") && !process.platform.includes("darwin") ? "npm.cmd" : "npm";

/**
 * @internal
 */
export function resolveVersion(requested: string, installed: boolean) {
	const cachedVersion = resolutionCache.get(requested);
	if (cachedVersion) {
		return cachedVersion;
	}
	if (semver.valid(requested)) {
		// If it is a valid semver already instead of a range, just use it
		resolutionCache.set(requested, requested);
		return requested;
	}

	if (installed) {
		// Check the install directory instead of asking NPM for it.
		const files = readdirSync(baseModulePath, { withFileTypes: true });
		let found: string | undefined;
		files.map((dirent) => {
			if (
				dirent.isDirectory() &&
				semver.valid(dirent.name) &&
				semver.satisfies(dirent.name, requested)
			) {
				if (!found || semver.lt(found, dirent.name)) {
					found = dirent.name;
				}
			}
		});
		if (found) {
			return found;
		}
		throw new Error(
			`No matching version found in ${baseModulePath} (requested: ${requested})`,
		);
	} else {
		let result: string | undefined;
		try {
			result = execFileSync(
				npmCmd,
				["v", `"@fluidframework/container-loader@${requested}"`, "version", "--json"],
				{
					encoding: "utf8",
					// When using npm.cmd shell must be true: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
					shell: true,
				},
			);
		} catch (error: any) {
			debugger;
			throw new Error(
				`Error while running: ${npmCmd} v "@fluidframework/container-loader@${requested}" version --json`,
			);
		}
		if (result === "" || result === undefined) {
			throw new Error(`No version published as ${requested}`);
		}

		try {
			const versions: string | string[] = result !== "" ? JSON.parse(result) : "";
			const version = Array.isArray(versions) ? versions.sort(semver.rcompare)[0] : versions;
			if (version) {
				resolutionCache.set(requested, version);
				return version;
			}
		} catch (e) {
			throw new Error(`Error parsing versions for ${requested}`);
		}

		throw new Error(`No version found for ${requested}`);
	}
}

async function ensureModulePath(version: string, modulePath: string) {
	const release = await lock(baseModulePath, { retries: { forever: true } });
	try {
		console.log(`Installing version ${version} at ${modulePath}`);
		if (!existsSync(modulePath)) {
			// Create the under the baseModulePath lock
			mkdirSync(modulePath, { recursive: true });
		}
	} finally {
		release();
	}
}

/**
 * @internal
 */
export async function ensureInstalled(
	requested: string,
	packageList: string[],
	force: boolean,
): Promise<InstalledPackage | undefined> {
	if (requested === pkgVersion) {
		return;
	}
	const version = resolveVersion(requested, false);
	const modulePath = getModulePath(version);

	if (!force && (await isInstalled(version))) {
		return { version, modulePath };
	}

	await ensureModulePath(version, modulePath);

	const adjustedPackageList = [...packageList];
	if (versionHasMovedSparsedMatrix(version)) {
		adjustedPackageList.push("@fluid-experimental/sequence-deprecated");
	}

	// Release the base path but lock the modulePath so we can do parallel installs
	const release = await lock(modulePath, { retries: { forever: true } });
	try {
		if (force) {
			// remove version from install.json under the modulePath lock
			await removeInstalled(version);
		}

		// Check installed status again under lock the modulePath lock
		if (force || !(await isInstalled(version))) {
			const options: ExecOptions = {
				cwd: modulePath,
				env: {
					...process.env,
					// Reset any parent process node options: path-specific options (ex: --require, --experimental-loader)
					// will otherwise propagate to these commands but fail to resolve.
					NODE_OPTIONS: "",
				},
				// When using npm.cmd shell must be true: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
				// @ts-expect-error ExecOptions does not acknowledge boolean for `shell` as a valid option (at least as of @types/node@18.19.1)
				shell: true,
			};
			// Install the packages
			await new Promise<void>((resolve, reject) =>
				execFile(
					npmCmd,
					// Added --verbose to try to troubleshoot AB#6195.
					// We should probably remove it if when find the root cause and fix for that.
					["init", "--yes", "--verbose"],
					options,
					(error, stdout, stderr) => {
						if (error) {
							const errorString =
								error instanceof Error
									? `${error.message}\n${error.stack}`
									: JSON.stringify(error);
							reject(
								new Error(
									`Failed to initialize install directory ${modulePath}\nError:${errorString}\nStdOut:${stdout}\nStdErr:${stderr}`,
								),
							);
						}
						resolve();
					},
				),
			);
			await new Promise<void>((resolve, reject) =>
				execFile(
					npmCmd,
					// Added --verbose to try to troubleshoot AB#6195.
					// We should probably remove it when we find the root cause and fix for that.
					[
						"i",
						"--no-package-lock",
						"--verbose",
						...adjustedPackageList.map((pkg) => `${pkg}@${version}`),
					],
					options,
					(error, stdout, stderr) => {
						if (error) {
							const errorString =
								error instanceof Error
									? `${error.message}\n${error.stack}`
									: JSON.stringify(error);
							reject(
								new Error(
									`Failed to install in ${modulePath}\nError:${errorString}\nStdOut:${stdout}\nStdErr:${stderr}`,
								),
							);
						}
						resolve();
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
		try {
			(rmdirSync as any)(modulePath, { recursive: true });
		} catch (ex) {}
		throw new Error(`Unable to install version ${version}\n${e}`);
	} finally {
		release();
	}
}

/**
 * @internal
 */
export function checkInstalled(requested: string) {
	const version = resolveVersion(requested, true);
	const modulePath = getModulePath(version);
	if (existsSync(modulePath)) {
		// assume it is valid if it exists
		return { version, modulePath };
	}
	throw new Error(
		`Requested version ${requested} resolved to ${version} is not installed at ${modulePath}`,
	);
}

/**
 * @internal
 */
export const loadPackage = async (modulePath: string, pkg: string): Promise<any> => {
	const pkgPath = path.join(modulePath, "node_modules", pkg);
	// Because we put legacy versions in a specific subfolder of node_modules (.legacy/<version>), we need to reimplement
	// some of Node's module loading logic here.
	// It would be ideal to remove the need for this duplication (e.g. by using node:module APIs instead) if possible.
	const pkgJson: { main?: string; exports?: string | Record<string, any> } = JSON.parse(
		readFileSync(path.join(pkgPath, "package.json"), { encoding: "utf8" }),
	);
	// See: https://nodejs.org/docs/latest-v18.x/api/packages.html#package-entry-points
	let primaryExport: string;
	if (pkgJson.exports !== undefined) {
		// See https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports for information on the spec
		// if this assert fails.
		// The v18 doc doesn't mention that export paths must start with ".", but the modern docs do:
		// https://nodejs.org/api/packages.html#exports
		for (const key of Object.keys(pkgJson.exports)) {
			if (!key.startsWith(".")) {
				throw new Error(
					"Conditional exports not supported by test-version-utils. Legacy module loading logic needs to be updated.",
				);
			}
		}
		if (typeof pkgJson.exports === "string") {
			primaryExport = pkgJson.exports;
		} else {
			const exp: any | undefined = pkgJson.exports["."];
			primaryExport =
				typeof exp === "string"
					? exp
					: exp.require !== undefined
						? exp.require.default
						: exp.default;
			if (primaryExport === undefined) {
				throw new Error(`Package ${pkg} defined subpath exports but no '.' entry.`);
			}
		}
	} else {
		if (pkgJson.main === undefined) {
			throw new Error(`No main or exports in package.json for ${pkg}`);
		}
		primaryExport = pkgJson.main;
	}
	return import(pathToFileURL(path.join(pkgPath, primaryExport)).href);
};

/**
 * Helper function for `getRequestedVersion()`. This function calculates the requested version **range**
 * based on the base version and the requested value, **without** validating it via npm.
 */
function calculateRequestedRange(
	baseVersion: string,
	requested?: number | string,
	adjustPublicMajor: boolean = false,
): string {
	if (requested === undefined || requested === 0) {
		return baseVersion;
	}
	if (typeof requested === "string") {
		return requested;
	}
	if (requested > 0) {
		throw new Error("Only negative values are supported for `requested` param.");
	}

	const scheme = detectVersionScheme(baseVersion);

	// if the baseVersion passed is an internal version
	if (
		adjustPublicMajor === false &&
		(scheme === "internal" || scheme === "internalPrerelease")
	) {
		const [publicVersion, internalVersion, prereleaseIdentifier] = fromInternalScheme(
			baseVersion,
			/** allowPrereleases */ true,
			/** allowAnyPrereleaseId */ true,
		);

		const internalSchemeRange = internalSchema(
			publicVersion.version,
			internalVersion.version,
			prereleaseIdentifier,
			requested,
		);
		return internalSchemeRange;
	}

	let version: semver.SemVer;
	try {
		version = new semver.SemVer(baseVersion);
	} catch (err: unknown) {
		throw new Error(err as string);
	}

	// If the base version is a public version and `adjustPublicMajor` is false, then we need to ensure that we
	// calculate N-1 as the previous major release, regardless if it is public or internal.
	// Currently, this case only applies to calculating N-X for 2.x.y.
	// TODO: This is a temporary solution and we need to entirely rewrite this function to handle the changes the version schemas. See ADO:8198.
	if (adjustPublicMajor === false && version.major > 1) {
		if (version.minor < 10) {
			// If 2.0 <= N < 2.10, then we can pretend that N is RC6 (*which doesn't exist*) and calculate the range as if it were an internal version.
			const internalSchemeRange = internalSchema("2.0.0", "6.0.0", "rc", requested);
			return internalSchemeRange;
		} else {
			// For each requested version to go back, we go back 10 minor versions. If requested is -2, then we need to go back 20 minor versions.
			const legacyMinorsToSkip = Math.abs(requested * 10);
			if (legacyMinorsToSkip > version.minor) {
				// If the number of minors we need to go back is greater than the minor version, then that means we will be going back to RC releases.
				// Here we calculate how many more releases we need to go back **after** we take into account going from the current minor version to 2.0.
				// For example, if N is 2.20, then the range we need to return for N-1 starts at 2.10, for N-2 it starts at 2.0, N-3 is RC5, N-4 is RC4, etc.
				// So if N is 2.20 and requested is 4, then we still need to go back 2 more releases from 2.0 (treated as RC6).
				const remainingRequested =
					(legacyMinorsToSkip - Math.floor(version.minor / 10) * 10) / 10;
				const internalSchemeRange = internalSchema(
					"2.0.0",
					"6.0.0",
					"rc",
					remainingRequested * -1, // make sure the value is negative since we made it positive above
				);
				return internalSchemeRange;
			}
			// Here we know that the requested version will be >=2.0, so we can avoid all the RC releases.
			// If N >= 2.10, then the range we need to return for N-1 starts at legacy breaking minor before the one N belongs to.
			const lowerMinorRange = Math.floor((version.minor - legacyMinorsToSkip) / 10) * 10;
			const upperMinorRange = lowerMinorRange + 10;
			// Here we do a range that, when resolved, will result in the latest minor version that satisfies the request.
			return `>=${version.major}.${lowerMinorRange}.0-0 <${version.major}.${upperMinorRange}.0-0`;
		}
	} else {
		// calculate requested major version number
		const requestedMajorVersion = version.major + requested;
		// if the major version number is bigger than 0 then return it as normal
		if (requestedMajorVersion > 0) {
			return `^${requestedMajorVersion}.0.0-0`;
		}
		// if the major version number is <= 0 then we return the equivalent pre-releases
		const lastPrereleaseVersion = new semver.SemVer("0.59.0");

		// Minor number in 0.xx release represent a major change hence different rules
		// are applied for computing the requested version.
		const requestedMinorVersion = lastPrereleaseVersion.minor + requestedMajorVersion;
		// too old a version / non existing version requested
		if (requestedMinorVersion <= 0) {
			// cap at min version
			return "^0.0.1-0";
		}
		return `^0.${requestedMinorVersion}.0-0`;
	}
}

/**
 *
 * Given a version, returns the most recently released version. The version provided can be adjusted to
 * the next or previous major versions by providing positive/negative integers in the `requested` parameter.
 *
 * @param baseVersion - The base version to move from (eg. "0.60.0")
 * @param requested - If the value is a negative number, the baseVersion will be adjusted down.
 * If the value is a string then it will be returned as-is. Throws on positive number.
 * @param adjustPublicMajor - If `baseVersion` is a Fluid internal version, then this boolean controls whether the
 * public or internal version is adjusted by the `requested` value. This parameter has no effect if `requested` is a
 * string value or if `baseVersion` is not a Fluid internal version.
 *
 * @remarks
 *
 * In typical use, the `requested` values are negative values to return ranges for previous versions (e.g. "-1").
 *
 * @example
 * ```typescript
 * const newVersion = getRequestedVersion("2.3.5", -1); // "^1.0.0"
 * ```
 *
 * @example
 * ```typescript
 * const newVersion = getRequestedVersion("2.3.5", -2); // "^0.59.0"
 * ```
 *
 * @internal
 */
export function getRequestedVersion(
	baseVersion: string,
	requested?: number | string,
	adjustPublicMajor: boolean = false,
): string {
	const calculatedRange = calculateRequestedRange(baseVersion, requested, adjustPublicMajor);
	try {
		// Returns the exact version that was requested (i.e. 2.0.0-rc.2.0.2).
		// Will throw if the requested version range is not valid.
		return resolveVersion(calculatedRange, false);
	} catch (err: any) {
		// If we tried fetching N-1 and it failed, try N-2. It is possible that we are trying to bump the current branch
		// to a new version. If that is the case, then N-1 may not be published yet, and we should try to use N-2 in it's place.
		if (requested === -1) {
			const resolvedVersion = getRequestedVersion(baseVersion, -2, adjustPublicMajor);
			// Here we cache the result so we don't have to enter the try/catch flow again.
			// Note: This will cache the resolved version range (i.e. >=2.0.0-rc.4.0.0 <2.0.0-rc.5.0.0). Because of this,
			// it will not cause any conflicts when trying to fetch the current version
			// i.e. `getRequestedVersion("2.0.0-rc.5.0.0", 0, false)` will still return "2.0.0-rc.5.0.0".
			resolutionCache.set(calculatedRange, resolvedVersion);
			return resolvedVersion;
		} else {
			throw new Error(`Error trying to getRequestedVersion: ${err}`);
		}
	}
}

function internalSchema(
	publicVersion: string,
	internalVersion: string,
	prereleaseIdentifier: string,
	requested: number,
): string {
	if (requested === 0) {
		return `${publicVersion}-${prereleaseIdentifier}.${internalVersion}`;
	}

	// Here we handle edge cases of converting the early rc/internal releases.
	// We convert early rc releases to internal releases, and early internal releases to public releases.
	if (prereleaseIdentifier === "rc" || prereleaseIdentifier === "dev-rc") {
		if (semver.eq(publicVersion, "2.0.0")) {
			const parsed = semver.parse(internalVersion);
			assert(parsed !== null, "internalVersion should be parsable");
			if (parsed.major + requested < 1) {
				// If the request will evaluate to a pre-RC release, we need to convert the request
				// to the equivalent internal release request.
				return internalSchema("2.0.0", "8.0.0", "internal", requested + parsed.major);
			}
		}
	} else if (semver.eq(publicVersion, "2.0.0") && semver.lt(internalVersion, "2.0.0")) {
		if (requested === -1) {
			return `^1.0.0-0`;
		}

		if (requested === -2) {
			return `^0.59.0-0`;
		}
	}

	if (
		semver.eq(publicVersion, "2.0.0") &&
		semver.gte(internalVersion, "2.0.0") &&
		semver.lt(internalVersion, "3.0.0") &&
		requested === -2
	) {
		return `^1.0.0-0`;
	}

	// if the version number is for the older version scheme before 1.0.0
	if (
		semver.eq(publicVersion, "2.0.0") &&
		semver.lte(internalVersion, "2.0.0") &&
		requested < -2
	) {
		const lastPrereleaseVersion = new semver.SemVer("0.59.0");
		const requestedMinorVersion = lastPrereleaseVersion.minor + requested + 2;
		return `^0.${requestedMinorVersion}.0-0`;
	}

	let parsedVersion;
	let semverInternal: string = internalVersion;

	// applied for all the baseVersion passed as 2.0.0-internal-3.0.0 or greater in 2.0.0 internal series
	if (semver.gt(internalVersion, publicVersion) && requested <= -2) {
		const parsed = new semver.SemVer(internalVersion);
		semverInternal = (parsed.major + requested + 1).toString().concat(".0.0");
	}

	try {
		parsedVersion = new semver.SemVer(semverInternal);
	} catch (err: unknown) {
		throw new Error(err as string);
	}

	// Convert any pre/dev release indicators to internal or rc; default to "internal"
	const idToUse = prereleaseIdentifier.includes("rc") ? "rc" : "internal";
	return `>=${publicVersion}-${idToUse}.${
		parsedVersion.major - 1
	}.0.0 <${publicVersion}-${idToUse}.${parsedVersion.major}.0.0`;
}

/**
 * @internal
 */
export function versionHasMovedSparsedMatrix(version: string): boolean {
	// SparseMatrix was moved to "@fluid-experimental/sequence-deprecated" in "2.0.0-internal.2.0.0"
	return (
		version >= "2.0.0-internal.2.0.0" || (!version.includes("internal") && version >= "2.0.0")
	);
}

/**
 * @internal
 */
export function versionToComparisonNumber(version: string): number {
	if (version.startsWith("0.")) {
		return 0;
	}
	if (version.startsWith("1.")) {
		return 1;
	}
	if (version.startsWith("2.0.0-internal.1")) {
		return 2;
	}
	if (version.startsWith("2.0.0-internal.2")) {
		return 3;
	}
	if (version.startsWith("2.0.0-internal.3")) {
		return 4;
	}
	if (version.startsWith("2.0.0-internal.4")) {
		return 5;
	}
	if (version.startsWith("2.0.0-internal.5")) {
		return 6;
	}
	if (version.startsWith("2.0.0-internal.6")) {
		return 7;
	}
	if (version.startsWith("2.0.0-internal.7")) {
		return 8;
	}
	if (version.startsWith("2.0.0-internal.8")) {
		return 9;
	}
	if (version.startsWith("2.0.0-rc.1")) {
		return 10;
	}
	if (version.startsWith("2.0.0-rc.2")) {
		return 11;
	}
	if (version.startsWith("2.0.0-rc.3")) {
		return 12;
	}
	if (version.startsWith("2.0.0-rc.4")) {
		return 13;
	}
	if (version.startsWith("2.0.0-rc.5")) {
		return 14;
	}

	const parsed = semver.parse(version);
	if (!parsed) {
		throw new Error(`Invalid version: ${version}`);
	}
	return parsed.major * 1_000_000 + parsed.minor * 1000 + parsed.patch + 15;
}
