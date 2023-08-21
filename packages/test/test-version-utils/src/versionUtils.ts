/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* Utilities to manage finding, installing and loading legacy versions */

import { ExecOptions, exec, execSync } from "child_process";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, mkdirSync, rmdirSync, readdirSync, readFileSync, writeFileSync } from "fs";

import { lock } from "proper-lockfile";
import * as semver from "semver";
import { pkgVersion } from "./packageVersion.js";
import { InstalledPackage } from "./testApi.js";

// Assuming this file is in dist\test, so go to ..\node_modules\.legacy as the install location
const baseModulePath = fileURLToPath(new URL("../node_modules/.legacy", import.meta.url));
const installedJsonPath = path.join(baseModulePath, "installed.json");
const getModulePath = (version: string) => path.join(baseModulePath, version);

const resolutionCache = new Map<string, string>();

// Increment the revision if we want to force installation (e.g. package list changed)
const revision = 1;

interface InstalledJson {
	revision: number;
	installed: string[];
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

		writeFileSync(installedJsonPath, JSON.stringify(data, undefined, 2), { encoding: "utf8" });
	} finally {
		release();
	}
}

function readInstalledJsonNoLock(): InstalledJson {
	const data = readFileSync(installedJsonPath, { encoding: "utf8" });
	const installedJson = JSON.parse(data) as InstalledJson;
	if (installedJson.revision !== revision) {
		// if the revision doesn't match assume that it doesn't match
		return { revision, installed: [] };
	}
	return installedJson;
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

const isInstalled = async (version: string) =>
	(await readInstalledJson()).installed.includes(version);
async function addInstalled(version: string) {
	await ensureInstalledJson();
	const release = await lock(installedJsonPath, { retries: { forever: true } });
	try {
		const installedJson = readInstalledJsonNoLock();
		if (!installedJson.installed.includes(version)) {
			installedJson.installed.push(version);
			writeFileSync(installedJsonPath, JSON.stringify(installedJson, undefined, 2), {
				encoding: "utf8",
			});
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
		writeFileSync(installedJsonPath, JSON.stringify(installedJson, undefined, 2), {
			encoding: "utf8",
		});
	} finally {
		release();
	}
}

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
		throw new Error(`No matching version found in ${baseModulePath} (requested: ${requested})`);
	} else {
		const result = execSync(
			`npm v @fluidframework/container-loader@"${requested}" version --json`,
			{ encoding: "utf8" },
		);
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
			};
			// Install the packages
			await new Promise<void>((resolve, reject) =>
				exec(`npm init --yes`, options, (error, stdout, stderr) => {
					if (error) {
						reject(new Error(`Failed to initialize install directory ${modulePath}`));
					}
					resolve();
				}),
			);
			await new Promise<void>((resolve, reject) =>
				exec(
					`npm i --no-package-lock ${adjustedPackageList
						.map((pkg) => `${pkg}@${version}`)
						.join(" ")}`,
					options,
					(error, stdout, stderr) => {
						if (error) {
							reject(new Error(`Failed to install in ${modulePath}\n${stderr}`));
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

export const loadPackage = async (modulePath: string, pkg: string): Promise<any> =>
	import(pathToFileURL(path.join(modulePath, "node_modules", pkg, "dist", "index.js")).href);
/**
 * Used to get the major version number above or below the baseVersion.
 * @param baseVersion - The base version to move from (eg. "0.60.0")
 * @param requested - Number representing the major version to move from. These are
 * generally negative to move back versions (eg. -1).
 * Note: If the requested number is a string then that will be the returned value
 */
export function getRequestedRange(baseVersion: string, requested?: number | string): string {
	if (requested === undefined || requested === 0) {
		return baseVersion;
	}
	if (typeof requested === "string") {
		return requested;
	}

	const isInternal = baseVersion.includes("internal");
	const isDev = baseVersion.includes("dev");

	// if the baseVersion passed is an internal version
	if (isInternal) {
		const internalVersions = baseVersion.split("-internal.");
		return internalSchema(internalVersions[0], internalVersions[1], requested);
	}

	// if the baseVersion passed is a pre-released version
	if (isDev) {
		const devVersions = baseVersion.split("-dev.");
		return internalSchema(devVersions[0], devVersions[1].split(".", 3).join("."), requested);
	}

	let version;
	try {
		version = new semver.SemVer(baseVersion);
	} catch (err: unknown) {
		throw new Error(err as string);
	}

	// calculate requested major version number
	// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
	const requestedMajorVersion = version.major + requested;
	// if the major version number is bigger than 0 then return it as normal
	if (requestedMajorVersion > 0) {
		return `^${requestedMajorVersion}.0.0-0`;
	}
	// if the major version number is <= 0 then we return the equivalent pre-releases
	const lastPrereleaseVersion = new semver.SemVer("0.59.0");

	// Minor number in 0.xx release represent a major change hence different rules
	// are applied for computing the requested version.
	// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
	const requestedMinorVersion = lastPrereleaseVersion.minor + requestedMajorVersion;
	// too old a version / non existing version requested
	if (requestedMinorVersion <= 0) {
		// cap at min version
		return "^0.0.1-0";
	}
	return `^0.${requestedMinorVersion}.0-0`;
}

export function internalSchema(
	publicVersion: string,
	internalVersion: string,
	requested: number,
): string {
	if (publicVersion === "2.0.0" && internalVersion < "2.0.0" && requested === -1) {
		return `^1.0.0-0`;
	}
	if (publicVersion === "2.0.0" && internalVersion < "2.0.0" && requested === -2) {
		return `^0.59.0-0`;
	}
	if (
		publicVersion === "2.0.0" &&
		internalVersion >= "2.0.0" &&
		internalVersion < "3.0.0" &&
		requested === -2
	) {
		return `^1.0.0-0`;
	}

	// if the version number is for the older version scheme before 1.0.0
	if (publicVersion === "2.0.0" && internalVersion <= "2.0.0" && requested < -2) {
		const lastPrereleaseVersion = new semver.SemVer("0.59.0");
		const requestedMinorVersion = lastPrereleaseVersion.minor + requested + 2;
		return `^0.${requestedMinorVersion}.0-0`;
	}

	let parsedVersion;
	let semverInternal: string = internalVersion;

	// applied for all the baseVersion passed as 2.0.0-internal-3.0.0 or greater in 2.0.0 internal series
	if (internalVersion > publicVersion && requested <= -2) {
		const version = internalVersion.split(".");
		semverInternal = (parseInt(version[0], 10) + requested + 1).toString().concat(".0.0");
	}

	try {
		parsedVersion = new semver.SemVer(semverInternal);
	} catch (err: unknown) {
		throw new Error(err as string);
	}

	return `>=${publicVersion}-internal.${parsedVersion.major - 1}.0.0 <${publicVersion}-internal.${
		parsedVersion.major
	}.0.0`;
}

export function versionHasMovedSparsedMatrix(version: string): boolean {
	// SparseMatrix was moved to "@fluid-experimental/sequence-deprecated" in "2.0.0-internal.2.0.0"
	return (
		version >= "2.0.0-internal.2.0.0" || (!version.includes("internal") && version >= "2.0.0")
	);
}
