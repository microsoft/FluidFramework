/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const glob = require("glob");
const path = require("path");
const shell = require("shelljs");

const args = process.argv.slice(2);
const glob_arg = args[0];

try {
    const files = glob.sync(glob_arg);
    let command = "";
    let commandBase = "";
    switch (process.platform) {
        case "win32":
            commandBase = `call ".\\bin\\ditaa.exe"`;
            break;
        default:
            commandBase = `./bin/ditaa`
    }

    for (const file of files) {
        const targetFile = `${path.basename(file, ".ditaa")}.png`;
        const targetPath = path.posix.join(
            path.dirname(file),
            targetFile,
        );
        command = `${commandBase} "${file}" "${targetFile}"`;
        shell.echo(command);
        const result = shell.exec(command).code;
        if (result !== 0 && result !== undefined) {
            shell.echo(`Error: ditaa: ${result}`);
        }
        const resolvedTarget = path.posix.resolve(targetFile);
        fs.copyFileSync(resolvedTarget, targetPath);
        fs.unlinkSync(targetFile);
        shell.echo(`Moved ${targetFile} -> ${targetPath}`);
    }
} catch (e) {
    console.log(e);
}
