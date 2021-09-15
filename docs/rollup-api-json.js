/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
// const findValue = require("deepdash/findValueDeep");
// const mapValue = require("deepdash/mapValuesDeep");

const apiPath = process.argv[2];

/** Given a package name, returns its name and path as a tuple. */
const parsePackage = (pkg) => {
    const name = pkg.includes("/") ? pkg.split("/")[1] : pkg;
    const path = `${apiPath}/${name}.api.json`;
    return [name, path];
};

const rewirePackage = (input, srcPkg, targetPackage) => input.replace(srcPkg, targetPackage);

const rewriteImports = async (rewriteMap) => {
    for (const { package, sourcePackage } of rewriteMap) {
        const [_, path] = parsePackage(package);

        try {
            console.log(`Loading ${path}`);
            const jsonStr = fs.readFileSync(path, "utf8");
            const updated = rewirePackage(jsonStr, sourcePackage, package);
            fs.writeFileSync(path, updated);
        } catch (ex) {
            console.log(ex);
        }
    }
};

const rollupPackage = async (packageMap) => {
    for (const { package, sourcePackages } of packageMap) {
        const rollup = [];
        for (const sourcePackage of sourcePackages) {
            const [_, sourcePath] = parsePackage(sourcePackage);
            try {
                const apiJson = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
                rollup.push(...apiJson.members[0].members);
            } catch (ex) {
                console.log(ex);
            }
        }

        const [pkgName, pkgPath] = parsePackage(package);
        try {
            const json = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            json.members[0].members = rollup;
            const jsonStr = JSON.stringify(json);
            const results = rewirePackage(jsonStr, package, pkgPath);
            fs.writeFileSync(pkgPath, results);
        } catch (ex) {
            console.log(ex);
        }
    }
};

/**
 * This is a list of packages that import and re-export some APIs from other packages. The canonical references will be
 * rewritten based on the information here.
 */
const importRewrites = [
    {
        // Package with the imports that will be rewritten
        package: "@fluidframework/fluid-static",

        // Package that is the source of the imports
        sourcePackage: "@fluidframework/container-definitions",

        // // List of import names
        // imports: ["AttachState"],
    },
];

const packages = [
    {
        package: "fluid-framework",
        sourcePackages: ["@fluidframework/fluid-static"],
    },
];

const start = async () => {
    // Rewrite the files with updated imports
    rewriteImports(importRewrites);
    rollupPackage(packages);
}

start();
