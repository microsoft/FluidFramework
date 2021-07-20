/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const findValue = require("deepdash/findValueDeep");

const apiPath = process.argv[2];

// In the future these could be sourced by parsing the source files for the fluid-framework package to get the names of
// all the exports.
const packages = new Map([
    ["@fluidframework/container-definitions", ["AttachState"]],
    ["@fluidframework/fluid-static", ["*"]],
    // ["@fluidframework/sequence", ["SharedObjectSequence", "SharedString"]],
]);

const rollup = [];

for (const [pkg, imports] of packages) {
    const path = `${apiPath}/${pkg.split("/")[1]}.api.json`;
    try {
        const apiJson = JSON.parse(fs.readFileSync(path, "utf8"));
        if (imports.length > 1 || (imports.length === 1 && imports[0] !== "*")) {
            for (importedItem of imports) {
                // This filters the apiJson value to the first item whose name matches what we want to import
                results = findValue(apiJson,
                    (value) => {
                        return value.name === importedItem;
                    }, {
                    childrenPath: "members.0.members"
                });
                rollup.push(results);
            }
        } else {
            rollup.push(...apiJson.members[0].members);
        }
    } catch (ex) {
        console.log(ex);
    }
}

try {
    const path = `${apiPath}/fluid-framework.api.json`;
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    json.members[0].members = rollup;
    fs.writeFileSync(path, JSON.stringify(json));
} catch (ex) {
    console.log(ex);
}
