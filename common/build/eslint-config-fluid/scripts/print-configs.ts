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

import { loadESLint } from "eslint";
import sortJson from "sort-json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine which config files to use based on ESLINT_USE_FLAT_CONFIG
// NOTE: loadESLint() returns the appropriate ESLint class based on ESLINT_USE_FLAT_CONFIG,
// but we still need to manually determine which config file format to use.
// Legacy ESLint cannot read flat config files (.mjs), and FlatESLint cannot read legacy config files (.js/.cjs).
const useFlatConfig = process.env.ESLINT_USE_FLAT_CONFIG === "true";

// During the hybrid ESLint 8/9 migration, we need to maintain both legacy (.js/.cjs) and flat (.mjs) configs.
// The .eslint-print-configs directory contains standalone flat configs that can be loaded by ESLint 9
// without requiring the legacy config infrastructure.
const configDir = useFlatConfig ? "../.eslint-print-configs" : "..";

// File extensions differ between legacy (.js) and flat (.mjs) config formats.
// Using .mjs for flat configs ensures they're treated as ES modules.
const configExt = useFlatConfig ? ".mjs" : ".js";

interface ConfigToPrint {
	name: string;
	configPath: string;
	sourceFilePath: string;
}

// Legacy configs use "index.js" for default and "minimal-deprecated.js" for minimal.
// Flat configs use "recommended.mjs" for default and "minimal.mjs" for minimal.
const defaultConfigFile = useFlatConfig ? "recommended.mjs" : "index.js";
const minimalConfigFile = `minimal${useFlatConfig ? "" : "-deprecated"}${configExt}`;
const strictBiomeConfigFile = `strict${useFlatConfig ? "" : "-biome"}${configExt}`;

const configsToPrint: ConfigToPrint[] = [
	{
		name: "default",
		configPath: path.join(__dirname, configDir, defaultConfigFile),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "minimal",
		configPath: path.join(__dirname, configDir, minimalConfigFile),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "react",
		configPath: path.join(__dirname, configDir, defaultConfigFile),
		sourceFilePath: path.join(__dirname, "..", "src", "file.tsx"),
	},
	{
		name: "recommended",
		configPath: path.join(__dirname, configDir, `recommended${configExt}`),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "strict",
		configPath: path.join(__dirname, configDir, `strict${configExt}`),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "strict-biome",
		configPath: path.join(__dirname, configDir, strictBiomeConfigFile),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "test",
		configPath: path.join(__dirname, configDir, `recommended${configExt}`),
		sourceFilePath: path.join(__dirname, "..", "src", "test", "file.ts"),
	},
];

/**
 * Generates the applied ESLint config for a specific file and config path.
 */
async function generateConfig(filePath: string, configPath: string): Promise<string> {
	console.log(`Generating config for ${filePath} using ${configPath}`);

	// loadESLint() respects ESLINT_USE_FLAT_CONFIG and returns the appropriate ESLint class.
	// However, it's the caller's responsibility to provide config files in the correct format.
	const ESLint = await loadESLint();
	const eslint = new ESLint({
		overrideConfigFile: configPath,
	});

	const config = (await eslint.calculateConfigForFile(filePath)) as unknown;
	if (!config) {
		console.warn("Warning: ESLint returned undefined config for " + filePath);
		return "{}\n";
	}

	// Serialize and parse to create a clean copy without any circular references or non-serializable values
	const cleanConfig = JSON.parse(JSON.stringify(config));

	// Remove properties that contain environment-specific paths
	if (useFlatConfig) {
		// For flat configs, remove languageOptions which has environment-specific paths and large globals
		if (cleanConfig.languageOptions) {
			delete cleanConfig.languageOptions;
		}
	} else {
		// For legacy configs, remove the parser property
		delete cleanConfig.parser;
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

	for (const { name, configPath, sourceFilePath } of configsToPrint) {
		const outputFilePath = path.join(outputPath, `${name}.json`);
		expectedFiles.add(`${name}.json`);

		let originalContent = "";
		try {
			originalContent = await fs.readFile(outputFilePath, "utf8");
		} catch (err) {
			// File doesn't exist yet, which is OK - we'll create it
		}

		const newContent = await generateConfig(sourceFilePath, configPath);

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
