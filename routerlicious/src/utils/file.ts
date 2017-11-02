import * as promisify from "es6-promisify";
import * as fs from "fs";
import * as mkdirpCallback from "mkdirp";

export function pathExists(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        fs.exists(path, (exists) => {
            resolve(exists);
        });
    });
}

export const mkdirp = promisify(mkdirpCallback);

export const writeFile = promisify(fs.writeFile);
