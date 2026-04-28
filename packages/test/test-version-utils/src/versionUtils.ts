/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for finding, installing, and loading legacy versions of Fluid Framework packages
 * for compatibility testing.
 *
 * ## Architecture
 *
 * Legacy packages live in two committed pnpm sub-workspaces under `compat-workspaces/`:
 * - `standard/` — N-1, N-2, and OCV (oldest compatible version). Installed by default when
 * running compat tests.
 * - `full/` — all historical back-compat versions (superset of standard). Installed only when
 * running full back-compat tests (fluid__test__backCompat=FULL or V2_INT_3).
 *
 * The exact resolved versions are recorded in `compat-workspaces/versions.json`, which is
 * maintained by the `update-compat-versions` script and committed to the repository. Tests
 * read this manifest at startup rather than querying the npm registry.
 *
 * ## Updating compat versions
 *
 * After a version bump, run:
 * `pnpm run update-compat-versions`
 *
 * This regenerates `versions.json` and all per-version `package.json` files, then runs
 * `pnpm install --no-frozen-lockfile` in each workspace to update the committed lockfiles.
 * Commit all changes produced by the script.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { detectVersionScheme, fromInternalScheme } from "@fluid-tools/version-tools";
import { assert } from "@fluidframework/core-utils/internal";
import { lock } from "proper-lockfile";
import * as semver from "semver";

// Re-export so existing imports of versionHasMovedSparsedMatrix from versionUtils.ts still work.
export { versionHasMovedSparsedMatrix } from "./compatPackageList.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// From compiled lib/, go up one level to reach the package root, then into compat-workspaces/
const compatWorkspacesDir = fileURLToPath(new URL("../compat-workspaces", import.meta.url));
const versionsJsonPath = path.join(compatWorkspacesDir, "versions.json");

export const standardWorkspaceDir = path.join(compatWorkspacesDir, "standard");
export const fullWorkspaceDir = path.join(compatWorkspacesDir, "full");

// ---------------------------------------------------------------------------
// versions.json manifest
// ---------------------------------------------------------------------------

/**
 * Schema for the committed `compat-workspaces/versions.json` file.
 *
 * The `standard` and `full` fields are MACHINE-MAINTAINED by `scripts/updateCompatVersions.ts`.
 * The `explicit` field is HUMAN-MAINTAINED: add versions here when a specific test requires a
 * version that falls outside the delta-based range (e.g. a version where a specific API change
 * was made). The `standard.ocv` value can also be manually adjusted when the OCV policy changes.
 * @internal
 */
export interface CompatVersionsManifest {
	/**
	 * Exact package versions installed in the `standard/` workspace.
	 * These symbolic names are resolved at test time without a registry query.
	 */
	standard: {
		/** The previous minor release bracket (N-1). */
		"n-1": string;
		/** Two minor release brackets back (N-2). Used for cross-client compat. */
		"n-2": string;
		/**
		 * Oldest compatible version for Loader/Driver layers.
		 * HUMAN-MAINTAINED: update this constant when the oldest supported version changes.
		 */
		ocv: string;
		/**
		 * Additional versions needed for cross-client compat testing (e.g. the latest v1.x
		 * release for "slow train" customers). MACHINE-MAINTAINED.
		 */
		"cross-client": string[];
	};
	/**
	 * Additional exact versions installed ONLY in the `full/` workspace (beyond those in
	 * `standard/`). The full workspace contains all versions needed for full back-compat testing.
	 * MACHINE-MAINTAINED.
	 */
	full: string[];
	/**
	 * Explicit versions required by specific tests that aren't covered by the delta-based range.
	 * Installed in `full/`. HUMAN-MAINTAINED: add here when a test needs a pinned old version.
	 */
	explicit?: string[];
}

let cachedManifest: CompatVersionsManifest | undefined;

/**
 * Reads the committed versions manifest. Returns `undefined` if it doesn't exist (before the
 * first run of the update script).
 * @internal
 */
export function tryReadVersionsManifest(): CompatVersionsManifest | undefined {
	if (cachedManifest !== undefined) return cachedManifest;
	if (!existsSync(versionsJsonPath)) return undefined;
	const raw = JSON.parse(readFileSync(versionsJsonPath, { encoding: "utf8" }));
	cachedManifest = raw as CompatVersionsManifest;
	return cachedManifest;
}

/**
 * Returns all exact versions recorded in the manifest across both workspaces.
 * @internal
 */
