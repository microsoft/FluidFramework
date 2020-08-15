import { getEntryStatsProcessor, getTotalSizeStatsProcessor, getBundleBuddyConfigProcessor } from '../statsProcessors';
import { FFXConstants } from './FFXConstants';

/**
 * The set of stats file processors we will run on bundles in the FFX repo
 */
export const FFXStatsProcessors = [
  getBundleBuddyConfigProcessor({
    metricNameProvider: (chunk) => `${chunk.name}.js <span title="Plus dependencies">ℹ</span>`
  }),
  getEntryStatsProcessor({ metricNameProvider: (chunkName) => `${chunkName}.js` }),
  getTotalSizeStatsProcessor({ metricName: FFXConstants.totalSizeMetricName })
];
