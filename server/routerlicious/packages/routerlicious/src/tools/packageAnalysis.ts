/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";
import * as commander from "commander";

const getExtension = (fileName: string): string => fileName.split(".").pop();
const list = (val: string): string[] => val.split(",");

function ensurePath(filePath: string) {
    const dir = path.dirname(filePath);
    if (fs.existsSync(dir)) {
        return true;
    }
    ensurePath(dir);
    fs.mkdirSync(dir);
}

commander
    .version("0.0.1")
    .option("-d, --directory <directory>", "directory")
    .option("-e, --extensions <extensions>", "extensions to accept", list, ".js,.tgz")
    .option("-w, --write [pbar]", "write to specific path", "./latest-size.json")
    .parse(process.argv);

const extensions = commander.extensions as string[];

const files = fs.readdirSync(commander.directory);

const sizeLogs: any = {};

for (const file of files) {
    if (extensions.includes(getExtension(file))) {
        sizeLogs[file] = fs.statSync(path.join(commander.directory, file)).size;
    }
}

const sizeString = JSON.stringify(sizeLogs);
ensurePath(commander.write);

fs.writeFile(commander.write, sizeString, (err) => {
    if (err) {
        console.log(err);
        process.exit(1);
    }
    process.exit(0);
});
