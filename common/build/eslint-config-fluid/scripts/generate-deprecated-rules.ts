/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Script to generate a list of deprecated ESLint rules from core ESLint and all plugins.
 *
 * This script queries the rule metadata from ESLint core and each plugin used in the config,
 * then outputs the deprecated rule names to a JSON file that can be imported by the flat config.
 *
 * Usage: tsx scripts/generate-deprecated-rules.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error - This is an internal ESLint API
import { builtinRules } from "eslint/use-at-your-own-risk";
import type { Rule } from "eslint";

// Import all plugins used in the config
import tseslint from "typescript-eslint";
import unicornPlugin from "eslint-plugin-unicorn";
import jsdocPlugin from "eslint-plugin-jsdoc";
import importXPlugin from "eslint-plugin-import-x";
import promisePlugin from "eslint-plugin-promise";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import dependPlugin from "eslint-plugin-depend";
import eslintCommentsPlugin from "@eslint-community/eslint-plugin-eslint-comments";
import rushstackPlugin from "@rushstack/eslint-plugin";
import fluidPlugin from "@fluid-internal/eslint-plugin-fluid";
import tsdocPlugin from "eslint-plugin-tsdoc";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

// Import configs to check which rules are configured
import { recommended, strict } from "../flat.mts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DeprecatedRuleInfo {
	rule: string;
	replacedBy?: string[];
}

interface DeprecatedRuleOutput {
	rule: string;
	replacedBy?: string[];
	isConfigured: boolean;
}

/**
 * Extracts deprecated rules from a rules collection.
 * @param prefix - Plugin prefix (empty string for core ESLint rules)
 * @param rules - Map or object of rule definitions
 * @returns Array of deprecated rule information
 */
function findDeprecatedRules(
	prefix: string,
	rules: Map<string, Rule.RuleModule> | Record<string, Rule.RuleModule> | undefined,
): DeprecatedRuleInfo[] {
	const deprecated: DeprecatedRuleInfo[] = [];
	if (!rules) {
		return deprecated;
	}

	const entries: [string, Rule.RuleModule][] =
		rules instanceof Map ? [...rules.entries()] : Object.entries(rules);

	for (const [name, rule] of entries) {
		const meta = rule.meta;
		if (meta?.deprecated) {
			const fullName = prefix ? `${prefix}/${name}` : name;
			const info: DeprecatedRuleInfo = { rule: fullName };
			if (meta.replacedBy && meta.replacedBy.length > 0) {
				info.replacedBy = meta.replacedBy as string[];
			}
			deprecated.push(info);
		}
	}
	return deprecated;
}

/**
 * Loads the existing deprecated rules from the output file.
 * @param outputPath - Path to the deprecated-rules.json file
 * @returns Set of existing rule names, or empty set if file doesn't exist
 */
async function loadExistingRules(outputPath: string): Promise<Set<string>> {
	try {
		const content = await fs.readFile(outputPath, "utf-8");
		const data = JSON.parse(content) as { deprecatedRules?: DeprecatedRuleOutput[] };
		return new Set(data.deprecatedRules?.map((r) => r.rule) ?? []);
	} catch {
		return new Set();
	}
}

/**
 * Extracts all configured rule names from the ESLint config arrays.
 * @returns Set of all rule names that are configured in our configs
 */
function getConfiguredRules(): Set<string> {
	const configuredRules = new Set<string>();

	for (const config of [...recommended, ...strict]) {
		if (config.rules) {
			for (const ruleName of Object.keys(config.rules)) {
				configuredRules.add(ruleName);
			}
		}
	}

	return configuredRules;
}

