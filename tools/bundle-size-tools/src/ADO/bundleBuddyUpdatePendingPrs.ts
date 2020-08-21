/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getAzureDevopsApi } from './getAzureDevopsApi';
import { Constants } from './Constants';
import { getBuildTagForCommit } from './getBuildTagForCommit';
import { getBuilds } from '../utilities/getBuilds';
import { DefaultStatsProcessors } from './DefaultStatsProcessors';
import { getCommentForBundleDiff } from './getCommentForBundleDiff';
import { prCommentsUtils } from './PrCommentsUtils';
import { compareBundles } from '../compareBundles';
import {
  getZipObjectFromArtifact,
  getBundlePathsFromZipObject,
  getBundleBuddyConfigFileFromZip,
  getStatsFileFromZip
} from './AdoArtifactFileProvider';
import { getBundlePathsFromFileSystem, getStatsFileFromFileSystem } from './FileSystemBundleFileProvider';
import { getBundleBuddyConfigMap } from './getBundleBuddyConfigMap';
import { getBundleSummaries } from './getBundleSummaries';
import { join } from 'path';
import { getLastCommitHashFromPR } from '../utilities';

/**
 * Updates all PR builds that completed before we had the relevant baseline available. Should be invoked by the CI upon making a new baseline available.
 * @param adoToken - A token that enables the CI to make ADO API calls
 * @param baselineCommitHash - The commit hash of baselines that are now available
 * @param baselineBundleReportPath - The path to the bundle report path for the baseline path, expected to already be on the machine running this
 */
export async function bundleBuddyUpdatePendingPrs(
  adoToken: string,
  baselineCommitHash: string,
  baselineBundleReportPath: string
) {
  console.log(`The baseline we are working with is for commit hash: ${baselineCommitHash}`);

  const adoConnection = getAzureDevopsApi(adoToken);

  // Tag that all PR builds waiting for baselines will contain
  const pendingBuildTag = getBuildTagForCommit(baselineCommitHash);

  // Get all PRs that were waiting for this baseline
  const pendingPrBuilds = await getBuilds(adoConnection, {
    project: Constants.projectName,
    definitions: [Constants.prBuildDefinitionId],
    tagFilters: [pendingBuildTag]
  });

  if (pendingPrBuilds.length === 0) {
    console.log('No PRs were dependent on this baseline, there is no work to be done');
    return;
  }

  // Get the bundle artifacts for all PRs
  const prArtifactZipFiles = await Promise.all(
    pendingPrBuilds.map((build) => getZipObjectFromArtifact(adoConnection, build.id!))
  );

  const baselineFilePaths = await getBundlePathsFromFileSystem(baselineBundleReportPath);

  const bundleComparisons = await Promise.all(
    prArtifactZipFiles.map(async (prArtifactZip) => {
      const prArtifactFilePaths = getBundlePathsFromZipObject(prArtifactZip);

      // Use the bundle buddy config files from the PR branch rather than main
      const configMap = await getBundleBuddyConfigMap({
        bundleFileData: prArtifactFilePaths,
        getBundleBuddyConfig: (relativePath) => getBundleBuddyConfigFileFromZip(prArtifactZip, relativePath)
      });

      const prSummaries = await getBundleSummaries({
        bundlePaths: prArtifactFilePaths,
        getStatsFile: (relativePath) => getStatsFileFromZip(prArtifactZip, relativePath),
        getBundleBuddyConfigFile: (bundleName) => configMap.get(bundleName),
        statsProcessors: DefaultStatsProcessors
      });

      const baselineSummaries = await getBundleSummaries({
        bundlePaths: baselineFilePaths,
        getStatsFile: (relativePath) => getStatsFileFromFileSystem(join(baselineBundleReportPath, relativePath)),
        getBundleBuddyConfigFile: (bundleName) => configMap.get(bundleName),
        statsProcessors: DefaultStatsProcessors
      });

      return compareBundles(baselineSummaries, prSummaries);
    })
  );

  console.log(JSON.stringify(bundleComparisons));

  const pendingComments = bundleComparisons.map(async (bundle, index) => {
    const build = pendingPrBuilds[index];
    const prId = Number(build.triggerInfo && build.triggerInfo['pr.number']) || undefined;

    if (!prId) {
      console.log('Pending build does not belong to a PR');
      return;
    }

    const message = getCommentForBundleDiff(bundle, baselineCommitHash);
    const prCommitHash = await getLastCommitHashFromPR(adoConnection, prId);

    // TODO: Reuse the ADO connection
    const prUtil = new prCommentsUtils(Constants.orgUrl, prId, Constants.projectRepoGuid, adoToken);
    return prUtil.createOrUpdateThread(message, `bundleBuddy-${prCommitHash}`);
  });

  await Promise.all(pendingComments.filter((p) => p !== undefined));

  const buildApi = await adoConnection.getBuildApi();
  // Remove the pending tag from all PRs
  await Promise.all(
    pendingPrBuilds.map((build) => buildApi.deleteBuildTag(Constants.projectName, build.id!, pendingBuildTag))
  );
}
