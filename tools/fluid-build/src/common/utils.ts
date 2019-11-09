/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as glob from "glob";
import * as util from "util";
import * as fs from "fs";
import * as child_process from "child_process";

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
export const realpathAsync = util.promisify(fs.realpath);
export const rmdirAsync = util.promisify(fs.rmdir);
export const symlinkAsync = util.promisify(fs.symlink);
export const mkdirAsync = util.promisify(fs.mkdir);

export interface ExecAsyncResult {
    error: child_process.ExecException | null;
    stdout: string;
    stderr: string;
}
export async function execAsync(command: string, options: child_process.ExecOptions): Promise<ExecAsyncResult> {
    return new Promise((resolve, reject) => {
        child_process.exec(command, options, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr });
        })
    });
}