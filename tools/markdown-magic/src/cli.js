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

const defaultMatchPattern = ["**/*.md", "**/*.mdx"];

/**
 * @template T, U
 * @param {readonly T[]} values
 * @param {number} concurrency
 * @param {(value: T) => Promise<U>} operation
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
		deep: 5,
	});
	const registry = createTransformRegistry();
	const changed = await mapWithConcurrency(files, 8, (file) =>
		processDocument(path.resolve(workingDirectory, file), registry),
	);
	const changedCount = changed.filter(Boolean).length;
	console.log(
		chalk.green(`Updated ${changedCount} ${changedCount === 1 ? "file" : "files"}.`),
	);
	return changedCount;
}
