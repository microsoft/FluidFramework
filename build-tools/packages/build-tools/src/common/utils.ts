/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import isEqual from "lodash.isequal";

/**
 *	An array of commands that are known to have subcommands and should be parsed as such. These will be combined with
 *	any additional commands provided in the Fluid build config.
 */
const defaultMultiCommandExecutables = ["flub", "biome"] as const;

export function getExecutableFromCommand(command: string, multiCommandExecutables: string[]) {
	let toReturn: string;
	const commands = command.split(" ");
	const multiExecutables: Set<string> = new Set([
		...defaultMultiCommandExecutables,
		...multiCommandExecutables,
	]);
	if (multiExecutables.has(commands[0])) {
		// For multi-commands (e.g., "flub bump ...") our heuristic is to scan for the first argument that cannot
		// be the name of a sub-command, such as '.' or an argument that starts with '-'.
		//
		// This assumes that subcommand names always precede flags and that non-command arguments
		// match one of the patterns we look for below.
		const nonCommandIndex = commands.findIndex((c) => c.startsWith("-") || c === ".");
		toReturn = nonCommandIndex !== -1 ? commands.slice(0, nonCommandIndex).join(" ") : command;
	} else {
		toReturn = commands[0];
	}
	return toReturn;
}

export interface ExecAsyncResult {
	error: child_process.ExecException | null;
	stdout: string;
	stderr: string;
}

export async function execAsync(
	command: string,
	options: child_process.ExecOptions,
	pipeStdIn?: string,
): Promise<ExecAsyncResult> {
	return new Promise((resolve) => {
		const p = child_process.exec(command, options, (error, stdout, stderr) => {
			resolve({ error, stdout, stderr });
		});

		if (pipeStdIn && p.stdin) {
			p.stdin.write(pipeStdIn);
			p.stdin.end();
		}
	});
}

export async function execWithErrorAsync(
	command: string,
	options: child_process.ExecOptions,
	errorPrefix: string,
	warning: boolean = true,
	pipeStdIn?: string,
): Promise<ExecAsyncResult> {
	const ret = await execAsync(command, options, pipeStdIn);
	printExecError(ret, command, errorPrefix, warning);
	return ret;
}

async function rimrafAsync(deletePath: string) {
	return execAsync(`rimraf "${deletePath}"`, {
		env: {
			PATH: `${process.env["PATH"]}${path.delimiter}${path.join(
				__dirname,
				"..",
				"..",
				"node_modules",
				".bin",
			)}`,
		},
	});
}

export async function rimrafWithErrorAsync(deletePath: string, errorPrefix: string) {
	const ret = await rimrafAsync(deletePath);
	printExecError(ret, `rimraf ${deletePath}`, errorPrefix, true);
	return ret;
}

function printExecError(
	ret: ExecAsyncResult,
	command: string,
	errorPrefix: string,
	warning: boolean,
) {
	if (ret.error) {
		console.error(`${errorPrefix}: error during command ${command}`);
		console.error(`${errorPrefix}: ${ret.error.message}`);
		console.error(
			ret.stdout
				? `${errorPrefix}: ${ret.stdout}\n${ret.stderr}`
				: `${errorPrefix}: ${ret.stderr}`,
		);
	} else if (warning && ret.stderr) {
		// no error code but still error messages, treat them is non fatal warnings
		console.warn(`${errorPrefix}: warning during command ${command}`);
		console.warn(`${errorPrefix}: ${ret.stderr}`);
	}
}

export async function lookUpDirAsync(
	dir: string,
	callback: (currentDir: string) => Promise<boolean>,
) {
	let curr = path.resolve(dir);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (await callback(curr)) {
			return curr;
		}

		const up = path.resolve(curr, "..");
		if (up === curr) {
			break;
		}
		curr = up;
	}

	return undefined;
}

export function lookUpDirSync(dir: string, callback: (currentDir: string) => boolean) {
	let curr = path.resolve(dir);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (callback(curr)) {
			return curr;
		}

		const up = path.resolve(curr, "..");
		if (up === curr) {
			break;
		}
		curr = up;
	}

	return undefined;
}

export function isSameFileOrDir(f1: string, f2: string) {
	if (f1 === f2) {
		return true;
	}
	const n1 = path.normalize(f1);
	const n2 = path.normalize(f2);
	if (n1 === n2) {
		return true;
	}
	if (n1.toLowerCase() != n2.toLowerCase()) {
		return false;
	}
	return isEqual(fs.lstatSync(n1), fs.lstatSync(n2));
}

/**
 * Execute a command. If there is an error, throw.
 *
 * @param cmd - Command line to execute
 * @param dir - dir the directory to execute on
 * @param error - description of command line to print when error happens
 * @param pipeStdIn - optional string to pipe to stdin
 */
export async function exec(
	cmd: string,
	dir: string,
	error: string,
	pipeStdIn?: string,
	options?: Omit<child_process.ExecOptions, "cwd">,
) {
	const result = await execAsync(cmd, { ...options, cwd: dir }, pipeStdIn);
	if (result.error) {
		throw new Error(
			`ERROR: Unable to ${error}\nERROR: error during command ${cmd}\nERROR: ${result.error.message}`,
		);
	}
	return result.stdout;
}

/**
 * Execute a command. If there is an error, undefined is returned.
 *
 * @param cmd - Command line to execute
 * @param dir - dir the directory to execute on
 * @param pipeStdIn - optional string to pipe to stdin
 */
export async function execNoError(
	cmd: string,
	dir: string,
	pipeStdIn?: string,
): Promise<string | undefined> {
	const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
	if (result.error) {
		return undefined;
	}
	return result.stdout;
}
