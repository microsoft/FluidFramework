/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

/**
 * Calculate the difference of two sets. Implementation is from
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set#implementing_basic_set_operations
 * @param {Set} setA
 * @param {Set} setB
 */
function difference(setA, setB) {
    const _difference = new Set(setA);
    for (const elem of setB) {
        _difference.delete(elem);
    }
    return _difference;
}

// exports.addToSet = addToSet;
const memberCombineInstructions = [
    {
        package: "@fluidframework/azure-service-utils",
        sourceImports: new Map([
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
exports.memberCombineInstructions = memberCombineInstructions;

const websitePackages = [
    "fluid-framework",
    "tinylicious",
    "@fluidframework/azure-client",
    "@fluidframework/azure-service-utils",
    // "@fluidframework/map",
    // "@fluidframework/sequence",
    "@fluidframework/test-client-utils",
    "@fluidframework/tinylicious-client",
];
exports.websitePackages = websitePackages;

/** A Set containing all the packages that are needed to do the API rollup. */
const allStagingPackages = new Set(websitePackages);
for (const { package, sourceImports } of memberCombineInstructions) {
    allStagingPackages.add(package);
    addToSet(allStagingPackages, Array.from(sourceImports.keys()));
}
// for (const [k, arr] of packageRollupMap) {
//     allStagingPackages.add(k);
//     addToSet(allStagingPackages, arr);
// }
exports.allStagingPackages = Array.from(allStagingPackages);
// const relevantPackagePaths = Array.from(relevantPackages).map(
//     (p) => path.join(originalPath, `${packageName(p)}.api.json`)
// );

const processOnlyPackages = Array.from(difference(allStagingPackages, new Set(websitePackages)));
exports.processOnlyPackages = processOnlyPackages;
console.log(processOnlyPackages);
// const processedPackages = new Set();
// for (const { package, sourceImports } of memberCombineInstructions) {
//     processedPackages.add(package);
//     addToSet(processedPackages, Array.from(sourceImports.keys()));
// }
// const unprocessedPackages = difference(new Set(websitePackages), processedPackages);
// exports.unprocessedPackages = unprocessedPackages;
