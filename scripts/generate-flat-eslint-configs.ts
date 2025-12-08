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
 *  - Extracts local rules and overrides from .eslintrc.cjs and includes them in the flat config.
 *
 * Output: eslint.config.mjs alongside the existing .eslintrc.cjs (which is left intact for now).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

interface PackageTarget {
	packageDir: string;
	legacyConfigPath: string;
	flatVariant: "strict" | "minimalDeprecated" | "recommended";
	legacyConfig?: unknown;
}

async function findLegacyConfigs(): Promise<PackageTarget[]> {
	const results: PackageTarget[] = [];
	const topDirs = ["packages", "experimental", "examples", "azure", "tools", "server"]; // exclude common/build from traversal

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

			// Legacy .eslintrc.cjs detection - only process if legacy config exists
			const legacyPath = path.join(full, ".eslintrc.cjs");
			try {
				await fs.access(legacyPath);
				const content = await fs.readFile(legacyPath, "utf8");
				let variant: PackageTarget["flatVariant"] = "recommended";
				if (content.includes("/strict")) variant = "strict";
				else if (content.includes("minimal-deprecated")) variant = "minimalDeprecated";

				// Load the legacy config to extract rules and overrides
				// We'll use a separate Node.js process to require() the CommonJS config
				let legacyConfig;
				try {
					const { execFileSync } = await import("child_process");
					// Escape legacyPath for JS string literal
					const legacyPathEscaped = legacyPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
					const result = execFileSync(
						"node",
						["-e", `console.log(JSON.stringify(require('${legacyPathEscaped}')))`],
						{ cwd: repoRoot, encoding: "utf8" },
					);
					legacyConfig = JSON.parse(result);
				} catch (e) {
					console.warn(`Warning: Could not load ${legacyPath}:`, e);
				}

				if (legacyConfig !== undefined) {
					results.push({
						packageDir: full,
						legacyConfigPath: legacyPath,
						flatVariant: variant,
						legacyConfig,
					});
				} else {
					console.warn(`Skipping package at ${full} due to failed legacy config load.`);
				}
			} catch {
				/* no legacy config here - skip this directory */
			}

			await walk(full);
		}
	}

	for (const top of topDirs) {
		await walk(path.join(repoRoot, top));
	}
	return results;
}

function buildFlatConfigContent(
	packageDir: string,
	variant: PackageTarget["flatVariant"],
	legacyConfig?: unknown,
): string {
	const flatSource = path
		.relative(
			packageDir,
			path.join(repoRoot, "common", "build", "eslint-config-fluid", "flat.mjs"),
		)
		.replace(/\\/g, "/");
	const importPath = flatSource.startsWith(".") ? flatSource : `./${flatSource}`;

	let configContent = `/* eslint-disable */\n/**\n * GENERATED FILE - DO NOT EDIT DIRECTLY.\n * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts\n */\nimport { ${variant} } from '${importPath}';\n\n`;

	// Check if there are local customizations to include
	const hasLocalRules = legacyConfig?.rules && Object.keys(legacyConfig.rules).length > 0;
	const hasParserOptions =
		legacyConfig?.parserOptions && Object.keys(legacyConfig.parserOptions).length > 0;
	const hasOverrides = legacyConfig?.overrides && legacyConfig.overrides.length > 0;

	if (!hasLocalRules && !hasParserOptions && !hasOverrides) {
		// Simple case: no local customizations
		configContent += `export default [...${variant}];\n`;
	} else {
		// Complex case: include local rules/overrides/parserOptions
		configContent += `const config = [\n\t...${variant},\n`;

		// Add root-level customizations if present
		if (hasLocalRules || hasParserOptions) {
			configContent += `\t{\n`;
			if (hasParserOptions) {
				configContent += `\t\tlanguageOptions: {\n\t\t\tparserOptions: ${JSON.stringify(legacyConfig.parserOptions, null, 2).replace(/\n/g, "\n\t\t\t")},\n\t\t},\n`;
			}
			if (hasLocalRules) {
				configContent += `\t\trules: ${JSON.stringify(legacyConfig.rules, null, 2).replace(/\n/g, "\n\t\t")},\n`;
			}
			configContent += `\t},\n`;
		}

		if (hasOverrides) {
			for (const override of legacyConfig.overrides) {
				configContent += `\t{\n`;
				if (override.files) {
					configContent += `\t\tfiles: ${JSON.stringify(override.files)},\n`;
				}
				if (override.excludedFiles) {
					configContent += `\t\tignores: ${JSON.stringify(override.excludedFiles)},\n`;
				}
				if (override.parserOptions) {
					configContent += `\t\tlanguageOptions: {\n\t\t\tparserOptions: ${JSON.stringify(override.parserOptions, null, 2).replace(/\n/g, "\n\t\t\t")},\n\t\t},\n`;
				}
				if (override.rules) {
					configContent += `\t\trules: ${JSON.stringify(override.rules, null, 2).replace(/\n/g, "\n\t\t")},\n`;
				}
				configContent += `\t},\n`;
			}
		}

		configContent += `];\n\nexport default config;\n`;
	}

	return configContent;
}

async function writeFlatConfigs(targets: PackageTarget[]): Promise<void> {
	for (const t of targets) {
		const outPath = path.join(t.packageDir, "eslint.config.mjs");
		// Always overwrite if legacy config exists (we only process dirs with .eslintrc.cjs)
		const content = buildFlatConfigContent(t.packageDir, t.flatVariant, t.legacyConfig);
		await fs.writeFile(outPath, content, "utf8");
	}
}

async function main() {
	const targets = await findLegacyConfigs();
	await writeFlatConfigs(targets);
	console.log(
		`Generated ${targets.length} flat config files from legacy .eslintrc.cjs configs.`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
