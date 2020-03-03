/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const { readdir, createReadStream, writeFile } = require("fs-extra");
const { createInterface } = require("readline");
const { join, parse } = require("path");
const { exec } = require("child_process");
const getFirstLine = require("firstline");

// This script is modified from a version in faast.js' build system
//
// https://github.com/faastjs/faast.js/blob/master/build/make-docs.js
//
// It's used to rewrite some parts of the generated docs from api-generator and api-documenter.

async function main() {
    // await new Promise((resolve, reject) =>
    //     exec(
    //         "api-extractor run --local && api-documenter markdown -i dist -o docs/api",
    //         (err, stdout, stderr) => {
    //             console.log(stdout);
    //             console.error(stderr);
    //             if (err) {
    //                 reject(err);
    //             } else {
    //                 resolve();
    //             }
    //         }
    //     )
    // );

    const dir = "./api";
    const docFiles = await readdir(dir);
    for (const docFile of docFiles) {
        try {
            const { name: id, ext } = parse(docFile);
            if (ext !== ".md" && ext !== ".mdx") {
                continue;
            }

            const docPath = join(dir, docFile);
            const firstLine = await getFirstLine(docPath);
            if(!firstLine.startsWith("<!--")) {
                continue;
            }

            const input = createReadStream(docPath);
            const output = [];
            const lines = createInterface({
                input,
                crlfDelay: Infinity
            });

            let title = "";
            lines.on("line", line => {
                let skip = false;
                if (!title) {
                    const titleLine = line.match(/## (.*)/);
                    if (titleLine) {
                        title = titleLine[1];
                    }
                }
                const homeLink = line.match(/\[Home\]\(.\/index\.md\) &gt; (.*)/);
                if (homeLink) {
                    // Skip the breadcrumb for the toplevel index file.
                    if (id !== "faastjs") {
                        output.push(homeLink[1]);
                    }
                    skip = true;
                }
                if (!skip) {
                    output.push(line);
                }
            });

            await new Promise(resolve => lines.once("close", resolve));
            input.close();

            const header = [
                "---",
                `id: ${id}`,
                `title: ${title}`,
                `editLink: false # Will overwrite 'editLinks' from themeConfig`,
                // `hide_title: true`,
                "---"
            ];

            await writeFile(docPath, header.concat(output).join("\n"));
        } catch (err) {
            console.error(`Could not process ${docFile}: ${err}`);
        }
    }
}

main();
