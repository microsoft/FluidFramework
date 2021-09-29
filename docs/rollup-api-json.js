/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Our public API is exposed by re-exporting things from 'internal' packages in 'external' packages, like
 * fluid-framework. API Extractor does not extract re-exported APIs, so this script manipulates the API Extractor JSON
 * output to merge and re-write the API JSON as a workaround.
 *
 * To update the packages combined and how they are combined, edit the rollup-api-data.js file.
 *
 * This script changes source files in place; you may want to create a copy of the source files prior to running this
 * script on them. If you're using the tasks defined in package.json, then you don't need to do this; those scripts
 * create copies.
 */

const cpy = require("cpy");
const findValue = require("deepdash/findValueDeep");
const fs = require("fs-extra");
const path = require("path");
const replace = require("replace-in-file");

const data = require("./rollup-api-data");

const originalPath = path.resolve(process.argv[2]);
const targetPath = path.resolve(process.argv.length > 3 ? process.argv[3] : originalPath);
const stagingPath = path.join(targetPath, "_staging");
const outputPath = path.join(targetPath, "_build");

/**
 * Given a package name, returns the unscoped name. If the package is unscoped the string is returned as-is.
 * @param {string} package
 */
const packageName = (package) => package.includes("/") ? package.split("/")[1] : package;

/**
 * Extracts members (named exports) from an API JSON object.
 *
 * @param {object} sourceApiObj the API JSON as an object.
 * @param {string[]} members array of members to extract.
 */
const extractMembersFromApiObject = (sourceApiObj, members) =>
    members.map(
        (importName) => {
            // This filters the apiJson value to the first item whose name matches the import name
            return findValue(sourceApiObj,
                (value) => value.name === importName,
                { childrenPath: "members.0.members" }
            );
        });

/**
 * Extracts members (named exports) from an API JSON file.
 *
 * @param {string} sourceFile path to the source API JSON file to extract members from.
 * @param {string[]} members array of members to extract.
 */
const extractMembers = (sourceFile, members) => {
    // First load the source API file...
    console.log(`Reading ${sourceFile}`);
    const sourceApiObj = JSON.parse(fs.readFileSync(sourceFile, { encoding: "utf8" }));

    // ... then check if all members should be extracted, and if so, return them all...
    if (members.length === 1 && members[0] === "*") {
        return sourceApiObj.members[0].members;
    }

    // ...otherwise extract the requested members and return them.
    return extractMembersFromApiObject(sourceApiObj, members);
};

/**
 * Replaces all instances of a string with a replacement string.
 *
 * Implemented because Node <= 15 doesn't support string.replaceAll.
 *
 * @param {string} input The string to search.
 * @param {string} searchValue The string to replace.
 * @param {string} replaceValue The replacement string.
 * @returns {string} The updated string.
 */
const replaceAll = (input, searchValue, replaceValue) => input.replace(new RegExp(searchValue, "g"), replaceValue);

/**
 * Rewrites an API JSON file by combining members from other API JSON files and rewriting the references in the JSON to
 * point to the "imported" members.
 *
 * @param {string} sourcePath Path to source API JSON files.
 * @param {string} targetPath Path where the combined API JSON files will be output.
 * @param {object} instructions Array of 'member combine data' objects.
 */
const combineMembers = (sourcePath, targetPath, instructions) => {
    let jsonStr;
    let extractedMembers = [];

    // Iterate through the "instructions."
    for (const { package, sourceImports } of instructions) {
        /** The path to the API JSON file. */
        const inputPackagePath = path.join(sourcePath, `${packageName(package)}.api.json`);

        /** The path where the rewritten file will be output. */
        const outputPackagePath = path.join(targetPath, `${packageName(package)}.api.json`)

        // Iterate through each package that serves as an import source.
        for (const [sourcePackage, members] of sourceImports) {
            // Extract the members from the source API JSON file and save them for later.
            const sourceFile = path.join(sourcePath, `${packageName(sourcePackage)}.api.json`);
            extractedMembers = extractedMembers.concat(extractMembers(sourceFile, members));
        }

        // Load the input API JSON file (the one that will be rewritten).
        console.log(`Reading ${inputPackagePath}`);
        jsonStr = fs.readFileSync(inputPackagePath, { encoding: "utf8" });
        const rewrittenApiObj = JSON.parse(jsonStr);

        // Append the members extracted earlier.
        const combinedMembers = rewrittenApiObj.members[0].members.concat(extractedMembers);
        rewrittenApiObj.members[0].members = combinedMembers;

        // Convert API object back to a string to more replace the package names using string replace.
        jsonStr = JSON.stringify(rewrittenApiObj);

        for (const [sourcePackage, _] of sourceImports) {
            jsonStr = replaceAll(jsonStr, sourcePackage, package);
        }

        console.log(`Writing ${outputPackagePath}`);
        fs.writeFileSync(outputPackagePath, jsonStr);
    }
};

const main = async () => {
    // Clear output folders.
    fs.emptyDirSync(stagingPath);
    fs.emptyDirSync(outputPath);

    const websitePackageFiles = data.websitePackages.map(
        (p) => `${packageName(p)}.api.json`
    );

    // Copy all the files to staging that need to be present for member processing.
    const stagedPackageFiles = data.allStagingPackages.map(
        (p) => `${packageName(p)}.api.json`
    );
    await cpy(stagedPackageFiles, stagingPath, { cwd: originalPath });

    // Combine members.
    combineMembers(originalPath, stagingPath, data.memberCombineInstructions);

    // Copy all processed files that should be published on the site to the output dir.
    console.log(`Copying final files from ${stagingPath} to ${outputPath}`)
    await cpy(websitePackageFiles, outputPath, { cwd: stagingPath })
        .on("progress", (progress) => {
            if (progress.completedFiles > 0) {
                console.log(`\tCopied ${websitePackageFiles[progress.completedFiles]}`);
            }
        });

    // Rewrite imports
    const from = [];
    const to = [];

    for (const [searchString, replacement] of data.stringReplacements) {
        from.push(new RegExp(searchString, "g"));
        to.push(replacement);
    }

    // const files = fs.readdirSync(stagingPath).map(p => path.resolve(p));
    const files = `${path.resolve(outputPath)}/**`;
    console.log(files);

    try {
        const options = {
            files: files,
            from: from,
            to: to,
            // disableGlobs: true,
        };

        const results = await replace(options);
        console.log("Replacement results:", results);
    }
    catch (error) {
        console.error("Error occurred:", error);
    }
};

main();
