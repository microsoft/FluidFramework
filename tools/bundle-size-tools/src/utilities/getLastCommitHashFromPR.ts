import { WebApi } from 'azure-devops-node-api';
import { FFXConstants } from '../FFX/FFXConstants';

/**
 * Fetches the last commit hash for a PR.
 */
export async function getLastCommitHashFromPR(adoConnection: WebApi, prId: number) {
  const gitApi = await adoConnection.getGitApi();
  const prCommits = await gitApi.getPullRequestCommits(FFXConstants.projectRepoGuid, prId);

  return prCommits[0].commitId;
}
