"use strict";
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bundle_size_tools_1 = require("@fluidframework/bundle-size-tools");
const adoConstants = {
    orgUrl: 'https://dev.azure.com/fluidframework',
    projectName: 'public',
    ciBuildDefinitionId: 48,
    prBuildDefinitionId: undefined,
    bundleAnalysisArtifactName: 'bundleAnalysis',
    projectRepoGuid: undefined,
    buildsToSearch: undefined,
};
const localReportPath = "./artifacts/bundleAnalysis";
(async function () {
    if (process.env["ADO_API_TOKEN"] == undefined) {
        throw new Error("no env ado api token provided");
    }
    if (process.env["DANGER_GITHUB_API_TOKEN"] == undefined) {
        throw new Error("no env github api token provided");
    }
    const adoConnection = bundle_size_tools_1.getAzureDevopsApi(process.env["ADO_API_TOKEN"], adoConstants.orgUrl);
    const sizeComparator = new bundle_size_tools_1.ADOSizeComparator(adoConstants, adoConnection, localReportPath, undefined, bundle_size_tools_1.ADOSizeComparator.naiveFallbackCommitGenerator);
    const message = await sizeComparator.createSizeComparisonMessage(false);
    markdown(message);
})();
//# sourceMappingURL=dangerfile.js.map