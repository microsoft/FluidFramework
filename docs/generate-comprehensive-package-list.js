/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates `data/allPackages.yml` for Hugo to create the comprehensive API page for the website.
 */

const colors = require("colors");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const dataDirectoryPath = path.resolve(__dirname, "data");
const comprehensiveListFilePath = path.resolve(dataDirectoryPath, 'allPackages.yml');
const apiExtractorDirectory = path.resolve(__dirname, "..", "_api-extractor-temp", "doc-models");

const main = async () => {
    // Clear output folders.
    await fs.remove(comprehensiveListFilePath);

    // Walk API reports to build up the list of packages
    const packageList = [];
    const files = await fs.readdir(apiExtractorDirectory);
    for (const fileName of files) {
        const filePath = path.resolve(apiExtractorDirectory, fileName);
        const fileContents = await fs.readFile(filePath);
        const json = JSON.parse(fileContents);
        const packageName = json.name;

        if(!packageName) {
            throw new Error(`Package name could not be found in API report file "${filePath}".`);
        }
        packageList.push(packageName);
    }

    if (packageList.length === 0) {
        throw new Error(`No API report files found under "${apiExtractorDirectory}".`);
    }

    const packageListContents = packageList.map(packageName => `- "${packageName}"`).join(os.EOL);
    const fileContents = `packages:${os.EOL}${packageListContents}`;
    await fs.writeFile(comprehensiveListFilePath, fileContents);
};

main().then(
    () => {
        console.log(colors.green(`SUCCESS: Comprehensive package list generated at "${comprehensiveListFilePath}"!`));
        process.exit(0);
    },
    (error) => {
        console.error("FAILURE: Comprehensive package list could not be generated due to an error.", error);
        process.exit(1);
    }
);
