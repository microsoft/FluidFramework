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
	const topDirs = ["packages", "experimental", "examples", "azure", "tools", "common", "server"];

	async function walk(dir: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return; // Directory does not exist or cannot be read
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const full = path.join(dir, entry.name);
			const eslintrc = path.join(full, ".eslintrc.cjs");
			try {
				await fs.access(eslintrc);
				const content = await fs.readFile(eslintrc, "utf8");
				let variant: PackageTarget["flatVariant"] = "recommended";
				if (content.includes("/strict")) variant = "strict";
				else if (content.includes("minimal-deprecated")) variant = "minimalDeprecated";
				results.push({ packageDir: full, legacyConfigPath: eslintrc, flatVariant: variant });
			} catch {
				/* no legacy config here */
			}
			await walk(full);
		}
	}

	for (const top of topDirs) {
		await walk(path.join(repoRoot, top));
	}
	return results;
}

function buildFlatConfigContent(variant: PackageTarget["flatVariant"]): string {
	return `/* eslint-disable */\n/**\n * GENERATED FILE - DO NOT EDIT DIRECTLY.\n * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts\n */\nimport { ${variant} } from '@fluidframework/eslint-config-fluid/flat';\nexport default [...${variant}];\n`;
}

async function writeFlatConfigs(targets: PackageTarget[]): Promise<void> {
	for (const t of targets) {
		const outPath = path.join(t.packageDir, "eslint.config.mjs");
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
