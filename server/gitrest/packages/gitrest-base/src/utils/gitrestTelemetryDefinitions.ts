/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// List of event names that should identify Lumber events throughout GitRest.
// Values in the enum must be strings.
export enum GitRestLumberEventName {
    // Summaries
    PersistLatestFullSummaryInStorage = "PersistLatestFullSummaryInStorage",
    RetrieveLatestFullSummaryFromStorage = "RetrieveLatestFullSummaryFromStorage",
    WholeSummaryManagerReadSummary = "ReadSummary",
    WholeSummaryManagerWriteSummary = "WriteSummary",

    // RepoManager
    CreateBlob = "CreateBlob",
    CreateCommit = "CreateCommit",
    CreateRef = "CreateRef",
    CreateTag = "CreateTag",
    CreateTree = "CreateTree",
    DeleteRef = "DeleteRef",
    GetBlob = "GetBlob",
    GetCommit = "GetCommit",
    GetCommits = "GetCommits",
    GetContent = "GetContent",
    GetRef = "GetRef",
    GetRefs = "GetRefs",
    GetTag = "GetTag",
    GetTree = "GetTree",
    PatchRef = "PatchRef",

    // RepoManagerFactory
    OpenRepo = "OpenRepo",
    CreateRepo = "CreateRepo",

    // Misc
    CheckSoftDeleted = "CheckSoftDeleted",
}

// List of properties used in telemetry throughout GitRest
export enum BaseGitRestTelemetryProperties {
    directoryPath = "directoryPath",
    emptyFullSummary = "emptyFullSummary",
    fullSummaryirectoryExists = "fullSummaryirectoryExists",
    ref = "ref",
    repoName = "repoName",
    repoOwner = "repoOwner",
    repoPerDocEnabled = "repoPerDocEnabled",
    sha = "sha",
    softDelete = "softDelete",
    storageName = "storageName",
    summaryType = "summaryType",
    tag = "tag",
}
