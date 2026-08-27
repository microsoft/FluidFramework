/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import process from "node:process";

import chalk from "chalk";
import { globby } from "globby";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { processDocument } from "./processing.js";
import { createTransformRegistry } from "./transformRegistry.js";

/** Default glob patterns for Markdown and MDX documents. */
const defaultMatchPattern = ["**/*.md", "**/*.mdx"];

/** Maximum number of documentation files that the CLI processes concurrently. */
const maximumConcurrentFiles = 8;

/**
 * Applies an asynchronous operation to each value with a fixed concurrency limit.
 *
 * @template T - The input value type.
 * @template U - The result value type.
 * @param {readonly T[]} values - The values to process.
 * @param {number} concurrency - The maximum number of operations that can run concurrently.
 * @param {(value: T) => Promise<U>} operation - The operation to apply to each value.
 * @returns {Promise<U[]>} The results in the same order as the input values.
 */
async function mapWithConcurrency(values, concurrency, operation) {
	const results = new Array(values.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex++;
			results[index] = await operation(values[index]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
	return results;
}

/**
 * Selects documentation files and updates their generated regions.
 *
 * @param {string[]} [argumentsList] - The command-line arguments. The default excludes the Node.js executable and script path.
 * @returns {Promise<number>} The number of files that changed.
 * @throws If file selection, parsing, transformation, or writing fails.
 */
export async function runCli(argumentsList = hideBin(process.argv)) {
	const argv = yargs(argumentsList)
		.usage("Usage: $0 [options]")
		.option("f", {
			alias: "files",
			type: "array",
			description: "Glob patterns for the documentation files to process.",
		})
		.option("w", {
			alias: "workingDirectory",
			type: "string",
			description: "Directory from which file patterns and relative paths are resolved.",
		})
		.help("h")
		.alias("h", "help")
		.parseSync();

	const workingDirectory = path.resolve(argv.workingDirectory ?? process.cwd());
	const patterns = argv.files ?? defaultMatchPattern;
	const files = await globby(patterns, {
		cwd: workingDirectory,
		gitignore: true,
		onlyFiles: true,
	});
	const registry = createTransformRegistry();
	const changed = await mapWithConcurrency(files, maximumConcurrentFiles, (file) =>
		processDocument(path.resolve(workingDirectory, file), registry),
	);
	const changedCount = changed.filter(Boolean).length;
	console.log(
		chalk.green(`Updated ${changedCount} ${changedCount === 1 ? "file" : "files"}.`),
	);
	return changedCount;
}
