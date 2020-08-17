/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getEntryStatsProcessor, getTotalSizeStatsProcessor, getBundleBuddyConfigProcessor } from '../statsProcessors';
import { Constants } from './Constants';

/**
 * The set of stats file processors we will run on bundles
 */
export const DefaultStatsProcessors = [
  getBundleBuddyConfigProcessor({
    metricNameProvider: (chunk) => `${chunk.name}.js <span title="Plus dependencies">ℹ</span>`
  }),
  getEntryStatsProcessor({ metricNameProvider: (chunkName) => `${chunkName}.js` }),
  getTotalSizeStatsProcessor({ metricName: Constants.totalSizeMetricName })
];
