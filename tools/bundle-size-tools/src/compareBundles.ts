/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BundleSummaries, BundleComparison } from './BundleBuddyTypes';

/**
 * Compares all the bundle summaries for a "baseline" and a "compare" bundle.
 */
export function compareBundles(baseline: BundleSummaries, compare: BundleSummaries): BundleComparison[] {
  const results: BundleComparison[] = [];

  baseline.forEach((baselineBundle, bundleName) => {
    const compareBundle = compare.get(bundleName);

    if (!compareBundle) {
      console.log(`Baseline has bundle '${bundleName}' that does not appear in the comparison bundle `);
    } else {
      const bundleComparison: BundleComparison = { bundleName, commonBundleMetrics: {} };

      baselineBundle.forEach((baselineMetric, metricName) => {
        const compareMetric = compareBundle.get(metricName);

        if (!compareMetric) {
          console.log(
            `Baseline has metric '${metricName}' in bundle '${bundleName}' that does not exist in the comparison bundle'`
          );
        } else {
          bundleComparison.commonBundleMetrics[metricName] = { baseline: baselineMetric, compare: compareMetric };
        }
      });

      results.push(bundleComparison);
    }
  });

  return results;
}

/**
 * Checks if a bundle comparison contains no size changes
 * @param comparisons
 */
export function bundlesContainNoChanges(comparisons: BundleComparison[]): boolean {
  for (let i = 0; i < comparisons.length; i++) {
    const { commonBundleMetrics } = comparisons[i];
    let metrics = Object.entries(commonBundleMetrics);
    for (let j = 0; j < metrics.length; j++) {
      const [ , { baseline, compare }] = metrics[j];
      if (baseline.parsedSize !== compare.parsedSize) {
        return false;
      }
    }
  }

  return true;
}
