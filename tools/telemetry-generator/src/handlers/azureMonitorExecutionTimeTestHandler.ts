/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function handler(fileData, logger) {
    fileData.benchmarks.forEach((testData) => {
        const arithmeticMeanMetricName = `performance_benchmark_executionTime_${fileData.suiteName}_${testData.benchmarkName}_arithmeticMean`;
        const marginOfErrorMetricName = `performance_benchmark_executionTime_${fileData.suiteName}_${testData.benchmarkName}_marginOfError`;

        // logger.send({
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "ExecutionTime",
        //     suiteName: fileData.suiteName,
        //     benchmarkName: testData.benchmarkName,
        //     arithmeticMean: testData.stats.arithmeticMean,
        //     marginOfError: testData.stats.marginOfError,
        // });

        logger.trackMetric({name: arithmeticMeanMetricName, value: testData.stats.arithmeticMean}, {
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "ExecutionTime",
            suiteName: fileData.suiteName,
            benchmarkName: testData.benchmarkName,
        });
        logger.trackMetric({name: marginOfErrorMetricName, value: testData.stats.marginOfError}, {
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "ExecutionTime",
            suiteName: fileData.suiteName,
            benchmarkName: testData.benchmarkName,
        });
    });
};
