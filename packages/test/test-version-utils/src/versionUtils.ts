/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for loading legacy versions of Fluid Framework packages for compatibility testing.
 *
 * ## Architecture
 *
 * Legacy packages live in a single committed pnpm sub-workspace at `compat-workspaces/full/`.
 * The workspace is installed automatically when `pnpm install` is run from the repo root (via
 * the `postinstall` script in this package's `package.json`), so no runtime installation step
 * is required in tests.
 *
 * The exact resolved versions are recorded in `compat-workspaces/generated-versions.cjs`, which is
 * maintained by the `update-compat-versions` script and committed to the repository. Tests
 * read this manifest at startup to resolve version ranges to exact versions.
 *
 * ## Updating compat versions
 *
 * After a version bump, run:
 * `pnpm run update-compat-versions`
 *
 * This regenerates `generated-versions.cjs` and all per-version `package.json` files, then runs
 * `pnpm install --no-frozen-lockfile` in the workspace to update the committed lockfile.
 * Commit all changes produced by the script.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { detectVersionScheme, fromInternalScheme } from "@fluid-tools/version-tools";
import { assert } from "@fluidframework/core-utils/internal";
import * as semver from "semver";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// From compiled lib/, go up one level to reach the package root, then into compat-workspaces/
const compatWorkspacesDir = fileURLToPath(new URL("../compat-workspaces", import.meta.url));
const generatedVersionsCjsPath = path.join(compatWorkspacesDir, "generated-versions.cjs");

export const fullWorkspaceDir = path.join(compatWorkspacesDir, "full");

// ---------------------------------------------------------------------------
// generated-versions.cjs manifest
// ---------------------------------------------------------------------------

/**
 * Schema for the committed `compat-workspaces/generated-versions.cjs` file.
 */
export interface CompatVersionsManifest {
	/** All exact versions installed in `compat-workspaces/full/`, newest first. */
	versions: string[];
}

let cachedManifest: CompatVersionsManifest | undefined;

/**
 * Reads the committed versions manifest.
 */
export function readVersionsManifest(): CompatVersionsManifest {
	if (cachedManifest !== undefined) return cachedManifest;
	if (!existsSync(generatedVersionsCjsPath)) {
		throw new Error("Could not read versions manifest");
	}
	cachedManifest = createRequire(import.meta.url)(
		generatedVersionsCjsPath,
	) as CompatVersionsManifest;
	return cachedManifest;
}

/**
 * Returns all exact versions recorded in the manifest.
 */
export function getAllManifestVersions(manifest: CompatVersionsManifest): string[] {
	return manifest.versions;
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

const resolutionCache = new Map<string, string>();

// See https://github.com/nodejs/node-v0.x-archive/issues/2318.
// Note that execFile and execFileSync are used to avoid command injection vulnerability flagging from CodeQL.
// pnpm is used instead of npm for package installation to enable security flags (--ignore-scripts, --prefer-offline).
const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/**
 * Resolves a version range or alias to an exact version using the committed manifest.
 *
 * @internal
 */
export function resolveVersion(requested: string, installed: boolean): string {
	const cachedVersion = resolutionCache.get(requested);
	if (cachedVersion) {
		return cachedVersion;
	}
	if (semver.valid(requested)) {
		// If it is a valid semver already instead of a range, just use it
		resolutionCache.set(requested, requested);
		return requested;
	}

	if (!semver.validRange(requested)) {
		throw new Error(`Invalid semver range: "${requested}"`);
	}

	if (installed) {
		const manifest = readVersionsManifest();
		const matching = manifest.versions
			.filter((v) => semver.valid(v) && semver.satisfies(v, requested))
			.sort(semver.rcompare);
		if (matching.length > 0) {
			resolutionCache.set(requested, matching[0]);
			return matching[0];
		}
		throw new Error(`No version in manifest satisfies range: "${requested}"`);
	} else {
		let result: string | undefined;
		try {
			result = execFileSync(
				pnpmCmd,
				["view", `"@fluidframework/container-loader@${requested}"`, "version", "--json"],
				{
					encoding: "utf8",
					// When using pnpm.cmd shell must be true: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
					shell: true,
				},
			);
		} catch (error: any) {
			debugger;
			throw new Error(
				`Error while running: ${pnpmCmd} view "@fluidframework/container-loader@${requested}" version --json`,
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

// ---------------------------------------------------------------------------
// Installed package lookup
// ---------------------------------------------------------------------------

/**
 * Resolves an exact version string to its installed module path in `compat-workspaces/full/`.
 *
 * The workspace is expected to be pre-installed via the package `postinstall` hook. Throws a
 * descriptive error if the version directory is not found.
 * @internal
 */
export function checkInstalled(requested: string): { version: string; modulePath: string } {
	const version = resolveVersion(requested, true);
	const versionDir = path.join(fullWorkspaceDir, version);

	if (existsSync(versionDir)) {
		return { version, modulePath: versionDir };
	}

	throw new Error(
		`Version ${version} is not installed in compat-workspaces/full/.\n` +
			`Run \`pnpm run update-compat-versions\` to regenerate the workspace, then re-run \`pnpm install\`.`,
	);
}

// ---------------------------------------------------------------------------
// Package loading
// ---------------------------------------------------------------------------

/**
 * Dynamically loads a package from the specified module path.
 *
 * @param modulePath - Path to the version directory (e.g. `compat-workspaces/full/2.83.0`).
 * @param pkg - Package name to load (e.g. `@fluidframework/container-loader`).
 * @remarks
 * This function reimplements part of Node's module resolution logic. It would be possible to use `createRequire` / `import` alternatively,
 * but if this approach is taken, the compat workspace where prior versions of FF get installed *must* be moved outside of a context that might
 * have other versions of FF installed in parent folders. Otherwise, Node's module resolution might happily load incorrect versions of FF packages
 * from parent folders instead of the intended versions, which would silently break the tests.
 * @internal
 */
export const loadPackage = async (
	modulePath: string,
	pkg: string,
	importPath: "." | `./${string}` = ".",
): Promise<any> => {
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
			const exp: any | undefined = pkgJson.exports[importPath] ?? pkgJson.exports["."];
			primaryExport =
				typeof exp === "string"
					? exp
					: exp.require !== undefined
						? exp.require.default
						: exp.default;
			if (typeof primaryExport !== "string") {
				// eslint-disable-next-line unicorn/prefer-type-error -- this isn't a TypeError really; it is an internal logic shortcoming; entry might not be a string
				throw new Error(
					`Package ${pkg} defined subpath exports but no recognizable ${importPath} entry.`,
				);
			}
		}
	} else {
		if (pkgJson.main === undefined) {
			throw new Error(`No main or exports in package.json for ${pkg}`);
		}
		if (importPath !== ".") {
			console.warn(
				`Package ${pkg} main used despite request for ${importPath} entry (no "exports" property found).`,
			);
		}
		primaryExport = pkgJson.main;
	}
	return import(pathToFileURL(path.join(pkgPath, primaryExport)).href);
};

// ---------------------------------------------------------------------------
// Version arithmetic
// ---------------------------------------------------------------------------

/**
 * Computes the semver range corresponding to a delta from a base version, without resolving it
 * to an exact version. Used by both the test runtime and the `update-compat-versions` script.
 */
export function calculateRequestedRange(
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
 * Given a version, returns the most recently released version. The version provided can be
 * adjusted to the next or previous major versions by providing positive/negative integers in the
 * `requested` parameter.
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes a semver range for a version expressed in Fluid's internal/RC scheme
 * (e.g. `2.0.0-internal.3.0.0`) after applying a negative `requested` delta.
 *
 * Handles several cross-tier edge cases:
 * - RC → internal: going back far enough from an RC release crosses into internal releases.
 * - internal → public 1.x / 0.x: going back from early 2.0.0-internal.x versions crosses
 * into the public 1.x and pre-1.0 (0.xx) release lines.
 * - Skipping RC tiers when the delta spans into the internal series from RC.
 */
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
 * Checks if the given version has the SparseMatrix moved to sequence-deprecated.
 *
 * @internal
 */
export function versionHasMovedSparsedMatrix(version: string): boolean {
	// SparseMatrix was moved to "@fluid-experimental/sequence-deprecated" in "2.0.0-internal.2.0.0"
	return (
		version >= "2.0.0-internal.2.0.0" || (!version.includes("internal") && version >= "2.0.0")
	);
}

/**
 * Converts a version string to a numeric value for comparison purposes.
 *
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
