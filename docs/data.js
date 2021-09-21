/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** An array of all packages whose TSDocs should be published to website. */
const websitePackages = [
    "fluid-framework",
    "tinylicious",
    "@fluidframework/azure-client",
    "@fluidframework/azure-service-utils",
    "@fluidframework/test-client-utils",
    "@fluidframework/tinylicious-client",
];

/** An array of objects describing how members should be combined. */
const memberCombineInstructions = [
    {
        package: "@fluidframework/azure-service-utils",
        sourceImports: new Map([
            // TODO: #7530
            // ["@fluidframework/server-services-client", ["GenerateToken"]],
            ["@fluidframework/protocol-definitions", ["ScopeType"]],
        ])
    },
    {
        package: "@fluidframework/fluid-static",
        sourceImports: new Map([
            ["@fluidframework/container-definitions", ["IAudience"]],
        ])
    },
    {
        package: "fluid-framework",
        sourceImports: new Map([
            ["@fluidframework/container-definitions", ["AttachState"]],
            ["@fluidframework/fluid-static", ["*"]],
            ["@fluidframework/map", ["*"]],
            ["@fluidframework/sequence", ["*"]],
        ])
    },
];
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
exports.websitePackages = websitePackages;
