/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const markdownMagic = require("@tylerbu/markdown-magic");
const path = require("path");
const process = require("process");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const config = require("./md-magic.config.cjs");

const defaultMatchPattern = "**/*.md";

const argv = yargs(hideBin(process.argv))
	.usage("Usage: $0 [options]")
	.option("f", {
		alias: "files",
		type: "array",
		description: `Glob pattern(s) indicating the files to process. Default: "${defaultMatchPattern}".`,
	})
	.option("w", {
		alias: "workingDirectory",
		type: "string",
		description:
			"The working directory in which to run the script. Default: the current Node.js working directory.",
	})
	.example(
		"$0 -f docs/**/*.md !docs/README.md",
		"Run on all Markdown files under 'docs', except 'README.md'.",
	)
	.help("h")
	.alias("h", "--help").argv;

const matchPattern = argv.files ?? defaultMatchPattern;

let workingDirectory = process.cwd();
if (argv.workingDirectory) {
	workingDirectory = path.resolve(argv.workingDirectory);
	process.chdir(workingDirectory);
}

console.log(
	`Searching for files matching pattern(s) "${matchPattern}" under "${workingDirectory}"...`,
);

markdownMagic(matchPattern, config).then(
	() => {
		console.log(chalk.green("SUCCESS: Documentation updated!"));
		process.exit(0);
	},
	(error) => {
		console.error(
			chalk.red("FAILURE: Markdown Magic could not be completed due to an error: "),
			error,
		);
		process.exit(1);
	},
);
