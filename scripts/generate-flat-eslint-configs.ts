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

				// Check the extends array specifically to avoid false matches from rule names
				const extendsMatch = content.match(/extends:\s*\[([^\]]+)\]/s);
				if (extendsMatch) {
					const extendsContent = extendsMatch[1];
					if (extendsContent.includes("eslint-config-fluid/strict")) {
						variant = "strict";
					} else if (extendsContent.includes("eslint-config-fluid/minimal-deprecated")) {
						variant = "minimalDeprecated";
					}
				}

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

// List of TypeScript-ESLint rules that require type information
// These rules should not be applied to test files since the base config disables project for them
const TYPE_AWARE_RULES = new Set([
	"@typescript-eslint/await-thenable",
	"@typescript-eslint/consistent-return",
	"@typescript-eslint/consistent-type-exports",
	"@typescript-eslint/dot-notation",
	"@typescript-eslint/naming-convention",
	"@typescript-eslint/no-array-delete",
	"@typescript-eslint/no-base-to-string",
	"@typescript-eslint/no-confusing-void-expression",
	"@typescript-eslint/no-deprecated",
	"@typescript-eslint/no-duplicate-type-constituents",
	"@typescript-eslint/no-floating-promises",
	"@typescript-eslint/no-for-in-array",
	"@typescript-eslint/no-implied-eval",
	"@typescript-eslint/no-meaningless-void-operator",
	"@typescript-eslint/no-misused-promises",
	"@typescript-eslint/no-mixed-enums",
	"@typescript-eslint/no-redundant-type-constituents",
	"@typescript-eslint/no-unnecessary-boolean-literal-compare",
	"@typescript-eslint/no-unnecessary-condition",
	"@typescript-eslint/no-unnecessary-qualifier",
	"@typescript-eslint/no-unnecessary-template-expression",
	"@typescript-eslint/no-unnecessary-type-arguments",
	"@typescript-eslint/no-unnecessary-type-assertion",
	"@typescript-eslint/no-unnecessary-type-parameters",
	"@typescript-eslint/no-unsafe-argument",
	"@typescript-eslint/no-unsafe-assignment",
	"@typescript-eslint/no-unsafe-call",
	"@typescript-eslint/no-unsafe-enum-comparison",
	"@typescript-eslint/no-unsafe-member-access",
	"@typescript-eslint/no-unsafe-return",
	"@typescript-eslint/no-unsafe-type-assertion",
	"@typescript-eslint/no-unsafe-unary-minus",
	"@typescript-eslint/non-nullable-type-assertion-style",
	"@typescript-eslint/only-throw-error",
	"@typescript-eslint/prefer-destructuring",
	"@typescript-eslint/prefer-find",
	"@typescript-eslint/prefer-includes",
	"@typescript-eslint/prefer-nullish-coalescing",
	"@typescript-eslint/prefer-optional-chain",
	"@typescript-eslint/prefer-promise-reject-errors",
	"@typescript-eslint/prefer-readonly",
	"@typescript-eslint/prefer-readonly-parameter-types",
	"@typescript-eslint/prefer-reduce-type-parameter",
	"@typescript-eslint/prefer-regexp-exec",
	"@typescript-eslint/prefer-return-this-type",
	"@typescript-eslint/prefer-string-starts-ends-with",
	"@typescript-eslint/promise-function-async",
	"@typescript-eslint/related-getter-setter-pairs",
	"@typescript-eslint/require-array-sort-compare",
	"@typescript-eslint/require-await",
	"@typescript-eslint/restrict-plus-operands",
	"@typescript-eslint/restrict-template-expressions",
	"@typescript-eslint/return-await",
	"@typescript-eslint/strict-boolean-expressions",
	"@typescript-eslint/switch-exhaustiveness-check",
	"@typescript-eslint/unbound-method",
	"@typescript-eslint/use-unknown-in-catch-callback-variable",
]);

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

	// Check if there are local rules or overrides to include
	const hasLocalRules = legacyConfig?.rules && Object.keys(legacyConfig.rules).length > 0;
	const hasOverrides = legacyConfig?.overrides && legacyConfig.overrides.length > 0;

	// Check if there's a non-standard project configuration
	let hasNonStandardProject = false;
	if (legacyConfig?.parserOptions?.project && Array.isArray(legacyConfig.parserOptions.project)) {
		const projectPaths = legacyConfig.parserOptions.project;
		const isStandardPattern = projectPaths.length === 2 &&
			projectPaths.includes("./tsconfig.json") &&
			projectPaths.includes("./src/test/tsconfig.json");
		hasNonStandardProject = !isStandardPattern;
	}

	if (!hasLocalRules && !hasOverrides && !hasNonStandardProject) {
		// Simple case: no local customizations
		configContent += `export default [...${variant}];\n`;
	} else {
		// Complex case: include local rules/overrides/custom project config
		configContent += `const config = [\n\t...${variant},\n`;

		if (hasLocalRules) {
			// Split rules into type-aware and non-type-aware
			// Type-aware rules that are disabled should be applied globally, not just to non-test files
			const typeAwareRules: Record<string, any> = {};
			const otherRules: Record<string, any> = {};

			for (const [ruleName, ruleConfig] of Object.entries(legacyConfig.rules)) {
				const isTypeAware = TYPE_AWARE_RULES.has(ruleName);
				const isDisabled = ruleConfig === "off" || ruleConfig === 0 ||
					(Array.isArray(ruleConfig) && (ruleConfig[0] === "off" || ruleConfig[0] === 0));

				// Type-aware rules that are disabled should apply to all files
				// Type-aware rules that are enabled should only apply to non-test files
				if (isTypeAware && !isDisabled) {
					typeAwareRules[ruleName] = ruleConfig;
				} else {
					otherRules[ruleName] = ruleConfig;
				}
			}

			// Add non-type-aware rules to all files
			if (Object.keys(otherRules).length > 0) {
				configContent += `\t{\n\t\trules: ${JSON.stringify(otherRules, null, 2).replace(/\n/g, "\n\t\t")},\n\t},\n`;
			}

			// Add type-aware rules only to non-test files
			if (Object.keys(typeAwareRules).length > 0) {
				configContent += `\t{\n\t\tfiles: ["**/*.{ts,tsx}"],\n\t\tignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],\n\t\trules: ${JSON.stringify(typeAwareRules, null, 2).replace(/\n/g, "\n\t\t")},\n\t},\n`;
			}
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
				if (override.rules) {
					configContent += `\t\trules: ${JSON.stringify(override.rules, null, 2).replace(/\n/g, "\n\t\t")},\n`;
				}
				configContent += `\t},\n`;
			}
		}

		// Add parserOptions.project configuration only if it's non-standard
		// The default shared config already handles the common pattern: ["./tsconfig.json", "./src/test/tsconfig.json"]
		// Only add custom project config if the package uses a different pattern
		if (legacyConfig?.parserOptions?.project && Array.isArray(legacyConfig.parserOptions.project)) {
			const projectPaths = legacyConfig.parserOptions.project;
			const isStandardPattern = projectPaths.length === 2 &&
				projectPaths.includes("./tsconfig.json") &&
				projectPaths.includes("./src/test/tsconfig.json");

			if (!isStandardPattern) {
				configContent += `\t{\n`;
				configContent += `\t\tfiles: ["src/test/**", "*.spec.ts", "*.test.ts"],\n`;
				configContent += `\t\tlanguageOptions: {\n`;
				configContent += `\t\t\tparserOptions: {\n`;
				configContent += `\t\t\t\tprojectService: false,\n`;
				configContent += `\t\t\t\tproject: ${JSON.stringify(projectPaths)},\n`;
				configContent += `\t\t\t},\n`;
				configContent += `\t\t},\n`;
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
