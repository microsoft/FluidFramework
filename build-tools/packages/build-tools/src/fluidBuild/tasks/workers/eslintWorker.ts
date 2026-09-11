/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import type { WorkerExecResult, WorkerMessage } from "./worker.js";

const require = createRequire(import.meta.url);

/**
 * The minimal structural subset of the `eslint` package that this worker uses.
 *
 * @remarks
 * The `eslint` module is resolved from the target package's scope and loaded dynamically, so it can
 * be any version. Only this small and long stable surface is relied upon, rather than the types of
 * the `eslint` version that this package itself depends on.
 */
interface EslintModule {
	readonly ESLint: new () => EslintEngine;
}

interface EslintEngine {
	lintFiles(patterns: string): Promise<EslintLintResult[]>;
	loadFormatter(name: string): Promise<EslintFormatter>;
}

interface EslintLintResult {
	readonly errorCount: number;
}

interface EslintFormatter {
	format(results: EslintLintResult[]): string | Promise<string>;
}

export async function lint(message: WorkerMessage): Promise<WorkerExecResult> {
	const oldArgv = process.argv;
	const oldCwd = process.cwd();
	try {
		// Load the eslint version that is in the cwd scope
		const eslintPath = require.resolve("eslint", { paths: [message.cwd] });
		// The module is loaded dynamically, so its type is not statically known here. Assert only
		// the minimal surface that is actually used.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const eslint = require(eslintPath) as EslintModule;

		// TODO: better parsing, assume split delimited for now.
		const argv = message.command.split(" ");

		// Some rules look at process.argv directly and change behaviors
		// (e.g. eslint-plugin-react log some error to console only if format is not set)
		// So just overwrite our argv
		process.argv = [process.argv0, eslintPath, ...argv.slice(1)];
		process.chdir(message.cwd);

		// assume "eslint --format stylish src"
		const engine = new eslint.ESLint();
		const results = await engine.lintFiles("src");
		let formatter: EslintFormatter;
		try {
			formatter = await engine.loadFormatter("stylish");
		} catch (e) {
			console.error((e as Partial<Error>).message);
			return { code: 2 };
		}

		const output = await formatter.format(results);

		if (output) {
			console.info(output);
		}
		let code = 0;
		for (const result of results) {
			code += result.errorCount;
		}
		return { code };
	} finally {
		process.argv = oldArgv;
		process.chdir(oldCwd);
	}
}
