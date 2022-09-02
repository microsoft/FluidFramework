/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function handler(fileData, logger) {
    fileData.benchmarks.forEach((testData) => {
        logger.send({
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "ExecutionTime",
            suiteName: fileData.suiteName,
            benchmarkName: testData.benchmarkName,
            arithmeticMean: testData.stats.arithmeticMean,
            marginOfError: testData.stats.marginOfError,
        });
    });
};
