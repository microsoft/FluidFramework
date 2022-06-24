/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Our public API is exposed by re-exporting things from 'internal' packages in 'external' packages, like
 * fluid-framework. API Extractor does not extract re-exported APIs, so we need to merge and rewrite the API JSON. This
 * file contains the input data to the re-writing process. The processing script itself is in the rollup-api-json.js
 * file.
 */

/** An array of all packages whose TSDocs should be published to website. */
const websitePackages = [
    "fluid-framework",
    "tinylicious",
    "@fluidframework/azure-client",
    "@fluidframework/azure-service-utils",
    "@fluidframework/container-definitions",
    "@fluidframework/map",
    "@fluidframework/sequence",
    "@fluidframework/fluid-static",
    "@fluidframework/test-client-utils",
    "@fluidframework/tinylicious-client",
    "@fluidframework/tinylicious-driver",
];

/** An array of objects describing how members should be combined. */
const memberCombineInstructions = [
    {
        package: "@fluidframework/test-client-utils",
        sourceImports: new Map([
            ["@fluidframework/test-runtime-utils", ["InsecureTokenProvider"]],
        ])
    },
    {
        package: "@fluidframework/azure-client",
        sourceImports: new Map([
            ["@fluidframework/routerlicious-driver", ["ITokenProvider", "ITokenResponse"]],
            ["@fluidframework/protocol-definitions", ["ScopeType", "ITokenClaims", "IUser"]],
        ])
    },
    {
        package: "@fluidframework/fluid-static",
        sourceImports: new Map([
            ["@fluidframework/container-definitions", ["IAudience"]],
        ])
    },
    {
        package: "@fluidframework/container-definitions",
        cleanOrigMembers: true,
        sourceImports: new Map([
            ["@fluidframework/container-definitions", ["AttachState"]],
        ])
    },
];

/**
 * An array of tuples containing a member reference to search for and a replacement member reference string.
 */
const stringReplacements = memberCombineInstructions.flatMap((instruction) => {
    const returnValue = [];
    const { package, sourceImports } = instruction;
    for (const [sourcePackage, imports] of sourceImports) {
        for (const importName of imports) {
            if (importName !== "*") {
                const searchString = `${sourcePackage}!${importName}`;
                const replacementString = `${package}!${importName}`;
                returnValue.push([searchString, replacementString]);
            } else {
                const searchString = `${sourcePackage}!`;
                const replacementString = `${package}!`;
                returnValue.push([searchString, replacementString]);
            }
        }
    }
    return returnValue;
});

/**
 * Adds an array of strings to a set individually.
 *
 * @param {Set<string>} set
 * @param {string[]} add
 */
const addToSet = (set, add) => {
    for (item of add) {
        set.add(item);
    }
}

/** A Set containing all the packages that are needed to do the API rollup. */
const allStagingPackages = new Set(websitePackages);
for (const { package, sourceImports } of memberCombineInstructions) {
    allStagingPackages.add(package);
    addToSet(allStagingPackages, Array.from(sourceImports.keys()));
}

exports.allStagingPackages = Array.from(allStagingPackages);
exports.memberCombineInstructions = memberCombineInstructions;
exports.stringReplacements = stringReplacements;
exports.websitePackages = websitePackages;
