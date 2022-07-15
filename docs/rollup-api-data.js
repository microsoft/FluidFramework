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

/**
 * An array of objects describing how members should be combined.
 *
 * This can be considered a workaround simulating API-Extractor's
 * {@link https://api-extractor.com/pages/configs/api-extractor_json/#bundledpackages | bundledPackages} feature,
 * which currently has at least one issue preventing us from using it.
 *
 * See this issue for more details: {@link https://github.com/microsoft/rushstack/issues/3521}.
 *
 * Once that issue is resolved, we probably want to just leverage package bundling, instead of directly
 * editing the API reports.
 *
 */
const memberCombineInstructions = [
    {
        package: "@fluidframework/azure-client",
        sourceImports: new Map([
            ["@fluidframework/routerlicious-driver", ["ITokenProvider", "ITokenResponse"]],
            ["@fluidframework/protocol-definitions", ["ScopeType", "ITokenClaims", "IUser"]],
        ])
    },{
        package: "@fluidframework/azure-service-utils",
        sourceImports: new Map([
            ["@fluidframework/protocol-definitions", ["IUser", "ScopeType"]],
        ])
    },
    {
        package: "@fluidframework/container-definitions",
        cleanOrigMembers: true,
        sourceImports: new Map([
            ["@fluidframework/container-definitions", ["AttachState"]],
        ])
    },
    {
        package: "@fluidframework/test-client-utils",
        sourceImports: new Map([
            ["@fluidframework/test-runtime-utils", ["InsecureTokenProvider"]],
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

exports.memberCombineInstructions = memberCombineInstructions;
exports.stringReplacements = stringReplacements;
