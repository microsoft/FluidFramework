/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Script to generate a list of deprecated ESLint rules from all plugins used in the flat configs.
 *
 * Loads the flat configs (recommended, strict, minimalDeprecated), inspects each plugin's rule
 * metadata for `meta.deprecated === true`, cross-references with the configured rules, and
 * writes the results to `data/deprecated-rules.json`.
 *
 * Usage: tsx scripts/generate-deprecated-rules.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
// @ts-expect-error - This is an internal ESLint API
import { builtinRules } from "eslint/use-at-your-own-risk";
import type { Linter, Rule } from "eslint";

// Import flat configs directly from flat.mjs (same pattern as print-configs.ts)
import { recommended, strict, minimalDeprecated } from "../flat.mjs";

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
 * @param rules - Map or Record of rule definitions
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
 * Collects all plugins from an array of flat config objects.
 * Returns a map of plugin prefix to plugin object.
 */
function collectPlugins(
	configs: readonly Readonly<Linter.Config>[],
): Map<string, { rules?: Record<string, Rule.RuleModule> }> {
	const plugins = new Map<string, { rules?: Record<string, Rule.RuleModule> }>();

	for (const config of configs) {
		if (config.plugins) {
			for (const [prefix, plugin] of Object.entries(config.plugins)) {
				if (!plugins.has(prefix)) {
					plugins.set(prefix, plugin as { rules?: Record<string, Rule.RuleModule> });
				}
			}
		}
	}

	return plugins;
}

/**
 * Resolves the effective rules for a given config by using ESLint's calculateConfigForFile.
 * This gives us the fully-resolved rule configuration including all overrides.
 */
async function getResolvedRules(
	config: readonly Readonly<Linter.Config>[],
	filePath: string,
): Promise<Record<string, Linter.RuleSeverityAndOptions>> {
	const eslint = new ESLint({
		overrideConfigFile: true,
		overrideConfig: config as Linter.Config[],
	});

	const resolvedConfig = (await eslint.calculateConfigForFile(filePath)) as {
		rules?: Record<string, Linter.RuleSeverityAndOptions>;
	};

	return resolvedConfig?.rules ?? {};
}

/**
 * Checks whether a rule severity means the rule is enabled (not "off").
 */
function isRuleEnabled(ruleConfig: Linter.RuleSeverityAndOptions | undefined): boolean {
	if (ruleConfig === undefined) {
		return false;
	}

	const severity = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;

	return severity !== "off" && severity !== 0;
}

async function main(): Promise<void> {
	// Combine all configs to discover all registered plugins
	const allConfigs = [...recommended, ...strict, ...minimalDeprecated];

	// Collect all deprecated rules from core ESLint and all plugins
	const allDeprecated: DeprecatedRuleInfo[] = [];

	// ESLint core built-in rules
	allDeprecated.push(...findDeprecatedRules("", builtinRules as Map<string, Rule.RuleModule>));

	// Plugin rules - extract plugins from the flat config objects
	const plugins = collectPlugins(allConfigs);
	for (const [prefix, plugin] of plugins) {
		if (plugin.rules) {
			allDeprecated.push(...findDeprecatedRules(prefix, plugin.rules));
		}
	}

	// Sort for consistent output
	allDeprecated.sort((a, b) => a.rule.localeCompare(b.rule));

	// Resolve configured rules from each config for a .ts file
	const sampleTsFile = path.join(__dirname, "..", "src", "file.ts");
	const [recommendedRules, strictRules, minimalRules] = await Promise.all([
		getResolvedRules(recommended, sampleTsFile),
		getResolvedRules(strict, sampleTsFile),
		getResolvedRules(minimalDeprecated, sampleTsFile),
	]);

	// Merge all configured rule names
	const configuredRules = new Set<string>([
		...Object.keys(recommendedRules),
		...Object.keys(strictRules),
		...Object.keys(minimalRules),
	]);

	// Determine which deprecated rules are enabled (not just configured, but not "off")
	const enabledRules = new Set<string>();
	for (const ruleName of configuredRules) {
		if (
			isRuleEnabled(recommendedRules[ruleName]) ||
			isRuleEnabled(strictRules[ruleName]) ||
			isRuleEnabled(minimalRules[ruleName])
		) {
			enabledRules.add(ruleName);
		}
	}

	// Build the output
	const deprecatedRulesOutput: DeprecatedRuleOutput[] = allDeprecated.map((d) => {
		const output: DeprecatedRuleOutput = {
			rule: d.rule,
			isConfigured: enabledRules.has(d.rule),
		};
		if (d.replacedBy && d.replacedBy.length > 0) {
			output.replacedBy = d.replacedBy;
		}
		return output;
	});

	// Write to data/deprecated-rules.json (NOT printed-configs/ which is cleaned by print-configs.ts)
	const outputDir = path.join(__dirname, "..", "data");
	await fs.mkdir(outputDir, { recursive: true });
	const outputPath = path.join(outputDir, "deprecated-rules.json");

	const output = {
		$schema: "http://json-schema.org/draft-07/schema#",
		description:
			"Auto-generated list of deprecated ESLint rules. Do not edit manually. Run: tsx scripts/generate-deprecated-rules.ts",
		generatedAt: new Date().toISOString(),
		deprecatedRules: deprecatedRulesOutput,
	};

	await fs.writeFile(outputPath, JSON.stringify(output, null, "\t") + "\n");

	// Print summary
	const configured = deprecatedRulesOutput.filter((r) => r.isConfigured);
	const withReplacements = deprecatedRulesOutput.filter((r) => r.replacedBy);

	console.log(`Generated ${deprecatedRulesOutput.length} deprecated rules to ${outputPath}`);
	console.log(`  - ${configured.length} deprecated rules are enabled in our ESLint configs`);
	console.log(`  - ${withReplacements.length} deprecated rules have replacements`);

	// Summary by plugin
	const byPlugin: Record<string, number> = {};
	for (const d of allDeprecated) {
		const slashIndex = d.rule.indexOf("/");
		const plugin = slashIndex > 0 ? d.rule.slice(0, slashIndex) : "eslint";
		byPlugin[plugin] = (byPlugin[plugin] ?? 0) + 1;
	}

	console.log("\nBy plugin:");
	for (const [plugin, count] of Object.entries(byPlugin).sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		console.log(`  ${plugin}: ${count}`);
	}

	// Highlight deprecated rules that are still enabled
	if (configured.length > 0) {
		console.log(`\n${"=".repeat(60)}`);
		console.log(`DEPRECATED RULES STILL ENABLED (${configured.length}):`);
		console.log("=".repeat(60));
		for (const info of configured) {
			const replacement = info.replacedBy?.length
				? `-> ${info.replacedBy.join(", ")}`
				: "(no replacement)";
			console.log(`  ${info.rule} ${replacement}`);
		}
	}
}

main().catch((error) => {
	console.error("Error generating deprecated rules:", error);
	process.exit(1);
});
