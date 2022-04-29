/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ADOSizeComparator,
    BundleComparisonResult,
    bundlesContainNoChanges,
    getAzureDevopsApi,
} from "@fluidframework/bundle-size-tools";

// Handle weirdness with Danger import.  The current module setup prevents us
// from using this file directly, and the js transpilation renames the danger
// import which prevents danger from removing it before evaluation (because it
// actually puts its exports in the global namespace at that time)
declare function markdown(message: string, file?: string, line?: number): void;

const adoConstants = {
    orgUrl: 'https://dev.azure.com/fluidframework',
    projectName: 'public',
    ciBuildDefinitionId: 48,
    bundleAnalysisArtifactName: 'bundleAnalysis',
};

const localReportPath = "./artifacts/bundleAnalysis";

(async function () {
    if (process.env["ADO_API_TOKEN"] == undefined) {
        throw new Error("no env ado api token provided");
    }
    if (process.env["DANGER_GITHUB_API_TOKEN"] == undefined) {
        throw new Error("no env github api token provided");
    }

    const adoConnection = getAzureDevopsApi(process.env["ADO_API_TOKEN"], adoConstants.orgUrl);
    const sizeComparator = new ADOSizeComparator(
        adoConstants,
        adoConnection,
        localReportPath,
        undefined,
        ADOSizeComparator.naiveFallbackCommitGenerator,
    );
    const result: BundleComparisonResult = await sizeComparator.createSizeComparisonMessage(false);

    // Post a message only if there was an error (result.comparison is undefined) or if
    // there were actual changes to the bundle sizes.  In other cases, we don't post a
    // message and danger will delete its previous message
    if (result.comparison === undefined || !bundlesContainNoChanges(result.comparison)){
        markdown(result.message);
    } else {
        console.log("No size changes detected, skipping posting PR comment");
    }
})();