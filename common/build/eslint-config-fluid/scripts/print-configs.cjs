/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const { ESLint } = require("eslint");
const sortJson = require("sort-json");

const configsToPrint = [
	{
		name: "default",
		configPath: path.join(__dirname, "..", "index.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "minimal",
		configPath: path.join(__dirname, "..", "minimal-deprecated.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "react",
		configPath: path.join(__dirname, "..", "index.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "file.tsx"),
	},
	{
		name: "recommended",
		configPath: path.join(__dirname, "..", "recommended.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "strict",
		configPath: path.join(__dirname, "..", "strict.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "strict-biome",
		configPath: path.join(__dirname, "..", "strict-biome.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "file.ts"),
	},
	{
		name: "test",
		configPath: path.join(__dirname, "..", "recommended.js"),
		sourceFilePath: path.join(__dirname, "..", "src", "test", "file.ts"),
	},
];

async function printConfig(filePath, configPath) {
	console.log(`Printing config for ${filePath} using ${configPath}`);
	const eslint = new ESLint({
		overrideConfigFile: configPath,
	});

	const config = await eslint.calculateConfigForFile(filePath);
	// Remove the parser property because it's an absolute path and will vary based on the local environment.
	delete config.parser;

	// Generate the new content with sorting applied
	// Sorting at all is desirable as otherwise changes in the order of common config references may cause large diffs
	// with little semantic meaning.
	// On the other hand, fully sorting the json can be misleading:
	// some eslint settings depend on object key order ("import-x/resolver" being a known one, see
	// https://github.com/un-ts/eslint-plugin-import-x/blob/master/src/utils/resolve.ts).
	// Using depth 2 is a nice compromise.
	const sortedConfig = sortJson(config, { indentSize: 4, depth: 2 });
	const finalConfig = JSON.stringify(sortedConfig, null, 4);

	// Add a trailing newline to match preferred output formatting
	return finalConfig + "\n";
}

(async () => {
	const args = process.argv.slice(2);
	const outputPath = args[0];
	const writePromises = [];

	for (const { name, configPath, sourceFilePath } of configsToPrint) {
		const outputFilePath = path.join(outputPath, `${name}.json`);
		let originalContent = "";
		try {
			originalContent = await fs.readFile(outputFilePath, "utf8");
		} catch (err) {
			console.error(`Error reading file ${outputFilePath}:`, err);
			// It's OK to continue because we might be outputting a new file.
			continue;
		}

		const newContent = await printConfig(sourceFilePath, configPath);

		// Only write the file if the content has changed
		if (newContent !== originalContent) {
			writePromises.push(fs.writeFile(outputFilePath, newContent));
		}
	}

	await Promise.all(writePromises);
})();
