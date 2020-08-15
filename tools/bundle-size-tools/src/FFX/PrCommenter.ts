import { getLastCommitHashFromPR } from '../utilities';
import { FFXConstants } from './FFXConstants';
import { prCommentsUtils } from '@ms/office-bohemia-build-tools/lib/azureDevops/prCommentsUtils';
import { WebApi } from 'azure-devops-node-api';

export interface IPRCommenter {
  post(message: string): Promise<void>;
}

export class ADOPRCommenter implements IPRCommenter {
  constructor(
    private readonly adoConnection: WebApi,
    private readonly adoToken: string,
    private readonly adoPrId: number
  ) {}

  public async post(message: string): Promise<void> {
    const prComments = new prCommentsUtils(
      FFXConstants.orgUrl,
      this.adoPrId,
      FFXConstants.projectRepoGuid,
      this.adoToken
    );

    // Used to tag and reuse the same PR message between builds
    const prCommitHash = await getLastCommitHashFromPR(this.adoConnection, this.adoPrId);

    await prComments.createOrUpdateThread(message, `bundleBuddy-${prCommitHash}`);
  }
}

export class GitHubPRCommenter implements IPRCommenter {
  constructor() {}

  public async post(message: string): Promise<void> {}
}
