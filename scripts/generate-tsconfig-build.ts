#!/usr/bin/env tsx

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal script to generate a root TypeScript project references file (tsconfig.build.json).
 * It discovers package directories (by presence of package.json and tsconfig.json) and writes a
 * root config with `references` entries pointing to them.
 *
 * Usage:
 *   pnpm tsx scripts/generate-tsconfig-build.ts
 */
import { promises as fs } from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(repoRoot, "tsconfig.build.json");

// Top-level folders to search for workspaces.
const TOP_DIRS = ["packages", "experimental", "examples", "server", "tools", "common"];

async function exists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function collectPackageDirs(): Promise<string[]> {
	const results: string[] = [];
	for (const top of TOP_DIRS) {
		const topPath = path.join(repoRoot, top);
		if (!(await exists(topPath))) continue;
		const entries = await fs.readdir(topPath, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const pkgDir = path.join(topPath, entry.name);
			// Skip build outputs & nested node_modules
			if (pkgDir.includes("node_modules") || entry.name === "dist" || entry.name === "lib")
				continue;
			const pkgJson = path.join(pkgDir, "package.json");
			const tsconfig = path.join(pkgDir, "tsconfig.json");
			if ((await exists(pkgJson)) && (await exists(tsconfig))) {
				results.push(path.relative(repoRoot, pkgDir));
			}
		}
	}
	return results.sort();
}

async function generate() {
	const refs = (await collectPackageDirs()).map((p) => ({ path: p }));
	const content = {
		files: [],
		references: refs,
		// Allow editors to resolve all projects when opening the root.
		// Build command: `tsc -b tsconfig.build.json`
	} as const;
	await fs.writeFile(OUTPUT_FILE, JSON.stringify(content, null, 2) + "\n", "utf8");
	console.log(`Wrote ${OUTPUT_FILE} with ${refs.length} references.`);
}

generate().catch((err) => {
	console.error(err);
	process.exit(1);
});
