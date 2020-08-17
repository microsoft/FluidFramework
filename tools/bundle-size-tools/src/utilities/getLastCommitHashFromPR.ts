/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebApi } from 'azure-devops-node-api';
import { Constants } from '../ADO/Constants';

/**
 * Fetches the last commit hash for a PR.
 */
export async function getLastCommitHashFromPR(adoConnection: WebApi, prId: number) {
  const gitApi = await adoConnection.getGitApi();
  const prCommits = await gitApi.getPullRequestCommits(Constants.projectRepoGuid, prId);

  return prCommits[0].commitId;
}
