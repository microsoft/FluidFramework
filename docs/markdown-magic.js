/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const markdownMagic = require("@tylerbu/markdown-magic");
const process = require("process");

const config = require("./md-magic.config.js");

/**
 * Runs Markdown Magic in the specified working directory.
 * Searches all `.md` files for processing.
 *
 * @param {string} workingDirectory - Directory in which to run Markdown Magic.
 * @param {string | string[]} matchPatterns - File name(s) / glob pattern(s) to file match on.
 * See {@link https://www.npmjs.com/package/@tylerbu/markdown-magic | @tylerbu/markdown-magic} for specific
 * requirements.
 */
function main(workingDirectory, matchPatterns) {
    process.chdir(workingDirectory);
    console.log(`Searching for markdown files in "${workingDirectory}" matching pattern(s) "${matchPatterns}"...`);

    markdownMagic(matchPatterns, config).then(
        () => {
            console.log(chalk.green(`SUCCESS: Markdown Magic completed in "${workingDirectory}"!`));
            process.exit(0);
        },
        (error) => {
            console.error("FAILURE: Markdown Magic could not be completed due to an error.", error);
            process.exit(1);
        });
}

module.exports = main;
