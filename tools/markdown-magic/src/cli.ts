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

/** Glob patterns that the file search always excludes. */
const defaultIgnorePattern = ["**/node_modules/**"];

/** Maximum number of documentation files that the CLI processes concurrently. */
const maximumConcurrentFiles = 8;

/**
 * Reports file-processing progress to standard output.
 * @remarks
 * Interactive terminals receive in-place updates.
 * Redirected and piped output receives only the
 * final count so that CI logs and parent process multiplexers do not print one line per file.
 */
function reportProgress(processedCount: number, totalCount: number): void {
	const fileLabel = totalCount === 1 ? "file" : "files";
	if (process.stdout.isTTY) {
		const message = `Processed ${processedCount} of ${totalCount} ${fileLabel}.`;
		process.stdout.write(`\r${message}`);
		if (processedCount === totalCount) {
			process.stdout.write("\n");
		}
	} else if (processedCount === totalCount) {
		console.log(`Processed ${processedCount} ${fileLabel}.`);
	}
}

/**
 * Applies an asynchronous operation to each value with a fixed concurrency limit.
 *
 * All operations complete before this function reports their errors.
 */
async function mapWithConcurrency<T, U>(
	values: readonly T[],
	concurrency: number,
	operation: (value: T) => Promise<U>,
	onProgress: (processedCount: number, totalCount: number) => void,
): Promise<U[]> {
	const results: U[] = new Array<U>(values.length);
	const errors: unknown[] = [];
	let nextIndex = 0;
	let processedCount = 0;
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex++;
			try {
				results[index] = await operation(values[index] as T);
			} catch (error) {
				errors.push(error);
			} finally {
				onProgress(++processedCount, values.length);
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
	console.log("Finding documentation files...");
	const files = await globby(patterns, {
		cwd: workingDirectory,
		gitignore: true,
		ignore: defaultIgnorePattern,
		onlyFiles: true,
	});
	const registry = createTransformRegistry();
	reportProgress(0, files.length);
	const changed = await mapWithConcurrency(
		files,
		maximumConcurrentFiles,
		(file) => processDocument(path.resolve(workingDirectory, file), registry),
		reportProgress,
	);
	const changedCount = changed.filter(Boolean).length;
	console.log(
		chalk.green(`Updated ${changedCount} ${changedCount === 1 ? "file" : "files"}.`),
	);
	return changedCount;
}
