/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const glob = require("glob")
const shell = require("shelljs");

const args = process.argv.slice(2);
const glob_arg = args[0];

try {
    const files = glob.sync(glob_arg);
    console.log(files);
    for (const file of files) {
        const command = `java -jar ./bin/ditaa.jar ${file} -rov --background F2F2F2`;
        shell.echo(command);
        if (shell.exec(command).code !== 0) {
            shell.echo("Error: ditaa.jar");
        }
    }
} catch (e) {
    console.log(e);
}
