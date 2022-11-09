/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { WebApi } from "azure-devops-node-api";

/**
 * Fetches the last commit hash for a PR.
 */
export async function getLastCommitHashFromPR(
    adoConnection: WebApi,
    prId: number,
    repoGuid: string,
) {
    const gitApi = await adoConnection.getGitApi();
    const prCommits = await gitApi.getPullRequestCommits(repoGuid, prId);

    return prCommits[0].commitId;
}
