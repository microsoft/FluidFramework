/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as child_process from "child_process";
import * as fs from "fs";
import * as glob from "glob";
import isEqual from "lodash.isequal";
import * as path from "path";
import * as util from "util";

export function getExecutableFromCommand(command: string) {
	let toReturn: string;
	const commands = command.split(" ");
	if (commands[0] === "flub") {
		// Find the first flag argument, and filter them out. Assumes flags come at the end of the command, and that all
		// subsequent arguments are flags.
		const flagsStartIndex = commands.findIndex((c) => c.startsWith("-"));
		toReturn = flagsStartIndex !== -1 ? commands.slice(0, flagsStartIndex).join(" ") : command;
	} else {
		toReturn = commands[0];
	}
	return toReturn;
}

export function toPosixPath(s: string) {
	return path.sep === "\\" ? s.replace(/\\/g, "/") : s;
}

export async function globFn(pattern: string, options: glob.IOptions = {}): Promise<string[]> {
	return new Promise((resolve, reject) => {
		glob.default(pattern, options, (err, matches) => {
			if (err) {
				reject(err);
			}
			resolve(matches);
		});
	});
}

export function unquote(str: string) {
	if (str.length >= 2 && str[0] === '"' && str[str.length - 1] === '"') {
		return str.substr(1, str.length - 2);
	}
	return str;
}

export const statAsync = util.promisify(fs.stat);
export const lstatAsync = util.promisify(fs.lstat);
export const readFileAsync = util.promisify(fs.readFile);
export const writeFileAsync = util.promisify(fs.writeFile);
export const unlinkAsync = util.promisify(fs.unlink);
export const existsSync = fs.existsSync;
export const appendFileAsync = util.promisify(fs.appendFile);
export const realpathAsync = util.promisify(fs.realpath.native);
export const symlinkAsync = util.promisify(fs.symlink);
export const mkdirAsync = util.promisify(fs.mkdir);
export const copyFileAsync = util.promisify(fs.copyFile);
export const renameAsync = util.promisify(fs.rename);

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
	} else if (
		warning &&
		ret.stderr &&
		// tsc-multi writes to stderr even when there are no errors, so this condition excludes that case as a workaround.
		// Otherwise fluid-build spams warnings for all tsc-multi tasks.
		!ret.stderr.includes("Found 0 errors")
	) {
		// no error code but still error messages, treat them is non fatal warnings
		console.warn(`${errorPrefix}: warning during command ${command}`);
		console.warn(`${errorPrefix}: ${ret.stderr}`);
	}
}

export function resolveNodeModule(basePath: string, lookupPath: string) {
	let currentBasePath = basePath;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const tryPath = path.join(currentBasePath, "node_modules", lookupPath);
		if (existsSync(tryPath)) {
			return tryPath;
		}
		const nextBasePath = path.resolve(currentBasePath, "..");
		if (nextBasePath === currentBasePath) {
			break;
		}
		currentBasePath = nextBasePath;
	}
	return undefined;
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

export function fatal(error: string): never {
	const e = new Error(error);
	(e as any).fatal = true;
	throw e;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function exec(cmd: string, dir: string, error: string, pipeStdIn?: string) {
	const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
	if (result.error) {
		fatal(
			`ERROR: Unable to ${error}\nERROR: error during command ${cmd}\nERROR: ${result.error.message}`,
		);
	}
	return result.stdout;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function execNoError(cmd: string, dir: string, pipeStdIn?: string) {
	const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
	if (result.error) {
		return undefined;
	}
	return result.stdout;
}

export async function loadModule(modulePath: string, moduleType?: string) {
	const ext = path.extname(modulePath);
	const esm = ext === ".mjs" || (ext === ".js" && moduleType === "module");
	if (esm) {
		return await import(modulePath);
	}
	return require(modulePath);
}
