/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as semver from "semver";

/**
 * The major version of Biome.
 */
export type BiomeMajorVersion = 1 | 2;

/**
 * Result of detecting the Biome version.
 */
export interface BiomeVersionInfo {
	/**
	 * The full version string (e.g., "1.9.4" or "2.0.0").
	 */
	version: string;
	/**
	 * The major version number (1 or 2).
	 */
	majorVersion: BiomeMajorVersion;
}

/**
 * Detects the installed Biome version by running `biome --version`.
 *
 * @param cwd - The working directory to run the command in. Defaults to process.cwd().
 * @returns The Biome version information, or undefined if Biome is not installed or cannot be detected.
 */
export function detectBiomeVersionFromCli(cwd?: string): BiomeVersionInfo | undefined {
	try {
		const output = execSync("npx biome --version", {
			cwd,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Output format is "Version: X.Y.Z" or just "X.Y.Z"
		const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
		if (versionMatch) {
			const version = versionMatch[1];
			const major = semver.major(version);
			if (major === 1 || major === 2) {
				return {
					version,
					majorVersion: major as BiomeMajorVersion,
				};
			}
		}
	} catch {
		// Biome CLI not available or failed
	}
	return undefined;
}

/**
 * Detects the Biome version by reading the package.json of the @biomejs/biome package.
 *
 * @param startDir - The directory to start searching from. Will look for node_modules/@biomejs/biome/package.json.
 * @returns The Biome version information, or undefined if the package is not found.
 */
export async function detectBiomeVersionFromPackage(
	startDir: string,
): Promise<BiomeVersionInfo | undefined> {
	// Try to find the biome package.json by walking up the directory tree
	let currentDir = startDir;
	const root = path.parse(currentDir).root;

	while (currentDir !== root) {
		const biomePkgPath = path.join(
			currentDir,
			"node_modules",
			"@biomejs",
			"biome",
			"package.json",
		);
		try {
			const content = await readFile(biomePkgPath, "utf8");
			const pkg = JSON.parse(content) as { version?: string };
			if (pkg.version) {
				const major = semver.major(pkg.version);
				if (major === 1 || major === 2) {
					return {
						version: pkg.version,
						majorVersion: major as BiomeMajorVersion,
					};
				}
			}
		} catch {
			// Package not found at this level, continue searching
		}
		currentDir = path.dirname(currentDir);
	}

	return undefined;
}

/**
 * Detects the Biome version, trying multiple methods:
 * 1. First, try to read the version from the installed @biomejs/biome package
 * 2. Fall back to running the Biome CLI
 *
 * @param startDir - The directory to start searching from.
 * @returns The Biome version information, or undefined if Biome cannot be detected.
 */
export async function detectBiomeVersion(
	startDir: string,
): Promise<BiomeVersionInfo | undefined> {
	// Try package.json first (faster and more reliable)
	const fromPackage = await detectBiomeVersionFromPackage(startDir);
	if (fromPackage) {
		return fromPackage;
	}

	// Fall back to CLI detection
	return detectBiomeVersionFromCli(startDir);
}

/**
 * Checks if the config file uses Biome 2.x format by looking for the new `includes` field
 * instead of separate `include` and `ignore` fields.
 *
 * This is a heuristic detection method that can be used when version detection is not possible.
 *
 * @param configPath - Path to the Biome config file.
 * @returns true if the config appears to use Biome 2.x format, false otherwise.
 */
export async function detectBiome2ConfigFormat(configPath: string): Promise<boolean> {
	try {
		const content = await readFile(configPath, "utf8");
		// Look for the `includes` field pattern (Biome 2.x)
		// vs `include` and `ignore` fields (Biome 1.x)
		const hasIncludes = /"includes"\s*:/i.test(content);
		const hasInclude = /"include"\s*:/i.test(content);
		const hasIgnore = /"ignore"\s*:/i.test(content);

		// If `includes` is present and neither `include` nor `ignore` is present,
		// it's likely a Biome 2.x config
		if (hasIncludes && !hasInclude && !hasIgnore) {
			return true;
		}

		// If `include` or `ignore` is present, it's likely a Biome 1.x config
		if (hasInclude || hasIgnore) {
			return false;
		}

		// Default to 1.x format if we can't determine
		return false;
	} catch {
		return false;
	}
}
