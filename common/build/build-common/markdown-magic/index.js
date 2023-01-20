/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const markdownMagic = require("@tylerbu/markdown-magic");
const process = require("process");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const config = require("./md-magic.config.js");

const argv = yargs(hideBin(process.argv))
	.usage("Usage: $0 [options]")
	.alias("f", "files")
	.describe("f", "Glob pattern indicating the files to process.")
	.example("$0 -f docs/**/*.md", "Run on all Markdown files under 'docs'.")
	.help("h")
	.alias("h", "--help").argv;

const matchPattern = argv.files ?? "**/*.md";

console.log(`Searching for files matching pattern "${matchPattern}"...`);

markdownMagic(matchPattern, config).then(
	() => {
		console.log(chalk.green("SUCCESS: Documentation updated!"));
		process.exit(0);
	},
	(error) => {
		console.error("FAILURE: Markdown Magic could not be completed due to an error.", error);
		process.exit(1);
	},
);
