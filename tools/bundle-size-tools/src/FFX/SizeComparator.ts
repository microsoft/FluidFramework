import { getBaselineCommit, getCiBuildWithCommit } from '../utilities';
import { getAzureDevopsApi } from './getAzureDevopsApi';
import { BuildStatus, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { FFXConstants } from './FFXConstants';
import { getZipObjectFromArtifact, getBundlePathsFromZipObject, getStatsFileFromZip } from './AdoArtifactFileProvider';
import {
  getBundlePathsFromFileSystem,
  getStatsFileFromFileSystem,
  getBundleBuddyConfigFromFileSystem
} from './FileSystemBundleFileProvider';
import { getBuildTagForCommit } from './getBuildTagForCommit';
import { getCommentForBundleDiff, getSimpleComment } from './getCommentForBundleDiff';
import { FFXStatsProcessors } from './FFXStatsProcessors';
import { compareBundles } from '../compareBundles';
import { join } from 'path';
import { getBundleSummaries } from './getBundleSummaries';
import { getBundleBuddyConfigMap } from './getBundleBuddyConfigMap';
import { WebApi } from 'azure-devops-node-api';

export interface ISizeComparator {
  /**
   * Create a size comparison message that can be posted to a PR
   * @param tagWaiting - If the build should be tagged to be updated when the baseline
   * build completes (if it wasn't already complete when the comparison runs)
   * @returns The size comparison message
   */
  createSizeComparisonMessage(tagWaiting: boolean): Promise<string>;
}

export class ADOSizeComparator implements ISizeComparator {
  constructor(
    private readonly adoConnection: WebApi,
    private readonly bundleReportPath: string,
    private readonly adoBuildId: number
  ) {}

  public async createSizeComparisonMessage(tagWaiting: boolean): Promise<string> {
    const baselineCommit = getBaselineCommit();
    console.log(`The baseline commit for this PR is ${baselineCommit}`);

    const baselineBuild = await getCiBuildWithCommit({
      adoConnection: this.adoConnection,
      commitHash: baselineCommit,
      adoProjectName: FFXConstants.projectName,
      buildDefinitionId: FFXConstants.ciBuildDefinitionId
    });

    // No baseline build
    if (!baselineBuild) {
      const message = `Could not find baseline build for CI ${baselineCommit}`;
      console.log(message);
      return message;
    }

    // Baseline build does not have id
    if (baselineBuild.id === undefined) {
      const message = `Baseline build does not have a build id`;
      console.log(message);
      return message;
    }

    // Baseline build is pending
    if (baselineBuild.status !== BuildStatus.Completed) {
      const message = getSimpleComment('Baseline build for this PR has not yet completed.', baselineCommit);
      console.log(message);

      if (tagWaiting) {
        this.tagBuildAsWaiting(baselineCommit);
      }

      return message;
    }

    // Baseline build failed
    if (baselineBuild.result !== BuildResult.Succeeded) {
      const message = getSimpleComment(
        'Baseline CI build failed, cannot generate bundle analysis at this time',
        baselineCommit
      );
      console.log(message);
      return message;
    }

    // Baseline build succeeded
    console.log(`Found baseline build with id: ${baselineBuild.id}`);
    const message = await this.createMessage(baselineCommit, baselineBuild.id);
    console.log(message);
    return message;
  }

  private async tagBuildAsWaiting(baselineCommit: string): Promise<void> {
    if (!this.adoBuildId) {
      console.log(
        'No ADO build ID was provided, we will not tag this build for follow up when the baseline build completes'
      );
    } else {
      // Tag the current build as waiting for the results of the master CI
      const buildApi = await this.adoConnection.getBuildApi();
      await buildApi.addBuildTag(FFXConstants.projectName, this.adoBuildId, getBuildTagForCommit(baselineCommit));
    }
  }

  private async createMessage(baselineCommit: string, baselineBuildId: number): Promise<string> {
    const baselineZip = await getZipObjectFromArtifact(this.adoConnection, baselineBuildId);
    const baselineZipBundlePaths = getBundlePathsFromZipObject(baselineZip);

    const prBundleFileSystemPaths = await getBundlePathsFromFileSystem(this.bundleReportPath);

    const configFileMap = await getBundleBuddyConfigMap({
      bundleFileData: prBundleFileSystemPaths,
      getBundleBuddyConfig: (relativePath) =>
        getBundleBuddyConfigFromFileSystem(join(this.bundleReportPath, relativePath))
    });

    const baselineSummaries = await getBundleSummaries({
      bundlePaths: baselineZipBundlePaths,
      getStatsFile: (relativePath) => getStatsFileFromZip(baselineZip, relativePath),
      getBundleBuddyConfigFile: (bundleName) => configFileMap.get(bundleName),
      statsProcessors: FFXStatsProcessors
    });

    const prSummaries = await getBundleSummaries({
      bundlePaths: prBundleFileSystemPaths,
      getStatsFile: (relativePath) => getStatsFileFromFileSystem(join(this.bundleReportPath, relativePath)),
      getBundleBuddyConfigFile: (bundleName) => configFileMap.get(bundleName),
      statsProcessors: FFXStatsProcessors
    });

    const bundleComparisons = compareBundles(baselineSummaries, prSummaries);

    console.log(JSON.stringify(bundleComparisons));

    const message = getCommentForBundleDiff(bundleComparisons, baselineCommit);
    return message;
  }
}
