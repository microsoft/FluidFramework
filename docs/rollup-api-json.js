/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Our public API is exposed by re-exporting things from 'internal' packages in 'external' packages, like
 * fluid-framework. API Extractor does not extract re-exported APIs, so this script manipulates the API Extractor JSON
 * output to merge and re-write the API JSON as a workaround.
 *
 * This script changes source files in place; you may want to create a copy of the source files prior to running this
 * script on them. If you're using the tasks defined in package.json, then you don't need to do this; those scripts
 * create copies.
 */

// const fs = require("fs");
const path = require("path");
const copyfiles = require("copyfiles");
const findValue = require("deepdash/findValueDeep");
const fs = require("fs-extra");
const data = require("./data");

const originalPath = process.argv[2];
const targetPath = process.argv.length > 3 ? process.argv[3] : originalPath;
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
    console.log(`Loading ${sourceFile}`);
    const sourceApiObj = JSON.parse(fs.readFileSync(sourceFile, { encoding: "utf8" }));
    // console.log(jsonStr.includes("@fluidframework/container-definitions"));

    // ...then extract the imported members and return them.
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
const replaceAll = (input, searchValue, replaceValue) => input.replace(new RegExp(searchValue, 'g'), replaceValue);

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
        console.log(`Loading ${inputPackagePath}`);
        jsonStr = fs.readFileSync(inputPackagePath, { encoding: "utf8" });
        const rewrittenApiObj = JSON.parse(jsonStr);
        // console.log(jsonStr.includes("@fluidframework/container-definitions"));

        console.log(`EXTRACTED: ${extractedMembers.length} members`);
        console.log(`BEFORE: ${package} has ${rewrittenApiObj.members[0].members.length} members`);

        // Append the members extracted earlier.
        const combinedMembers = rewrittenApiObj.members[0].members.concat(extractedMembers);
        rewrittenApiObj.members[0].members = combinedMembers;
        console.log(`AFTER: ${package} has ${rewrittenApiObj.members[0].members.length} members`);

        // Convert API object back to a string to more replace the package names using string replace.
        jsonStr = JSON.stringify(rewrittenApiObj);

        for (const [sourcePackage, _] of sourceImports) {
            jsonStr = replaceAll(jsonStr, sourcePackage, package);
        }

        fs.writeFileSync(outputPackagePath, jsonStr);
    }
};

/**
 * @param {string} package the name of a package that rolls up exported APIs from another package.
 * @param {string} sources an array of package names whose contents should be rolled up into `package`.
 */
const rollupPackage = (package, sources, workingPath) => {
    const rollup = [];
    for (const sourcePackage of sources) {
        try {
            const filePath = path.join(workingPath, `${packageName(sourcePackage)}.api.json`);
            console.log(`Rolling up ${sourcePackage} into ${package}`);
            const apiJson = JSON.parse(fs.readFileSync(filePath, { encoding: "utf8" }));
            rollup.push(...apiJson.members[0].members);
        } catch (ex) {
            console.log(ex);
        }
    }

    try {
        const filePath = path.join(workingPath, `${packageName(package)}.api.json`);
        const jsonStr = fs.readFileSync(filePath, { encoding: "utf8" });
        const json = JSON.parse(jsonStr);
        console.log(`BEFORE: ${package} has ${json.members[0].members.length} members`);
        json.members[0].members = rollup;
        console.log(`AFTER: ${package} has ${json.members[0].members.length} members`);
        const updated = JSON.stringify(json);

        // rewire every re-exported package
        let results = updated;
        for (const from of sources) {
            results = replaceAll(results, from, package);
        }
        fs.writeFileSync(filePath, results);
        console.log(`Wrote ${filePath}`);
    } catch (ex) {
        console.log(ex);
    }
};

const start = () => {
    // Clear output folders.
    fs.emptyDirSync(stagingPath);
    fs.emptyDirSync(outputPath);

    // Copy all the files to staging that need to be present for member processing.
    const stagedPackagePaths = data.allStagingPackages.map(
        (p) => path.join(originalPath, `${packageName(p)}.api.json`)
    );
    copyfiles(
        [...stagedPackagePaths, stagingPath],
        { verbose: true, up: true },
        (err) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
        });

    // Combine members.
    combineMembers(originalPath, stagingPath, data.memberCombineInstructions);

    // Rollup packages.
    for (const [package, sourcePackages] of data.packageRollupMap) {
        rollupPackage(package, sourcePackages, stagingPath);
    }

    // Copy all processed files that should be published on the site to the output dir.
    const websitePackageSourcePaths = data.websitePackages.map(
        (p) => path.join(stagingPath, `${packageName(p)}.api.json`)
    );
    copyfiles(
        [...websitePackageSourcePaths, outputPath],
        { verbose: false, up: true },
        (err) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
        });
};

start();
