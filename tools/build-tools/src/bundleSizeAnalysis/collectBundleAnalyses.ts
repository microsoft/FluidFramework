/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
import * as fse from "fs-extra";
import * as path from "path";

// Find all bundle analysis artifacts and copy them into a central
// location to upload as build artifacts for later consumption
function main() {
    // Get all the package locations
    let lernaOutput;
    try {
        lernaOutput = JSON.parse(child_process.execSync("npx lerna list --all --json").toString());
        if (!Array.isArray(lernaOutput)) {
            throw new Error("failed to get package information");
        }
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }

    // Check each package location for a bundleAnalysis folder
    // and copy it to a central location
    const analysesDestPath = path.join(process.cwd(), "artifacts/bundleAnalysis");
    lernaOutput.forEach((pkg: {name: string, location: string}) => {
        if (pkg.location === undefined) {
            console.error("missing location in lerna package entry");
            process.exit(-1);
        }

        const packageAnalysisPath = path.join(pkg.location, "bundleAnalysis");
        if (fse.existsSync(packageAnalysisPath)) {
            try {
                console.log(`found bundleAnalysis for ${pkg.name}`);
                fse.copySync(packageAnalysisPath, path.join(analysesDestPath, pkg.name), {recursive: true});
            } catch (e) {
                console.error(e);
                process.exit(-1);
            }
        }
    });
}

main();
