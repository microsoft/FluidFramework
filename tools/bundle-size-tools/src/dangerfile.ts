/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { danger, fail, markdown, message, peril, schedule, warn } from "danger";
import { getAzureDevopsApi } from "./ADO/getAzureDevopsApi";
import { ADOSizeComparator } from "./ADO/AdoSizeComparator";

const adoConstants = {
    orgUrl: 'https://dev.azure.com/fluidframework',
    projectName: 'internal',
    ciBuildDefinitionId: 12,
    prBuildDefinitionId: undefined,
    bundleAnalysisArtifactName: 'bundleAnalysis',
    projectRepoGuid: undefined,
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
    const sizeComparator = new ADOSizeComparator(adoConstants, adoConnection, localReportPath, undefined);
    const message = await sizeComparator.createSizeComparisonMessage(false);
    markdown(message);
})();