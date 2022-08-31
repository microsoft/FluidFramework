/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function handler(fileData, logger) {
    fileData.tests.forEach((testData) => {
        logger.send({
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "MemoryUsage",
            suiteName: fileData.suiteName,
            testName: testData.testName,
            heapUsedAvg: testData.testData.stats.mean,
            heapUsedStdDev: testData.testData.stats.deviation,
        });
    });
};
