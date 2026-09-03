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
 * All operations complete before this function reports their errors.
 */
async function mapWithConcurrency<T, U>(
	values: readonly T[],
	concurrency: number,
	operation: (value: T) => Promise<U>,
): Promise<U[]> {
	const results: U[] = new Array<U>(values.length);
	const errors: unknown[] = [];
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex++;
			try {
				results[index] = await operation(values[index] as T);
			} catch (error) {
				errors.push(error);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
	if (errors.length > 0) {
		throw new AggregateError(errors, `${errors.length} operations failed.`);
	}
	return results;
}

/**
 * Selects documentation files and updates their generated regions.
 *
 * @param argumentsList - The command-line arguments to parse. Defaults to the current process arguments.
 * @returns The number of files whose generated content changed.
 */
export async function runCli(
	argumentsList: string[] = hideBin(process.argv),
): Promise<number> {
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

	const workingDirectory = path.resolve(
		typeof argv.workingDirectory === "string" ? argv.workingDirectory : process.cwd(),
	);
	const patterns = Array.isArray(argv.files)
		? argv.files.filter((value: unknown): value is string => typeof value === "string")
		: defaultMatchPattern;
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
