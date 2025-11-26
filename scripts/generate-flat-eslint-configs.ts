#!/usr/bin/env tsx
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Generates ESLint 9 flat config files for packages that currently use legacy .eslintrc.cjs configs.
 *
 * Heuristic:
 *  - If .eslintrc.cjs extends "@fluidframework/eslint-config-fluid/strict" => use strict flat config.
 *  - If it extends "@fluidframework/eslint-config-fluid/minimal-deprecated" => use minimalDeprecated.
 *  - Otherwise (includes base or recommended) => use recommended.
 *
 * Output: eslint.config.cjs alongside the existing .eslintrc.cjs (which is left intact for now).
 */

import { promises as fs } from "fs";
import * as path from "path";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

interface PackageTarget {
	packageDir: string;
	legacyConfigPath: string;
	flatVariant: "strict" | "minimalDeprecated" | "recommended";
}

async function findLegacyConfigs(): Promise<PackageTarget[]> {
	const results: PackageTarget[] = [];
	// Scan the top-level workspaces we care about
	const topDirs = ["packages", "experimental", "examples", "azure", "tools", "common", "server"];
	for (const top of topDirs) {
		const root = path.join(repoRoot, top);
		try {
			const entries = await fs.readdir(root, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const pkgDir = path.join(root, entry.name);
				const eslintrc = path.join(pkgDir, ".eslintrc.cjs");
				try {
					await fs.access(eslintrc);
					const content = await fs.readFile(eslintrc, "utf8");
					// Determine variant
					let variant: PackageTarget["flatVariant"] = "recommended";
					if (content.includes("/strict")) variant = "strict";
					else if (content.includes("minimal-deprecated")) variant = "minimalDeprecated";
					results.push({ packageDir: pkgDir, legacyConfigPath: eslintrc, flatVariant: variant });
				} catch {
					/* no legacy config */
				}
			}
		} catch {
			/* directory may not exist */
		}
	}
	return results;
}

function buildFlatConfigContent(variant: PackageTarget["flatVariant"]): string {
	return `/* eslint-disable */\n/**\n * GENERATED FILE - DO NOT EDIT DIRECTLY.\n * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts\n */\nconst { ${variant} } = require('@fluidframework/eslint-config-fluid/flat');\nmodule.exports = [...${variant}];\n`;
}

async function writeFlatConfigs(targets: PackageTarget[]): Promise<void> {
	for (const t of targets) {
		const outPath = path.join(t.packageDir, "eslint.config.cjs");
		try {
			await fs.access(outPath);
			// Already exists; skip.
			continue;
		} catch {
			const content = buildFlatConfigContent(t.flatVariant);
			await fs.writeFile(outPath, content, "utf8");
		}
	}
}

async function main() {
	const targets = await findLegacyConfigs();
	await writeFlatConfigs(targets);
	console.log(`Generated ${targets.length} flat config files (skipped existing).`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
