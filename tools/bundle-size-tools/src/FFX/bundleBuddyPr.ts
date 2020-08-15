/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getBaselineCommit, getLastCommitHashFromPR, getCiBuildWithCommit } from '../utilities';
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
import { prCommentsUtils } from '@ms/office-bohemia-build-tools/lib/azureDevops/prCommentsUtils';
import { getCommentForBundleDiff, getSimpleComment } from './getCommentForBundleDiff';
import { FFXStatsProcessors } from './FFXStatsProcessors';
import { compareBundles } from '../compareBundles';
import { join } from 'path';
import { getBundleSummaries } from './getBundleSummaries';
import { getBundleBuddyConfigMap } from './getBundleBuddyConfigMap';

export async function bundleBuddyPr(adoToken: string, bundleReportPath: string, adoBuildId: number, adoPrId: number) {
  const baselineCommit = getBaselineCommit();
  console.log(`The baseline commit for this PR is ${baselineCommit}`);

  const adoConnection = getAzureDevopsApi(adoToken);
  const prComments = new prCommentsUtils(FFXConstants.orgUrl, adoPrId, FFXConstants.projectRepoGuid, adoToken);

  const baselineBuild = await getCiBuildWithCommit({
    adoConnection,
    commitHash: baselineCommit,
    adoProjectName: FFXConstants.projectName,
    buildDefinitionId: FFXConstants.ciBuildDefinitionId
  });

  if (!baselineBuild) {
    console.log(`Could not find baseline build for CI ${baselineCommit}`);
    return;
  }

  // Used to tag and reuse the same PR message between builds
  const prCommitHash = await getLastCommitHashFromPR(adoConnection, adoPrId);

  if (baselineBuild.status !== BuildStatus.Completed) {
    const message = getSimpleComment('Baseline build for this PR has not yet completed.', baselineCommit);
    await prComments.createOrUpdateThread(message, `bundleBuddy-${prCommitHash}`);

    console.log(message);

    if (!adoBuildId) {
      console.log(
        'No ADO build ID was provided, we will not tag this build for follow up when the baseline build completes'
      );
      return;
    }

    // Tag the current build as waiting for the results of the master CI
    const buildApi = await adoConnection.getBuildApi();
    await buildApi.addBuildTag(FFXConstants.projectName, adoBuildId, getBuildTagForCommit(baselineCommit));
    return;
  }

  if (baselineBuild.result !== BuildResult.Succeeded) {
    const message = getSimpleComment(
      'Baseline CI build failed, cannot generate bundle analysis at this time',
      baselineCommit
    );

    await prComments.createOrUpdateThread(message, `bundleBuddy-${prCommitHash}`);
    console.log(message);
    return;
  }

  if (baselineBuild.id === undefined) {
    console.log(`Baseline build does not have a build id`);
    return;
  }

  console.log(`Found baseline build with id: ${baselineBuild.id}`);

  const baselineZip = await getZipObjectFromArtifact(adoConnection, baselineBuild.id);
  const baselineZipBundlePaths = getBundlePathsFromZipObject(baselineZip);

  const prBundleFileSystemPaths = await getBundlePathsFromFileSystem(bundleReportPath);

  const configFileMap = await getBundleBuddyConfigMap({
    bundleFileData: prBundleFileSystemPaths,
    getBundleBuddyConfig: (relativePath) => getBundleBuddyConfigFromFileSystem(join(bundleReportPath, relativePath))
  });

  const baselineSummaries = await getBundleSummaries({
    bundlePaths: baselineZipBundlePaths,
    getStatsFile: (relativePath) => getStatsFileFromZip(baselineZip, relativePath),
    getBundleBuddyConfigFile: (bundleName) => configFileMap.get(bundleName),
    statsProcessors: FFXStatsProcessors
  });

  const prSummaries = await getBundleSummaries({
    bundlePaths: prBundleFileSystemPaths,
    getStatsFile: (relativePath) => getStatsFileFromFileSystem(join(bundleReportPath, relativePath)),
    getBundleBuddyConfigFile: (bundleName) => configFileMap.get(bundleName),
    statsProcessors: FFXStatsProcessors
  });

  const bundleComparisons = compareBundles(baselineSummaries, prSummaries);

  console.log(JSON.stringify(bundleComparisons));

  const commentMessage = getCommentForBundleDiff(bundleComparisons, baselineCommit);
  await prComments.createOrUpdateThread(commentMessage, `bundleBuddy-${prCommitHash}`);
}
