/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BundleFileData } from './getBundleFilePathsFromFolder';
import { runProcessorsOnStatsFile } from '../utilities/runProcessorOnStatsFile';
import { WebpackStatsProcessor, BundleBuddyConfig, BundleSummaries } from '../BundleBuddyTypes';
import { StatsCompilation } from 'webpack';

export interface GetBundleSummariesArgs {
  bundlePaths: BundleFileData[];

  statsProcessors: WebpackStatsProcessor[];

  getStatsFile: (relativePath: string) => Promise<StatsCompilation>;

  getBundleBuddyConfigFile: (
    bundleName: string
  ) => Promise<BundleBuddyConfig | undefined> | (BundleBuddyConfig | undefined);
}

export async function getBundleSummaries(args: GetBundleSummariesArgs): Promise<BundleSummaries> {
  const result: BundleSummaries = new Map();

  const pendingAsyncWork = args.bundlePaths.map(async (bundle) => {
    const [statsFile, bundleBuddyConfig] = await Promise.all([
      args.getStatsFile(bundle.relativePathToStatsFile),
      args.getBundleBuddyConfigFile(bundle.bundleName)
    ]);

    const bundleSummary = runProcessorsOnStatsFile(
      bundle.bundleName,
      statsFile!, // non-null assertion here needed to due TS bug. Stats file is never undefined here
      bundleBuddyConfig,
      args.statsProcessors
    );

    result.set(bundle.bundleName, bundleSummary);
  });

  await Promise.all(pendingAsyncWork);

  return result;
}
