/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const findValue = require("deepdash/findValueDeep");
const mapValue = require("deepdash/mapValuesDeep");

const apiPath = process.argv[2];

// In the future these could be sourced by parsing the source files for the fluid-framework package to get the names of
// all the exports.
// const packages = new Map([
//     ["@fluidframework/container-definitions", ["AttachState"]],
//     ["@fluidframework/fluid-static", ["*"]],
// ]);

const packages = [
    {
        package: "@fluidframework/fluid-static",
        sourcePackage: "@fluidframework/container-definitions",
        imports: ["AttachState"],
        finalPackage: "@fluidframework/fluid-static",
    },
    // {
    //     package: "fluid-framework",
    //     sourcePackage: "@fluidframework/fluid-static",
    //     imports: ["*"],
    //     finalPackage: "fluid-framework"
    // },
    {
        package: "@fluidframework/fluid-static",
        sourcePackage: "@fluidframework/fluid-static",
        imports: ["*"],
        finalPackage: "fluid-framework",
    },
];

const rewireMap = new Map([

])

const rewirePackage = (input, srcPkg, targetPackage) => input.replace(srcPkg, targetPackage);


const rollup = [];

for (const { package, sourcePackage, imports, finalPackage } of packages) {
    const pkgName = package.includes("/") ? package.split("/")[1] : package;
    const path = `${apiPath}/${pkgName}.api.json`;
    try {
        console.log(`Loading ${path}`);
        const apiJson = JSON.parse(fs.readFileSync(path, "utf8"));

        if (finalPackage === "fluid-framework") {
            rollup.push(...apiJson.members[0].members);
        } else if (imports.length > 1 || (imports.length === 1 && imports[0] !== "*")) {
            results = mapValue(apiJson, (value, key, parentValue, context) => {
                // console.log(key);
                if (key === "canonicalReference" && value.includes(sourcePackage)) {
                    const newValue = rewirePackage(
                        value,
                        sourcePackage,
                        finalPackage,
                    );
                    console.log(`${pkgName}: rewiring ${sourcePackage}: ${newValue}`);
                }
                return value;
            });
            const s = JSON.stringify(results, null, 0);
            let rew = rewirePackage(s, sourcePackage, finalPackage);
            fs.writeFileSync(path, rew);
            // console.log(JSON.stringify(rew, null, space=2));
        }
    } catch (ex) {
        console.log(ex);
    }
}

try {
    const path = `${apiPath}/fluid-framework.api.json`;
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    json.members[0].members = rollup;

    // results = mapValue(json, (value, key) => {
    //     if (key === "canonicalReference") {
    //         return rewirePackage(value, "@fluidframework/container-definitions", "@fluidframework/fluid-static");
    //     }
    //     return value;
    // });

    // console.log(results);

    fs.writeFileSync(path, JSON.stringify(json));
} catch (ex) {
    console.log(ex);
}
