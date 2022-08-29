/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as glob from "glob";
import * as util from "util";
import * as fs from "fs";
import * as child_process from "child_process";
import isEqual from "lodash.isequal";

export function getExecutableFromCommand(command: string) {
    return command.split(" ")[0];
}

export function toPosixPath(s: string) {
    return path.sep === "\\" ? s.replace(/\\/g, "/") : s;
}

export async function globFn(pattern: string, options: glob.IOptions = {}): Promise<string[]> {
    return new Promise((resolve, reject) => {
        glob.default(pattern, options, (err, matches) => {
            if (err) { reject(err); }
            resolve(matches);
        });
    });
}

export function unquote(str: string) {
    if (str.length >= 2 && str[0] === "\"" && str[str.length - 1] === "\"") {
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

export async function execAsync(command: string, options: child_process.ExecOptions, pipeStdIn?: string): Promise<ExecAsyncResult> {
    return new Promise((resolve, reject) => {
        const p = child_process.exec(command, options, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr });
        });

        if (pipeStdIn && p.stdin) {
            p.stdin.write(pipeStdIn);
            p.stdin.end();
        }
    });
}

export async function execWithErrorAsync(command: string, options: child_process.ExecOptions, errorPrefix: string, warning: boolean = true, pipeStdIn?: string): Promise<ExecAsyncResult> {
    const ret = await execAsync(command, options, pipeStdIn);
    printExecError(ret, command, errorPrefix, warning);
    return ret;
}

async function rimrafAsync(deletePath: string) {
    return execAsync(`rimraf "${deletePath}"`, {
        env: { PATH: `${process.env["PATH"]}${path.delimiter}${path.join(__dirname, "..", "..", "node_modules", ".bin")}` }
    });
}

export async function rimrafWithErrorAsync(deletePath: string, errorPrefix: string) {
    const ret = await rimrafAsync(deletePath);
    printExecError(ret, `rimraf ${deletePath}`, errorPrefix, true);
    return ret;
}

function printExecError(ret: ExecAsyncResult, command: string, errorPrefix: string, warning: boolean) {
    if (ret.error) {
        console.error(`${errorPrefix}: error during command ${command}`);
        console.error(`${errorPrefix}: ${ret.error.message}`);
        console.error(ret.stdout ? `${errorPrefix}: ${ret.stdout}\n${ret.stderr}` : `${errorPrefix}: ${ret.stderr}`);
    } else if (warning && ret.stderr) {
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

export async function readJsonAsync(filename: string) {
    const content = await readFileAsync(filename, "utf-8");
    return JSON.parse(content);
}

export function readJsonSync(filename: string) {
    const content = fs.readFileSync(filename, "utf-8");
    return JSON.parse(content);
}

export async function lookUpDirAsync(dir: string, callback: (currentDir: string) => Promise<boolean>) {
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
    if (f1 === f2) { return true; }
    const n1 = path.normalize(f1);
    const n2 = path.normalize(f2);
    if (n1 === n2) { return true; }
    if (n1.toLowerCase() != n2.toLowerCase()) { return false; }
    return isEqual(fs.lstatSync(n1), fs.lstatSync(n2));
}