export function getAllManifestVersions(manifest: CompatVersionsManifest): string[] {
	return [
		manifest.standard["n-1"],
		manifest.standard["n-2"],
		manifest.standard.ocv,
		...(manifest.standard["cross-client"] ?? []),
		...manifest.full,
		...(manifest.explicit ?? []),
	].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

const resolutionCache = new Map<string, string>();

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/**
 * Resolves a version range or alias to a specific version number.
 *
 * When the versions manifest is available (after `update-compat-versions` has been run),
 * resolution uses the manifest and avoids any registry query. When the manifest is absent,
 * falls back to querying the pnpm-configured registry.
 *
 * @internal
 */
export function resolveVersion(requested: string, _installed: boolean): string {
	const cachedVersion = resolutionCache.get(requested);
	if (cachedVersion) return cachedVersion;

	if (semver.valid(requested)) {
		resolutionCache.set(requested, requested);
		return requested;
	}

	if (!semver.validRange(requested)) {
		throw new Error(`Invalid semver range: "${requested}"`);
	}

	// Try the manifest first (no registry needed)
	const manifest = tryReadVersionsManifest();
	if (manifest !== undefined) {
		const allVersions = getAllManifestVersions(manifest);
		const matching = allVersions
			.filter((v) => semver.valid(v) && semver.satisfies(v, requested))
			.sort(semver.rcompare);
		if (matching.length > 0) {
			resolutionCache.set(requested, matching[0]);
			return matching[0];
		}
	}

	// Fallback: query registry (used during the update script and before first manifest commit)
	let result: string | undefined;
	try {
		result = execSync(
			`${pnpmCmd} view "@fluidframework/container-loader@${requested}" version --json`,
			{ encoding: "utf8" },
		);
	} catch {
		throw new Error(
			`Error while running: ${pnpmCmd} view "@fluidframework/container-loader@${requested}" version --json`,
		);
	}
	if (!result) throw new Error(`No version published as ${requested}`);
	try {
		const versions: string | string[] = JSON.parse(result);
		const version = Array.isArray(versions) ? versions.sort(semver.rcompare)[0] : versions;
		if (version) {
			resolutionCache.set(requested, version);
			return version;
		}
	} catch {
		throw new Error(`Error parsing versions for ${requested}`);
	}
	throw new Error(`No version found for ${requested}`);
}

// ---------------------------------------------------------------------------
// Workspace installation
// ---------------------------------------------------------------------------

/**
 * Ensures a compat workspace is installed. Runs `pnpm install --frozen-lockfile` in the
 * workspace directory if `node_modules/` is absent.
 *
 * Safe to call concurrently — uses a file lock to serialise installs of the same workspace.
 * @internal
 */
export async function ensureWorkspaceInstalled(workspaceDir: string): Promise<void> {
	const nodeModulesPath = path.join(workspaceDir, "node_modules");
	if (existsSync(nodeModulesPath)) return;

	if (!existsSync(workspaceDir)) {
		throw new Error(
			`Compat workspace directory does not exist: ${workspaceDir}\n` +
				`Run \`pnpm run update-compat-versions\` from packages/test/test-version-utils to regenerate it.`,
		);
	}

	// Ensure there is a file to lock against
	const lockTarget = path.join(workspaceDir, "pnpm-lock.yaml");
	if (!existsSync(lockTarget)) {
		throw new Error(
			`Lockfile not found in ${workspaceDir}. Run \`pnpm run update-compat-versions\`.`,
		);
	}

	const release = await lock(lockTarget, { retries: { forever: true } });
	try {
		// Check again under lock
		if (existsSync(nodeModulesPath)) return;

		console.log(`Installing compat workspace: ${workspaceDir}`);
		execSync(`${pnpmCmd} install --frozen-lockfile`, {
			cwd: workspaceDir,
			env: { ...process.env, NODE_OPTIONS: "" },
			stdio: "inherit",
		});
	} finally {
		release();
	}
}

// ---------------------------------------------------------------------------
// Installed package lookup
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the version directory inside a workspace, or `undefined` if the
 * version is not in that workspace.
 */
function versionDirInWorkspace(workspaceDir: string, version: string): string | undefined {
	const dir = path.join(workspaceDir, version);
	return existsSync(dir) ? dir : undefined;
}

/**
 * Resolves an exact version string to its installed module path.
 *
 * Checks `standard/` first (preferred when both workspaces are installed), then `full/`.
 * Throws a descriptive error if the version is not found in either workspace.
 * @internal
 */
export function checkInstalled(requested: string): { version: string; modulePath: string } {
	const version = resolveVersion(requested, true);

	const standardNodeModules = path.join(standardWorkspaceDir, "node_modules");
	if (existsSync(standardNodeModules)) {
		const dir = versionDirInWorkspace(standardWorkspaceDir, version);
		if (dir !== undefined) return { version, modulePath: dir };
	}

	const fullNodeModules = path.join(fullWorkspaceDir, "node_modules");
	if (existsSync(fullNodeModules)) {
		const dir = versionDirInWorkspace(fullWorkspaceDir, version);
		if (dir !== undefined) return { version, modulePath: dir };
	}

	throw new Error(
		`Version ${version} is not installed in any compat workspace.\n` +
			`Run \`pnpm run update-compat-versions\` then install the relevant workspace:\n` +
			`  cd compat-workspaces/standard && pnpm install --frozen-lockfile\n` +
			`  cd compat-workspaces/full     && pnpm install --frozen-lockfile`,
	);
}

// ---------------------------------------------------------------------------
// Package loading
// ---------------------------------------------------------------------------

/**
 * Dynamically loads a package from the specified module directory.
 *
 * Uses Node's standard module resolution algorithm via `createRequire`, which naturally handles
 * both version-specific `node_modules/` and the hoisted workspace-root `node_modules/` without
 * manual path construction. The resolved file is then loaded with `import()`.
 *
 * @param modulePath - Path to the version directory (e.g. `compat-workspaces/standard/2.83.0`).
 * The resolver starts here and walks up to find hoisted packages.
 * @param pkg - Package name to load (e.g. `@fluidframework/container-loader`).
 * @internal
 */
export const loadPackage = async (modulePath: string, pkg: string): Promise<any> => {
	// createRequire anchored to the version directory. Node's resolution algorithm walks up
	// through that directory's node_modules, then the workspace-root node_modules (hoisted), so
	// we do not need to pass the workspace root separately.
	// We use require() (via createRequire) rather than import() to avoid the ESM-wrapping overhead
	// that import() imposes on CJS packages — legacy Fluid packages are CJS and require() is ~10x faster.
	const resolveFrom = createRequire(path.join(modulePath, "package.json"));
	try {
		return resolveFrom(pkg);
	} catch (e) {
		throw new Error(`Cannot load package "${pkg}" from ${modulePath}: ${e}`);
	}
};

// ---------------------------------------------------------------------------
// Version arithmetic
// ---------------------------------------------------------------------------

/**
 * Computes the semver range corresponding to a delta from a base version, without resolving it
 * to an exact version. Used by both the test runtime and the `update-compat-versions` script.
 *
 * @internal
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

	if (adjustPublicMajor === false && version.major > 1) {
		if (version.minor < 10) {
			const internalSchemeRange = internalSchema("2.0.0", "6.0.0", "rc", requested);
			return internalSchemeRange;
		} else {
			const legacyMinorsToSkip = Math.abs(requested * 10);
			if (legacyMinorsToSkip > version.minor) {
				const remainingRequested =
					(legacyMinorsToSkip - Math.floor(version.minor / 10) * 10) / 10;
				const internalSchemeRange = internalSchema(
					"2.0.0",
					"6.0.0",
					"rc",
					remainingRequested * -1,
				);
				return internalSchemeRange;
			}
			const lowerMinorRange = Math.floor((version.minor - legacyMinorsToSkip) / 10) * 10;
			const upperMinorRange = lowerMinorRange + 10;
			return `>=${version.major}.${lowerMinorRange}.0-0 <${version.major}.${upperMinorRange}.0-0`;
		}
	} else {
		const requestedMajorVersion = version.major + requested;
		if (requestedMajorVersion > 0) {
			return `^${requestedMajorVersion}.0.0-0`;
		}
		const lastPrereleaseVersion = new semver.SemVer("0.59.0");
		const requestedMinorVersion = lastPrereleaseVersion.minor + requestedMajorVersion;
		if (requestedMinorVersion <= 0) {
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
 * When the versions manifest is present, resolution uses the manifest and avoids any registry
 * query. Falls back to a registry query when the manifest is absent (e.g. before the first run
 * of the update script).
 *
 * @param baseVersion - The base version to move from (eg. "0.60.0")
 * @param requested - If the value is a negative number, the baseVersion will be adjusted down.
 * If the value is a string then it will be returned as-is. Throws on positive number.
 * @param adjustPublicMajor - If `baseVersion` is a Fluid internal version, controls whether the
 * public or internal version is adjusted by the `requested` value.
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
		return resolveVersion(calculatedRange, false);
	} catch (err: any) {
		// If N-1 is not yet published (e.g. on a newly bumped branch), fall back to N-2.
		if (requested === -1) {
			const resolvedVersion = getRequestedVersion(baseVersion, -2, adjustPublicMajor);
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

function internalSchema(
	publicVersion: string,
	internalVersion: string,
	prereleaseIdentifier: string,
	requested: number,
): string {
	if (requested === 0) {
		return `${publicVersion}-${prereleaseIdentifier}.${internalVersion}`;
	}

	if (prereleaseIdentifier === "rc" || prereleaseIdentifier === "dev-rc") {
		if (semver.eq(publicVersion, "2.0.0")) {
			const parsed = semver.parse(internalVersion);
			assert(parsed !== null, "internalVersion should be parsable");
			if (parsed.major + requested < 1) {
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

	if (semver.gt(internalVersion, publicVersion) && requested <= -2) {
		const parsed = new semver.SemVer(internalVersion);
		semverInternal = (parsed.major + requested + 1).toString().concat(".0.0");
	}

	try {
		parsedVersion = new semver.SemVer(semverInternal);
	} catch (err: unknown) {
		throw new Error(err as string);
	}

	const idToUse = prereleaseIdentifier.includes("rc") ? "rc" : "internal";
	return `>=${publicVersion}-${idToUse}.${
		parsedVersion.major - 1
	}.0.0 <${publicVersion}-${idToUse}.${parsedVersion.major}.0.0`;
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
