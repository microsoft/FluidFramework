/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Script to print the resolved ESLint configurations for various configurations and source file types.
 *
 * To add new configurations to print, add them to the `configsToPrint` array.
 *
 * For clarity, all the async file operations are done sequentially rather than collecting promises and using
 * `Promise.all`. This makes the code easier to read and is acceptable as this script is not performance critical.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import type { Linter } from "eslint";
import sortJson from "sort-json";

// Import flat configs directly from flat.mts
import { recommended, strict, minimalDeprecated } from "../flat.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type FlatConfigArray = Linter.Config[];

interface ConfigToPrint {
	name: string;
	config: FlatConfigArray;
	sourceFilePath: string;
}

const configsToPrint: ConfigToPrint[] = [
	{
		name: "default",
		config: recommended,
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "minimal",
		config: minimalDeprecated,
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "react",
		config: recommended,
		sourceFilePath: path.join(__dirname, "..", "src", "file.tsx"),
	},
	{
		name: "recommended",
		config: recommended,
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "strict",
		config: strict,
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "strict-biome",
		// strict-biome uses the same flat config as strict; biome integration is handled separately
		config: strict,
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "test",
		config: recommended,
		sourceFilePath: path.join(__dirname, "..", "src", "test", "file.ts"),
	},
];

/**
 * Generates the applied ESLint config for a specific file and config.
 */
async function generateConfig(filePath: string, config: FlatConfigArray): Promise<string> {
	console.log(`Generating config for ${filePath}`);

	// ESLint 9's default ESLint class uses flat config format.
	// Use overrideConfigFile: true to prevent loading eslint.config.js,
	// and pass the config directly via overrideConfig.
	const eslint = new ESLint({
		overrideConfigFile: true,
		overrideConfig: config,
	});

	const resolvedConfig = (await eslint.calculateConfigForFile(filePath)) as unknown;
	if (!resolvedConfig) {
		console.warn("Warning: ESLint returned undefined config for " + filePath);
		return "{}\n";
	}

	// Serialize and parse to create a clean copy without any circular references or non-serializable values
	const cleanConfig = JSON.parse(JSON.stringify(resolvedConfig));

	// Remove languageOptions which contains environment-specific paths and large globals
	if (cleanConfig.languageOptions) {
		delete cleanConfig.languageOptions;
	}

	// Convert numeric severities to string equivalents in rules
	if (cleanConfig.rules) {
		for (const [ruleName, ruleConfig] of Object.entries(cleanConfig.rules)) {
			if (Array.isArray(ruleConfig) && ruleConfig.length > 0) {
				const severity = ruleConfig[0];
				if (severity === 0) ruleConfig[0] = "off";
				else if (severity === 1) ruleConfig[0] = "warn";
				else if (severity === 2) ruleConfig[0] = "error";
			} else if (ruleConfig === 0 || ruleConfig === 1 || ruleConfig === 2) {
				// Handle standalone severity values
				const stringValue = ruleConfig === 0 ? "off" : ruleConfig === 1 ? "warn" : "error";
				cleanConfig.rules[ruleName] = stringValue;
			}
		}
	}

	// Generate the new content with sorting applied
	// Sorting at all is desirable as otherwise changes in the order of common config references may cause large diffs
	// with little semantic meaning.
	// On the other hand, fully sorting the json can be misleading:
	// some eslint settings depend on object key order ("import-x/resolver" being a known one, see
	// https://github.com/un-ts/eslint-plugin-import-x/blob/master/src/utils/resolve.ts).
	// Using depth 2 is a nice compromise.
	const sortedConfig = sortJson(cleanConfig, { indentSize: 4, depth: 2 });
	const finalConfig = JSON.stringify(sortedConfig, null, 4);

	// Add a trailing newline to match preferred output formatting
	return finalConfig + "\n";
}

(async () => {
	const args = process.argv.slice(2);

	if (args.length !== 1) {
		console.error("Usage: tsx print-configs.ts <output-directory>");
		process.exit(1);
	}

	const outputPath = args[0];
	await fs.mkdir(outputPath, { recursive: true });
	const expectedFiles = new Set<string>();

	for (const { name, config, sourceFilePath } of configsToPrint) {
		const outputFilePath = path.join(outputPath, `${name}.json`);
		expectedFiles.add(`${name}.json`);

		let originalContent = "";
		try {
			originalContent = await fs.readFile(outputFilePath, "utf8");
		} catch (err) {
			// File doesn't exist yet, which is OK - we'll create it
		}

		const newContent = await generateConfig(sourceFilePath, config);

		// Only write the file if the content has changed
		if (newContent !== originalContent) {
			await fs.writeFile(outputFilePath, newContent);
		}
	}

	// Remove any files in the output directory that aren't in the expected list
	const existingFiles = await fs.readdir(outputPath);
	for (const file of existingFiles) {
		if (file.endsWith(".json") && !expectedFiles.has(file)) {
			console.log(`Removing unexpected file: ${file}`);
			await fs.unlink(path.join(outputPath, file));
		}
	}
})();
