/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
// const pathLib = require("path");
// const process = require("process");

// const parseOptions = (argv) => {
// };

// const options = parseOptions(process.argv)
const apiPath = process.argv[2];

const packages = [
    "@fluidframework/aqueduct",
    "@fluidframework/cell",
    "@fluidframework/common-definitions",
    "@fluidframework/container-definitions",
    "@fluidframework/core-interfaces",
    "@fluidframework/counter",
    // "@fluidframework/driver-definitions",
    "@fluidframework/ink",
    "@fluidframework/map",
    "@fluidframework/matrix",
    "@fluidframework/ordered-collection",
    "@fluidframework/protocol-base",
    "@fluidframework/protocol-definitions",
    "@fluidframework/register-collection",
    "@fluidframework/sequence",
];

const rollup = [];

for (const pkg of packages) {
    const path = `${apiPath}/${pkg.split("/")[1]}.api.json`;
    try {
        const apiJson = JSON.parse(fs.readFileSync(path, "utf8"));
        rollup.push(...apiJson.members[0].members);
    } catch (ex) {
        console.log(ex);
    }
}

try {
    const path = `${apiPath}/fluid-framework.api.json`;
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    json.members[0].members = rollup;
    console.log(JSON.stringify(rollup.length));
    fs.writeFileSync(path, JSON.stringify(json));
} catch (ex) {
    console.log(ex);
}
