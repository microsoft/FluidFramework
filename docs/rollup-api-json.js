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
    console.log(`Extracting members from ${path.basename(sourceFile)}`);
    const sourceApiObj = JSON.parse(fs.readFileSync(sourceFile, { encoding: "utf8" }));

    // ... then check if all members should be extracted, and if so, return them all...
    if (members.length === 1 && members[0] === "*") {
        // console.log("\tExtracting *");
        const extractedMembers = sourceApiObj.members[0].members;
        console.log(`\tExtracted ${extractedMembers.length} members (*)`);
        return extractedMembers;
    }

    // ...otherwise extract the requested members and return them.
    const extractedMembers = extractMembersFromApiObject(sourceApiObj, members);
    console.log(`\tExtracted ${extractedMembers.length} members`);
    return extractedMembers;
};

/**
 * Rewrites an API JSON file by combining members from other API JSON files and rewriting the references in the JSON to
 * point to the "imported" members.
 *
 * @param {string} sourcePath Path to source API JSON files.
 * @param {string} targetPath Path where the combined API JSON files will be output.
 * @param {object} instructions Array of 'member combine data' objects.
 */
const combineMembers = (sourcePath, targetPath, instructions) => {
    // Iterate through the "instructions."
    for (const { package, sourceImports, cleanOrigMembers } of instructions) {
        /** The path to the API JSON file. */
        const inputPackagePath = path.join(sourcePath, `${packageName(package)}.api.json`);

        /** The path where the rewritten file will be output. */
        const outputPackagePath = path.join(targetPath, `${packageName(package)}.api.json`)

        // Iterate through each package that serves as an import source.
        let extractedMembers = [];
        for (const [sourcePackage, members] of sourceImports) {
            // Extract the members from the source API JSON file and save them for later.
            const sourceFile = path.join(sourcePath, `${packageName(sourcePackage)}.api.json`);
            extractedMembers = extractedMembers.concat(extractMembers(sourceFile, members));
        }

        // Load the input API JSON file (the one that will be rewritten).
        console.log(`Parsing ${inputPackagePath}`);
        let jsonStr = fs.readFileSync(inputPackagePath, { encoding: "utf8" });
        const rewrittenApiObj = JSON.parse(jsonStr);

        // Optionally, delete original package members.
        if (cleanOrigMembers) {
            rewrittenApiObj.members[0].members = [];
        }
        console.log(`\t${rewrittenApiObj.members[0].members.length} members, adding ${extractedMembers.length}`);

        // Append the members extracted earlier.
        const combinedMembers = rewrittenApiObj.members[0].members.concat(extractedMembers);
        console.log(`\t= ${combinedMembers.length} total members`);
        rewrittenApiObj.members[0].members = combinedMembers;

        jsonStr = JSON.stringify(rewrittenApiObj, null, 2);
        console.log(`Writing output file ${outputPackagePath}\n`);
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
    combineMembers(stagingPath, stagingPath, data.memberCombineInstructions);

    // Rewrite any remaining references in the output files using replace-in-files
    const from = [];
    const to = [];

    for (const [searchString, replacement] of data.stringReplacements) {
        from.push(new RegExp(searchString, "g"));
        to.push(replacement);
    }

    try {
        const options = {
            files: `${path.resolve(stagingPath)}/**`,
            from: from,
            to: to,
        };

        const results = await replace(options);
    }
    catch (error) {
        console.error("Error occurred:", error);
    }

    // Copy all processed files that should be published on the site to the output dir.
    console.log(`Copying final files from ${stagingPath} to ${outputPath}`)
    await cpy(websitePackageFiles, outputPath, { cwd: stagingPath })
        .on("progress", (progress) => {
            if (progress.percent === 1) {
                console.log(`\tCopied ${progress.totalFiles} files.`);
            }
        });
};

main();
