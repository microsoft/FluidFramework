/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 * Detects the Biome version by reading the package.json of the @biomejs/biome package.
 *
 * @param startDir - The directory to start searching from. Will look for node_modules/@biomejs/biome/package.json.
 * @returns The Biome version information, or undefined if the package is not found.
 */
export async function detectBiomeVersion(
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
