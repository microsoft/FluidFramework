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

// exports.addToSet = addToSet;
const memberCombineInstructions = [
    {
        package: "@fluidframework/fluid-static",
        sourceImports: new Map([
            ["@fluidframework/container-definitions", ["AttachState", "IAudience"]]
        ]),
        finalPackage: "@fluidframework/fluid-static",
    },
    // {
    //     package: "@fluidframework/fluid-static",
    //     finalPackage: "fluid-framework",
    // },
];
exports.memberCombineInstructions = memberCombineInstructions;

const packageRollupMap = new Map([
    // fluid-framework re-exports all of fluid-static
    ["fluid-framework", ["@fluidframework/fluid-static"]],
]);
exports.packageRollupMap = packageRollupMap;

const websitePackages = [
    "fluid-framework",
    // "tinylicious",
    // "@fluidframework/azure-client",
    // "@fluidframework/azure-service-utils",
    // "@fluidframework/map",
    // "@fluidframework/sequence",
    // "@fluidframework/test-client-utils",
    // "@fluidframework/tinylicious-client",
];
exports.websitePackages = websitePackages;

const relevantPackages = new Set(websitePackages);
for (const {package, sourceImports } of memberCombineInstructions) {
    relevantPackages.add(package);
    addToSet(relevantPackages, Array.from(sourceImports.keys()));
}
for (const [k, arr] of packageRollupMap) {
    relevantPackages.add(k);
    addToSet(relevantPackages, arr);
}
// const relevantPackagePaths = Array.from(relevantPackages).map(
//     (p) => path.join(originalPath, `${packageName(p)}.api.json`)
// );
exports.relevantPackages = relevantPackages;