async function main(): Promise<void> {
	const allDeprecated: DeprecatedRuleInfo[] = [];

	// ESLint core rules
	allDeprecated.push(...findDeprecatedRules("", builtinRules as Map<string, Rule.RuleModule>));

	// TypeScript-ESLint
	const tsPlugin = tseslint.plugin as { rules?: Record<string, Rule.RuleModule> };
	if (tsPlugin.rules) {
		allDeprecated.push(...findDeprecatedRules("@typescript-eslint", tsPlugin.rules));
	}

	// All other plugins used in flat.mts
	const plugins: Record<string, { rules?: Record<string, Rule.RuleModule> }> = {
		"unicorn": unicornPlugin,
		"jsdoc": jsdocPlugin,
		"import-x": importXPlugin as { rules?: Record<string, Rule.RuleModule> },
		"promise": promisePlugin,
		"react": reactPlugin,
		"react-hooks": reactHooksPlugin as { rules?: Record<string, Rule.RuleModule> },
		"depend": dependPlugin as { rules?: Record<string, Rule.RuleModule> },
		"@eslint-community/eslint-comments": eslintCommentsPlugin as {
			rules?: Record<string, Rule.RuleModule>;
		},
		"@rushstack": rushstackPlugin as { rules?: Record<string, Rule.RuleModule> },
		"@fluid-internal/fluid": fluidPlugin as { rules?: Record<string, Rule.RuleModule> },
		"tsdoc": tsdocPlugin as { rules?: Record<string, Rule.RuleModule> },
		"unused-imports": unusedImportsPlugin as { rules?: Record<string, Rule.RuleModule> },
	};

	for (const [name, plugin] of Object.entries(plugins)) {
		if (plugin.rules) {
			allDeprecated.push(...findDeprecatedRules(name, plugin.rules));
		}
	}

	// Sort by rule name for consistent output
	allDeprecated.sort((a, b) => a.rule.localeCompare(b.rule));

	// Load existing rules to detect new ones
	const outputPath = path.join(__dirname, "..", "printed-configs", "deprecated-rules.json");
	const existingRules = await loadExistingRules(outputPath);

	// Get all configured rules from our ESLint configs
	const configuredRules = getConfiguredRules();

	// Find new deprecated rules not in the existing file
	const newRules = allDeprecated.filter((d) => !existingRules.has(d.rule));

	// Build the detailed output with replacement and isConfigured flags
	const deprecatedRulesOutput: DeprecatedRuleOutput[] = allDeprecated.map((d) => {
		const output: DeprecatedRuleOutput = {
			rule: d.rule,
			isConfigured: configuredRules.has(d.rule),
		};
		if (d.replacedBy && d.replacedBy.length > 0) {
			output.replacedBy = d.replacedBy;
		}
		return output;
	});

	// Write to printed-configs/deprecated-rules.json
	const output = {
		$schema: "http://json-schema.org/draft-07/schema#",
		description:
			"Auto-generated list of deprecated ESLint rules. Do not edit manually. Run: tsx scripts/generate-deprecated-rules.ts",
		generatedAt: new Date().toISOString(),
		deprecatedRules: deprecatedRulesOutput,
	};

	await fs.writeFile(outputPath, JSON.stringify(output, null, "\t") + "\n");

	console.log(`Generated ${deprecatedRulesOutput.length} deprecated rules to ${outputPath}`);
	console.log(
		`  - ${deprecatedRulesOutput.filter((r) => r.isConfigured).length} rules are configured in our ESLint configs`,
	);
	console.log(
		`  - ${deprecatedRulesOutput.filter((r) => r.replacedBy).length} rules have replacements`,
	);

	// Print summary by plugin
	const byPlugin: Record<string, number> = {};
	for (const d of allDeprecated) {
		const plugin = d.rule.includes("/") ? d.rule.split("/")[0] || "eslint" : "eslint";
		byPlugin[plugin] = (byPlugin[plugin] || 0) + 1;
	}

	console.log("\nBy plugin:");
	for (const [plugin, count] of Object.entries(byPlugin).sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		console.log(`  ${plugin}: ${count}`);
	}

	// Print summary of new deprecated rules not yet in the output file
	if (newRules.length > 0) {
		console.log(`\n${"=".repeat(60)}`);
		console.log(`NEW DEPRECATED RULES (${newRules.length} rules not previously in output):`);
		console.log("=".repeat(60));
		for (const info of newRules) {
			const replacement = info.replacedBy?.length
				? `→ ${info.replacedBy.join(", ")}`
				: "(no replacement)";
			console.log(`  ${info.rule} ${replacement}`);
		}
	} else {
		console.log("\nNo new deprecated rules found.");
	}
}

main().catch((error) => {
	console.error("Error generating deprecated rules:", error);
	process.exit(1);
});
