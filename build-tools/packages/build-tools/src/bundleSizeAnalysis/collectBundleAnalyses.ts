/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
import * as fse from "fs-extra";
import * as path from "path";

// The smallest asset size that we deems to be correct. Adjust if we are testing for assets that are smaller.
const smallestAssetSize = 100;

// Find all bundle analysis artifacts and copy them into a central
// location to upload as build artifacts for later consumption
function main() {
    // Get all the package locations
    const lernaOutput = JSON.parse(child_process.execSync("npx lerna list --all --json").toString());
    if (!Array.isArray(lernaOutput)) {
        throw new Error("failed to get package information");
    }

    // Check each package location for a bundleAnalysis folder
    // and copy it to a central location
    let hasSmallAssetError = false;
    const analysesDestPath = path.join(process.cwd(), "artifacts/bundleAnalysis");
    lernaOutput.forEach((pkg: { name: string, location: string }) => {
        if (pkg.location === undefined) {
            console.error("missing location in lerna package entry");
            process.exit(-1);
        }

        const packageAnalysisPath = path.join(pkg.location, "bundleAnalysis");
        if (fse.existsSync(packageAnalysisPath)) {
            console.log(`found bundleAnalysis for ${pkg.name}`);

            // Check if we successfully generated any assets
            const reportPath = path.join(packageAnalysisPath, "report.json");
            if (!fse.existsSync(reportPath)) {
                throw new Error(`${reportPath} is missing, cannot verify bundel analysis correctness`);
            }

            const report = fse.readJSONSync(reportPath);
            if (!report.assets?.length) {
                throw new Error(`${reportPath} doesn't have any assets info`);
            }
            for (const asset of report.assets) {
                if (!asset.chunkNames?.length) {
                    // Assets without chunkNAmes are not code files
                    continue;
                }
                if (asset.size < smallestAssetSize) {
                    console.warn(`${pkg.name}: asset ${asset.name} (${asset.size}) is too small`);
                    hasSmallAssetError = true;
                }
            }
            fse.copySync(packageAnalysisPath, path.join(analysesDestPath, pkg.name), { recursive: true });
        }
    });

    if (hasSmallAssetError) {
        throw new Error(`Found assets are too small (<${smallestAssetSize} bytes). Webpack bundle analysis is probably not correct.`);
    }
}

try {
    main();
} catch (e) {
    console.error(e);
    process.exit(-1);
}
