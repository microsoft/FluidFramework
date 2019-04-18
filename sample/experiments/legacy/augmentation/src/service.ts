import { exec } from "child_process";
import * as fs from "fs";
import * as helper from "./helper";

/**
 * Given a directory path and command, invokes the command into a shell.
 */
export async function runCommand(path: string, cmd: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        exec(cmd, {cwd: path}, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            }
            resolve(stdout);
        });
    });
}

/**
 * Given full file path, returns the content of the file.
 */
export async function readFile(path: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        fs.readFile(path, "utf8", (error, data) => {
            if (error) {
                console.log(`Error reading file: ${error}`);
                reject(error);
            }
            resolve(data);
        });
    });
}

/**
 * Given full file path and content, writes to the file.
 */
export async function writeFile(path: string, text: string): Promise<any> {
    const textToWrite = JSON.stringify(helper.constructSpellcheckerInput(text));
    return new Promise<any>((resolve, reject) => {
        fs.writeFile(path, textToWrite, (error) => {
            if (error) {
                console.log(`Error writing file: ${error}`);
                reject(error);
            } else {
                resolve();
            }
        });
    });
}
